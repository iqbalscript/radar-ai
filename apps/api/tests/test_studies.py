from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from radar_api.database import Base, get_session
from radar_api.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def override_session() -> Generator[Session, None, None]:
    with TestSession() as session:
        yield session


app.dependency_overrides[get_session] = override_session
client = TestClient(app)


def setup_function() -> None:
    Base.metadata.create_all(bind=engine)


def teardown_function() -> None:
    Base.metadata.drop_all(bind=engine)


def test_create_and_read_study() -> None:
    created = client.post("/v1/studies", json={})

    assert created.status_code == 201
    study = created.json()
    assert study["modality"] == "CT"
    assert study["status"] == "uploaded"
    assert study["slices"] == []

    study_id = study["study_id"]
    assert client.get(f"/v1/studies/{study_id}").json() == study
    assert client.get("/v1/studies").json() == [study]


def test_create_study_rejects_patient_identifying_fields() -> None:
    response = client.post("/v1/studies", json={"patient_name": "Example Person"})

    assert response.status_code == 422


def test_unknown_study_returns_not_found() -> None:
    response = client.get("/v1/studies/00000000-0000-4000-8000-000000000001")

    assert response.status_code == 404
    assert response.json() == {"detail": "Study not found"}
