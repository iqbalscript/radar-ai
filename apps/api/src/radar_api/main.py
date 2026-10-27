from io import BytesIO
from math import isclose
from uuid import UUID, uuid4

import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
from pydicom import dcmread
from pydicom.errors import InvalidDicomError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from radar_api.contracts import (
    CreateStudyRequest,
    FindingReviewEvent,
    FindingReviewRequest,
    Study,
    StudyAnalysisResponse,
    StudyLocalizations,
    StudyModelScores,
    StudySliceScore,
)
from radar_api.database import get_session
from radar_api.dicom_upload import UploadLimits, UploadTooLarge, stage_upload
from radar_api.dicom_validation import DicomValidationError, validate_ct_slice
from radar_api.inference_service import (
    ModelUnavailableError,
    StudyScoringError,
    score_local_checkpoint,
)
from radar_api.localization_service import (
    LocalizationInputError,
    LocalizationUnavailableError,
    localize_dicom_series,
)
from radar_api.models import (
    ImageAssetRecord,
    PersistedFindingRecord,
    ReviewEventRecord,
    StudyAnalysisRecord,
    StudyRecord,
    StudySliceRecord,
)
from radar_api.security import (
    Principal,
    SecurityAndRateLimitMiddleware,
    allowed_web_origins,
    is_auth_required,
    require_authenticated_principal,
)
from radar_api.storage import PrivateImageStore

load_dotenv()

# Guard against Pillow decompression bombs on malformed images.
Image.MAX_IMAGE_PIXELS = 16_777_216

app = FastAPI(
    title="RADAR AI API",
    description="Research prototype API for brain CT review assistance. Not for clinical use.",
    version="0.1.0",
)

app.add_middleware(SecurityAndRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_web_origins(),
    allow_credentials=False,
    allow_methods=["DELETE", "GET", "POST", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-API-Key",
        "X-Request-ID",
        "X-Requested-With",
    ],
    expose_headers=[
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "Retry-After",
    ],
)


@app.get("/health", tags=["operations"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": "research-prototype"}


@app.get("/v1/auth/me", tags=["security"])
def current_principal(
    principal: Principal = Depends(require_authenticated_principal),
) -> dict[str, object]:
    """Return the authenticated caller identity and active security enforcement mode."""

    return {
        "authenticated": principal.auth_method != "local_dev",
        "auth_required": is_auth_required(),
        "auth_method": principal.auth_method,
        "subject": principal.subject,
        "reviewer_id": principal.reviewer_id,
        "email": principal.email,
    }


@app.get("/v1/contracts/study-analysis", tags=["contracts"])
def study_analysis_contract() -> dict[str, object]:
    """Expose the versioned JSON Schema used by API and frontend workstreams."""

    return StudyAnalysisResponse.model_json_schema()


@app.post(
    "/v1/studies", response_model=Study, status_code=status.HTTP_201_CREATED, tags=["studies"]
)
def create_study(
    request: CreateStudyRequest,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> StudyRecord:
    """Create an empty CT study record; DICOM upload is handled by a separate workstream."""

    study = StudyRecord(modality=request.modality, status="uploaded")
    session.add(study)
    session.commit()
    session.refresh(study)
    return study


@app.get("/v1/studies", response_model=list[Study], tags=["studies"])
def list_studies(
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> list[StudyRecord]:
    """List study metadata without exposing patient identifiers or image contents."""

    statement = (
        select(StudyRecord)
        .options(selectinload(StudyRecord.slices))
        .order_by(StudyRecord.created_at.desc(), StudyRecord.study_id)
    )
    return list(session.scalars(statement).all())


@app.get("/v1/studies/{study_id}", response_model=Study, tags=["studies"])
def get_study(
    study_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> StudyRecord:
    """Fetch one study and its ordered slice metadata."""

    statement = (
        select(StudyRecord)
        .where(StudyRecord.study_id == study_id)
        .options(selectinload(StudyRecord.slices))
    )
    study = session.scalar(statement)
    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


@app.delete("/v1/studies/{study_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["studies"])
def delete_empty_study(
    study_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> Response:
    """Remove only an empty study record created by an upload that did not complete."""

    study = session.scalar(
        select(StudyRecord)
        .where(StudyRecord.study_id == study_id)
        .options(selectinload(StudyRecord.slices))
    )
    if study is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if study.slices:
        raise HTTPException(
            status_code=409,
            detail="A study with uploaded slices cannot be deleted",
        )
    session.delete(study)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/v1/studies/{study_id}/analysis",
    response_model=StudyAnalysisResponse,
    tags=["analysis"],
)
def get_study_analysis(
    study_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> dict:
    """Return persisted findings only; this endpoint never fabricates inference output."""

    study = session.scalar(
        select(StudyRecord)
        .where(StudyRecord.study_id == study_id)
        .options(selectinload(StudyRecord.slices))
    )
    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")
    analysis = session.scalar(
        select(StudyAnalysisRecord)
        .where(StudyAnalysisRecord.study_id == study_id)
        .options(selectinload(StudyAnalysisRecord.model_version))
        .order_by(StudyAnalysisRecord.created_at.desc(), StudyAnalysisRecord.analysis_id.desc())
        .limit(1)
    )
    if analysis is None:
        raise HTTPException(status_code=404, detail="No completed model analysis is available")
    findings = list(
        session.scalars(
            select(PersistedFindingRecord)
            .where(
                PersistedFindingRecord.study_id == study_id,
                PersistedFindingRecord.model_version_id == analysis.model_version_id,
            )
            .options(
                selectinload(PersistedFindingRecord.evidence),
                selectinload(PersistedFindingRecord.model_version),
            )
            .order_by(PersistedFindingRecord.finding_id)
        ).all()
    )
    model_version = analysis.model_version
    if any(not item.evidence for item in findings):
        raise HTTPException(
            status_code=409, detail="A finding is missing its required evidence slices"
        )
    study_slice_ids = {item.slice_id for item in study.slices}
    if any(
        link.slice_id not in study_slice_ids for finding in findings for link in finding.evidence
    ):
        raise HTTPException(
            status_code=409, detail="A finding references a slice outside its study"
        )
    return {
        "schema_version": "1.0.0",
        "study": study,
        "findings": [
            {
                "finding_id": item.finding_id,
                "category": item.category,
                "evidence_slice_ids": [link.slice_id for link in item.evidence],
                "confidence": item.confidence,
                "review_status": item.review_status,
                "model_version_id": item.model_version_id,
            }
            for item in findings
        ],
        "model_version": model_version,
    }


@app.get(
    "/v1/studies/{study_id}/scores",
    response_model=StudyModelScores,
    tags=["analysis"],
)
def get_study_model_scores(
    study_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> dict[str, object]:
    """Run the configured local binary checkpoint and return uncalibrated slice scores."""

    study = session.scalar(
        select(StudyRecord)
        .where(StudyRecord.study_id == study_id)
        .options(selectinload(StudyRecord.slices).selectinload(StudySliceRecord.image_asset))
    )
    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.slices:
        raise HTTPException(status_code=409, detail="Upload a CT series before requesting scores")

    store = PrivateImageStore()
    paths = [store.path_for(item.image_asset.storage_key) for item in study.slices]
    try:
        result = score_local_checkpoint(paths)
    except ModelUnavailableError as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "Local CT model unavailable. Configure RADAR_CT_CHECKPOINT and restart the API."
            ),
        ) from error
    except StudyScoringError as error:
        raise HTTPException(
            status_code=422,
            detail="Stored CT slices could not be scored by the configured model.",
        ) from error

    slice_scores = []
    for image_slice, model_score in zip(study.slices, result["slices"], strict=True):
        scores = model_score["scores"]
        slice_scores.append(
            StudySliceScore(
                slice_id=image_slice.slice_id,
                index=image_slice.index,
                class_0_score=float(scores["0"]),
                class_1_score=float(scores["1"]),
            )
        )
    return {
        "schema_version": "1.0.0",
        "study_id": study.study_id,
        "model_id": result["model_id"],
        "checkpoint_sha256": result["checkpoint_sha256"],
        "device": result["device"],
        "score_semantics": "Uncalibrated RSNA ICH slice-label scores; not a diagnosis",
        "class_1_label_semantics": (
            "RSNA ICH slice label 1 means hemorrhage annotated present; research score only"
        ),
        "slices": slice_scores,
    }


@app.get(
    "/v1/studies/{study_id}/localizations",
    response_model=StudyLocalizations,
    tags=["analysis"],
)
def get_study_localizations(
    study_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> dict[str, object]:
    """Return real bounding boxes derived from the configured pretrained ICH mask model."""
    study = session.scalar(
        select(StudyRecord)
        .where(StudyRecord.study_id == study_id)
        .options(selectinload(StudyRecord.slices).selectinload(StudySliceRecord.image_asset))
    )
    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")
    if not study.slices:
        raise HTTPException(status_code=409, detail="Upload a CT series before localization")

    store = PrivateImageStore()
    paths = tuple(str(store.path_for(item.image_asset.storage_key)) for item in study.slices)
    try:
        result = localize_dicom_series(paths)
    except LocalizationUnavailableError as error:
        raise HTTPException(
            status_code=503,
            detail=(
                "Pretrained lesion localization is unavailable. Configure the local SAMIHS "
                "model package and checkpoint, then restart the API."
            ),
        ) from error
    except LocalizationInputError as error:
        raise HTTPException(
            status_code=422,
            detail="Stored CT series does not meet the localizer input requirements.",
        ) from error

    localized_slices = []
    for image_slice, localization in zip(study.slices, result["slices"], strict=True):
        localized_slices.append(
            {
                "slice_id": image_slice.slice_id,
                "index": image_slice.index,
                "image_width": localization["image_width"],
                "image_height": localization["image_height"],
                "box": localization["box"],
                "mask_pixels": localization["mask_pixels"],
            }
        )
    return {
        "schema_version": "1.0.0",
        "study_id": study.study_id,
        "model_id": result["model_id"],
        "checkpoint_sha256": result["checkpoint_sha256"],
        "device": result["device"],
        "threshold": result["threshold"],
        "score_semantics": "SAMIHS binary ICH segmentation mask; research localization only",
        "slices": localized_slices,
    }


@app.post(
    "/v1/studies/{study_id}/findings/{finding_id}/review",
    response_model=FindingReviewEvent,
    status_code=status.HTTP_201_CREATED,
    tags=["review"],
)
def review_finding(
    study_id: UUID,
    finding_id: UUID,
    request: FindingReviewRequest,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_authenticated_principal),
) -> ReviewEventRecord:
    """Record one reviewer decision and preserve each decision in the audit log."""

    finding = session.scalar(
        select(PersistedFindingRecord).where(
            PersistedFindingRecord.finding_id == finding_id,
            PersistedFindingRecord.study_id == study_id,
        )
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    event = ReviewEventRecord(
        finding_id=finding_id,
        previous_review_status=finding.review_status,
        review_status=request.review_status,
        reviewer=principal.reviewer_id,
    )
    finding.review_status = request.review_status
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@app.get(
    "/v1/studies/{study_id}/findings/{finding_id}/reviews",
    response_model=list[FindingReviewEvent],
    tags=["review"],
)
def list_finding_reviews(
    study_id: UUID,
    finding_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> list[ReviewEventRecord]:
    finding = session.scalar(
        select(PersistedFindingRecord).where(
            PersistedFindingRecord.finding_id == finding_id,
            PersistedFindingRecord.study_id == study_id,
        )
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return list(
        session.scalars(
            select(ReviewEventRecord)
            .where(ReviewEventRecord.finding_id == finding_id)
            .order_by(ReviewEventRecord.created_at, ReviewEventRecord.review_event_id)
        ).all()
    )


@app.get("/v1/studies/{study_id}/slices/{slice_id}/image", tags=["studies"])
def get_slice_preview(
    study_id: UUID,
    slice_id: UUID,
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> Response:
    """Render one validated private CT slice as a non-cacheable PNG preview."""

    record = session.scalar(
        select(StudySliceRecord)
        .where(
            StudySliceRecord.study_id == study_id,
            StudySliceRecord.slice_id == slice_id,
        )
        .options(selectinload(StudySliceRecord.image_asset))
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Study slice not found")

    path = PrivateImageStore().path_for(record.image_asset.storage_key)
    try:
        dataset = dcmread(path, force=False)
        pixels = dataset.pixel_array.astype(np.float32)
        pixels = pixels * float(getattr(dataset, "RescaleSlope", 1)) + float(
            getattr(dataset, "RescaleIntercept", 0)
        )
        window_width = getattr(dataset, "WindowWidth", 80)
        window_center = getattr(dataset, "WindowCenter", 40)
        if not isinstance(window_width, (str, int, float)):
            window_width = window_width[0]
        if not isinstance(window_center, (str, int, float)):
            window_center = window_center[0]
        width = float(window_width)
        level = float(window_center)
        if width <= 0:
            raise ValueError("Invalid window width")
        low, high = level - width / 2, level + width / 2
        pixels = np.clip((pixels - low) / (high - low), 0, 1)
        if str(getattr(dataset, "PhotometricInterpretation", "")) == "MONOCHROME1":
            pixels = 1 - pixels
        image = Image.fromarray((pixels * 255).astype(np.uint8), mode="L")
        buffer = BytesIO()
        image.save(buffer, format="PNG", optimize=True)
    except (
        InvalidDicomError,
        OSError,
        AttributeError,
        IndexError,
        TypeError,
        ValueError,
        RuntimeError,
    ) as error:
        raise HTTPException(
            status_code=422, detail="Stored CT slice could not be rendered"
        ) from error
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.post(
    "/v1/studies/{study_id}/dicom",
    response_model=Study,
    status_code=status.HTTP_201_CREATED,
    tags=["studies"],
)
async def upload_dicom_series(
    study_id: UUID,
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_session),
    _principal: Principal = Depends(require_authenticated_principal),
) -> StudyRecord:
    """Validate and privately store one anonymized, single-frame CT series."""

    limits = UploadLimits.from_environment()
    if not files:
        raise HTTPException(status_code=422, detail="At least one DICOM image is required")
    if len(files) > limits.max_files:
        raise HTTPException(status_code=413, detail="DICOM series contains too many files")

    study = session.scalar(
        select(StudyRecord)
        .where(StudyRecord.study_id == study_id)
        .options(selectinload(StudyRecord.slices))
    )
    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")
    if study.slices:
        raise HTTPException(status_code=409, detail="Study already has an uploaded DICOM series")

    store = PrivateImageStore()
    staged = []
    published_keys: list[str] = []
    try:
        total_size = 0
        for upload in files:
            item = await stage_upload(
                upload,
                store,
                limits,
                already_staged_bytes=total_size,
            )
            staged.append(item)
            total_size += item.size_bytes

        validated = [validate_ct_slice(item.path, max_pixels=limits.max_pixels) for item in staged]
        if len(staged) > 1 and any(
            item.study_instance_uid is None
            or item.series_instance_uid is None
            or item.sop_instance_uid is None
            or item.slice_position is None
            or item.orientation is None
            for item in validated
        ):
            raise DicomValidationError(
                "These CT images lack series identifiers or slice geometry. "
                "Upload a single image as a one-slice study, or upload a series "
                "that includes its study, series, and position metadata."
            )
        if len({item.study_instance_uid for item in validated}) != 1:
            raise DicomValidationError("DICOM files do not belong to the same study")
        if len({item.series_instance_uid for item in validated}) != 1:
            raise DicomValidationError("DICOM files do not belong to the same CT series")
        if len({item.sop_instance_uid for item in validated}) != len(validated):
            raise DicomValidationError("DICOM series contains duplicate image instances")
        if any(
            any(
                not isclose(left, right, abs_tol=1e-4)
                for left, right in zip(item.orientation, validated[0].orientation, strict=True)
            )
            for item in validated[1:]
        ):
            raise DicomValidationError("DICOM series image orientations do not match")
        if all(item.slice_position is not None for item in validated) and len(
            {round(item.slice_position, 4) for item in validated if item.slice_position is not None}
        ) != len(validated):
            raise DicomValidationError("DICOM series contains duplicate slice positions")

        ordered = sorted(
            zip(staged, validated, strict=True),
            key=lambda item: item[1].slice_position if item[1].slice_position is not None else 0.0,
        )
        for index, (upload, metadata) in enumerate(ordered):
            asset_id = uuid4()
            storage_key = store.storage_key(study_id, asset_id)
            store.publish(upload.path, storage_key)
            published_keys.append(storage_key)
            session.add(
                ImageAssetRecord(
                    image_asset_id=asset_id,
                    storage_key=storage_key,
                    sha256=upload.sha256,
                    size_bytes=upload.size_bytes,
                )
            )
            study.slices.append(
                StudySliceRecord(
                    slice_id=uuid4(),
                    index=index,
                    image_asset_id=asset_id,
                    z_position_mm=metadata.z_position_mm,
                )
            )

        session.commit()
        return study
    except UploadTooLarge as error:
        session.rollback()
        for key in published_keys:
            store.delete(key)
        raise HTTPException(status_code=413, detail=str(error)) from error
    except DicomValidationError as error:
        session.rollback()
        for key in published_keys:
            store.delete(key)
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        session.rollback()
        for key in published_keys:
            store.delete(key)
        raise HTTPException(status_code=422, detail=str(error)) from error
    except BaseException:
        session.rollback()
        for key in published_keys:
            store.delete(key)
        raise
    finally:
        for item in staged:
            item.path.unlink(missing_ok=True)
        for upload in files:
            await upload.close()


