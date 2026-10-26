from uuid import UUID

import pytest
from pydantic import ValidationError

from radar_api.contracts import Finding, ModelVersion, Study, StudyAnalysisResponse, StudySlice


STUDY_ID = UUID("00000000-0000-4000-8000-000000000001")
SLICE_ID = UUID("00000000-0000-4000-8000-000000000002")
IMAGE_ID = UUID("00000000-0000-4000-8000-000000000003")
MODEL_VERSION_ID = UUID("00000000-0000-4000-8000-000000000004")
FINDING_ID = UUID("00000000-0000-4000-8000-000000000005")


def example_response() -> StudyAnalysisResponse:
    return StudyAnalysisResponse(
        study=Study(
            study_id=STUDY_ID,
            modality="CT",
            status="ready",
            slices=[
                StudySlice(
                    slice_id=SLICE_ID,
                    index=0,
                    image_asset_id=IMAGE_ID,
                    z_position_mm=1.5,
                )
            ],
        ),
        findings=[
            Finding(
                finding_id=FINDING_ID,
                category="suspected_intracranial_hemorrhage",
                evidence_slice_ids=[SLICE_ID],
                confidence=0.25,
                model_version_id=MODEL_VERSION_ID,
            )
        ],
        model_version=ModelVersion(
            model_version_id=MODEL_VERSION_ID,
            provider="meta_model_api",
            model_id="muse-spark-1.3",
            prompt_version="radar-findings-v1",
        ),
    )


def test_study_analysis_contract_serializes_versioned_typed_response() -> None:
    response = example_response().model_dump(mode="json")

    assert response["schema_version"] == "1.0.0"
    assert response["study"]["modality"] == "CT"
    assert response["findings"][0]["evidence_slice_ids"] == [str(SLICE_ID)]
    assert response["findings"][0]["review_status"] == "pending"
    assert response["model_version"]["model_id"] == "muse-spark-1.3"


@pytest.mark.parametrize("confidence", [-0.01, 1.01])
def test_finding_rejects_confidence_outside_unit_interval(confidence: float) -> None:
    with pytest.raises(ValidationError):
        Finding(
            finding_id=FINDING_ID,
            category="suspected_intracranial_hemorrhage",
            evidence_slice_ids=[SLICE_ID],
            confidence=confidence,
            model_version_id=MODEL_VERSION_ID,
        )


def test_contract_json_schema_contains_expected_types() -> None:
    schema = StudyAnalysisResponse.model_json_schema()

    assert "Study" in schema["$defs"]
    assert "StudySlice" in schema["$defs"]
    assert "Finding" in schema["$defs"]
    assert "ModelVersion" in schema["$defs"]
