from fastapi.testclient import TestClient

from radar_api.main import app

client = TestClient(app)


def test_health_check_returns_research_status() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "environment": "research-prototype"}
