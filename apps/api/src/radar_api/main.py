from math import isclose
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from radar_api.contracts import CreateStudyRequest, Study, StudyAnalysisResponse
from radar_api.database import get_session
from radar_api.dicom_upload import UploadLimits, UploadTooLarge, stage_upload
from radar_api.dicom_validation import DicomValidationError, validate_ct_slice
from radar_api.models import ImageAssetRecord, StudyRecord, StudySliceRecord
from radar_api.storage import PrivateImageStore

app = FastAPI(
    title="RADAR AI API",
    description="Research prototype API for brain CT review assistance. Not for clinical use.",
    version="0.1.0",
)


@app.get("/health", tags=["operations"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": "research-prototype"}


@app.get("/v1/contracts/study-analysis", tags=["contracts"])
def study_analysis_contract() -> dict[str, object]:
    """Expose the versioned JSON Schema used by API and frontend workstreams."""

    return StudyAnalysisResponse.model_json_schema()


@app.post(
    "/v1/studies", response_model=Study, status_code=status.HTTP_201_CREATED, tags=["studies"]
)
def create_study(
    request: CreateStudyRequest, session: Session = Depends(get_session)
) -> StudyRecord:
    """Create an empty CT study record; DICOM upload is handled by a separate workstream."""

    study = StudyRecord(modality=request.modality, status="uploaded")
    session.add(study)
    session.commit()
    session.refresh(study)
    return study


@app.get("/v1/studies", response_model=list[Study], tags=["studies"])
def list_studies(session: Session = Depends(get_session)) -> list[StudyRecord]:
    """List study metadata without exposing patient identifiers or image contents."""

    statement = select(StudyRecord).options(selectinload(StudyRecord.slices)).order_by(
        StudyRecord.created_at.desc(), StudyRecord.study_id
    )
    return list(session.scalars(statement).all())


@app.get("/v1/studies/{study_id}", response_model=Study, tags=["studies"])
def get_study(study_id: UUID, session: Session = Depends(get_session)) -> StudyRecord:
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
        if len({item.study_instance_uid for item in validated}) != 1:
            raise DicomValidationError("DICOM files do not belong to the same study")
        if len({item.series_instance_uid for item in validated}) != 1:
            raise DicomValidationError("DICOM files do not belong to the same CT series")
        if len({item.sop_instance_uid for item in validated}) != len(validated):
            raise DicomValidationError("DICOM series contains duplicate image instances")
        if any(
            any(not isclose(left, right, abs_tol=1e-4) for left, right in zip(
                item.orientation, validated[0].orientation, strict=True
            ))
            for item in validated[1:]
        ):
            raise DicomValidationError("DICOM series image orientations do not match")
        if len({round(item.slice_position, 4) for item in validated}) != len(validated):
            raise DicomValidationError("DICOM series contains duplicate slice positions")

        ordered = sorted(
            zip(staged, validated, strict=True), key=lambda item: item[1].slice_position
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
