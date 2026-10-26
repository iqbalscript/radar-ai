from fastapi.testclient import TestClient

from radar_api.main import app

client = TestClient(app)


def test_health_check_returns_research_status() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "environment": "research-prototype"}


def test_contract_endpoint_exposes_study_analysis_schema() -> None:
    response = client.get("/v1/contracts/study-analysis")

    assert response.status_code == 200
    assert "Study" in response.json()["$defs"]
    assert "Finding" in response.json()["$defs"]
    assert "ModelVersion" in response.json()["$defs"]
