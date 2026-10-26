from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from radar_api.contracts import CreateStudyRequest, Study, StudyAnalysisResponse
from radar_api.database import get_session
from radar_api.models import StudyRecord

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
