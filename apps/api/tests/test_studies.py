from collections.abc import Generator
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import (
    PYDICOM_IMPLEMENTATION_UID,
    CTImageStorage,
    ExplicitVRLittleEndian,
    generate_uid,
)
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from radar_api.database import Base, get_session
from radar_api.main import app
from radar_api.models import ImageAssetRecord
from radar_api.storage import PrivateImageStore

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


def make_ct_dicom(
    *,
    z_position: float = 0,
    modality: str = "CT",
    patient_name: str = "",
    study_uid: str | None = None,
    series_uid: str | None = None,
) -> bytes:
    study_uid = study_uid or generate_uid()
    series_uid = series_uid or generate_uid()
    sop_uid = generate_uid()
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = CTImageStorage
    file_meta.MediaStorageSOPInstanceUID = sop_uid
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = PYDICOM_IMPLEMENTATION_UID
    dataset = FileDataset("", {}, file_meta=file_meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = CTImageStorage
    dataset.SOPInstanceUID = sop_uid
    dataset.StudyInstanceUID = study_uid
    dataset.SeriesInstanceUID = series_uid
    dataset.Modality = modality
    dataset.PatientIdentityRemoved = "YES"
    dataset.PatientName = patient_name
    dataset.Rows = 2
    dataset.Columns = 2
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.ImagePositionPatient = [0, 0, z_position]
    dataset.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    dataset.PixelData = b"\x01\x00\x02\x00\x03\x00\x04\x00"
    buffer = BytesIO()
    dataset.save_as(buffer, enforce_file_format=True)
    return buffer.getvalue()


def create_study() -> str:
    response = client.post("/v1/studies", json={})
    assert response.status_code == 201
    return response.json()["study_id"]


def test_upload_accepts_anonymized_ct_series_and_stores_privately(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    storage_root = tmp_path / "private"
    monkeypatch.setenv("RADAR_STORAGE_DIR", str(storage_root))
    study_id = create_study()
    series_study_uid = generate_uid()
    series_uid = generate_uid()
    first = make_ct_dicom(z_position=5, study_uid=series_study_uid, series_uid=series_uid)
    second = make_ct_dicom(z_position=1, study_uid=series_study_uid, series_uid=series_uid)

    response = client.post(
        f"/v1/studies/{study_id}/dicom",
        files=[
            ("files", ("../../first.dcm", first, "application/dicom")),
            ("files", ("second.dcm", second, "application/dicom")),
        ],
    )

    assert response.status_code == 201
    result = response.json()
    assert [item["index"] for item in result["slices"]] == [0, 1]
    assert [item["z_position_mm"] for item in result["slices"]] == [1.0, 5.0]
    assert "storage_key" not in response.text
    assert "first.dcm" not in response.text

    with TestSession() as session:
        assets = list(session.scalars(select(ImageAssetRecord)).all())
    assert len(assets) == 2
    store = PrivateImageStore(storage_root)
    stored_paths = [store.path_for(asset.storage_key) for asset in assets]
    assert all(
        path.is_relative_to(storage_root.resolve()) and path.is_file() for path in stored_paths
    )
    assert {path.read_bytes() for path in stored_paths} == {first, second}


@pytest.mark.parametrize(
    ("payload", "filename", "detail"),
    [
        (b"not a DICOM file", "image.dcm", "DICOM file is corrupted or cannot be decoded"),
        (
            None,
            "patient.dcm",
            "DICOM contains identifying metadata; upload an anonymized series",
        ),
    ],
)
def test_upload_rejects_corrupt_and_identifiable_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    payload: bytes | None,
    filename: str,
    detail: str,
) -> None:
    monkeypatch.setenv("RADAR_STORAGE_DIR", str(tmp_path / "private"))
    study_id = create_study()
    if payload is None:
        payload = make_ct_dicom(patient_name="Example^Person")

    response = client.post(
        f"/v1/studies/{study_id}/dicom",
        files={"files": (filename, payload, "application/dicom")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == detail
    assert client.get(f"/v1/studies/{study_id}").json()["slices"] == []


def test_upload_rejects_non_ct_series(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RADAR_STORAGE_DIR", str(tmp_path / "private"))
    study_id = create_study()
    response = client.post(
        f"/v1/studies/{study_id}/dicom",
        files={"files": ("image.dcm", make_ct_dicom(modality="MR"), "application/dicom")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Only CT images are accepted"


def test_upload_rejects_files_from_different_series(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("RADAR_STORAGE_DIR", str(tmp_path / "private"))
    study_id = create_study()
    series_study_uid = generate_uid()
    response = client.post(
        f"/v1/studies/{study_id}/dicom",
        files=[
            (
                "files",
                (
                    "first.dcm",
                    make_ct_dicom(
                        z_position=0,
                        study_uid=series_study_uid,
                        series_uid=generate_uid(),
                    ),
                    "application/dicom",
                ),
            ),
            (
                "files",
                (
                    "second.dcm",
                    make_ct_dicom(
                        z_position=1,
                        study_uid=series_study_uid,
                        series_uid=generate_uid(),
                    ),
                    "application/dicom",
                ),
            ),
        ],
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "DICOM files do not belong to the same CT series"
    assert client.get(f"/v1/studies/{study_id}").json()["slices"] == []


def test_upload_enforces_size_limit_and_cleans_temporary_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage_root = tmp_path / "private"
    monkeypatch.setenv("RADAR_STORAGE_DIR", str(storage_root))
    monkeypatch.setenv("RADAR_MAX_DICOM_FILE_BYTES", "10")
    study_id = create_study()

    response = client.post(
        f"/v1/studies/{study_id}/dicom",
        files={"files": ("large.dcm", make_ct_dicom(), "application/dicom")},
    )

    assert response.status_code == 413
    assert not list(storage_root.glob("incoming-*.tmp"))
    assert client.get(f"/v1/studies/{study_id}").json()["slices"] == []


def test_private_store_rejects_path_traversal(tmp_path: Path) -> None:
    store = PrivateImageStore(tmp_path / "private")

    with pytest.raises(ValueError, match="outside the private root"):
        store.path_for("../public/image.dcm")
