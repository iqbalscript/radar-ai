"""Validation for one anonymized, single-frame CT series."""

from dataclasses import dataclass
from math import isclose, sqrt
from pathlib import Path

import numpy as np
from pydicom import dcmread
from pydicom.dataset import FileDataset
from pydicom.errors import InvalidDicomError
from pydicom.uid import UID, CTImageStorage, EnhancedCTImageStorage


class DicomValidationError(ValueError):
    """A safe, user-facing DICOM validation failure."""


@dataclass(frozen=True)
class ValidatedDicom:
    study_instance_uid: str
    series_instance_uid: str
    sop_instance_uid: str
    slice_position: float
    z_position_mm: float
    orientation: tuple[float, ...]


IDENTIFYING_KEYWORDS = frozenset(
    {
        "PatientName",
        "PatientID",
        "PatientBirthDate",
        "PatientBirthTime",
        "PatientAddress",
        "PatientTelephoneNumbers",
        "OtherPatientIDs",
        "OtherPatientNames",
        "MedicalRecordLocator",
        "AccessionNumber",
        "InstitutionName",
        "InstitutionAddress",
        "ReferringPhysicianName",
        "PerformingPhysicianName",
        "PhysiciansOfRecord",
        "NameOfPhysiciansReadingStudy",
        "OperatorsName",
        "StudyID",
        "RequestingPhysician",
        "RequestingService",
        "StudyDescription",
        "SeriesDescription",
        "ProtocolName",
        "DeviceSerialNumber",
        "StationName",
        "ImageComments",
        "PatientComments",
        "PerformedProcedureStepID",
        "PerformedProcedureStepDescription",
        "InstitutionalDepartmentName",
        "IssuerOfPatientID",
        "IssuerOfAccessionNumberSequence",
        "ClinicalTrialSiteName",
        "ClinicalTrialSiteID",
    }
)
CT_STORAGE_CLASSES = {str(CTImageStorage), str(EnhancedCTImageStorage)}


def _required_uid(dataset: FileDataset, keyword: str) -> str:
    value = str(getattr(dataset, keyword, "")).strip()
    if not value or not UID(value).is_valid:
        raise DicomValidationError("DICOM series is missing valid required identifiers")
    return value


def _has_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, (list, tuple)):
        return any(_has_value(item) for item in value)
    return bool(str(value).strip())


def _position_and_normal(
    dataset: FileDataset,
) -> tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]]:
    try:
        position = tuple(float(value) for value in dataset.ImagePositionPatient)
        orientation = tuple(float(value) for value in dataset.ImageOrientationPatient)
    except (AttributeError, TypeError, ValueError) as error:
        raise DicomValidationError("DICOM image geometry is incomplete") from error

    if len(position) != 3 or len(orientation) != 6:
        raise DicomValidationError("DICOM image geometry is invalid")

    row, column = orientation[:3], orientation[3:]
    row_norm = sqrt(sum(value * value for value in row))
    column_norm = sqrt(sum(value * value for value in column))
    dot_product = sum(left * right for left, right in zip(row, column))
    if not isclose(row_norm, 1.0, abs_tol=1e-3) or not isclose(
        column_norm, 1.0, abs_tol=1e-3
    ) or not isclose(dot_product, 0.0, abs_tol=1e-3):
        raise DicomValidationError("DICOM image orientation is invalid")

    normal = (
        row[1] * column[2] - row[2] * column[1],
        row[2] * column[0] - row[0] * column[2],
        row[0] * column[1] - row[1] * column[0],
    )
    return position, normal, orientation


def validate_ct_slice(path: Path, *, max_pixels: int) -> ValidatedDicom:
    """Read and validate one DICOM CT image without returning its PHI or UIDs to clients."""

    try:
        dataset = dcmread(path, force=False)
        if not isinstance(dataset, FileDataset) or not dataset.file_meta:
            raise DicomValidationError("Upload must be a DICOM Part 10 image")

        if str(getattr(dataset, "Modality", "")).upper() != "CT":
            raise DicomValidationError("Only CT images are accepted")
        sop_class_uid = _required_uid(dataset, "SOPClassUID")
        if sop_class_uid not in CT_STORAGE_CLASSES:
            raise DicomValidationError("DICOM object is not a supported CT image")

        media_sop_class = str(
            getattr(dataset.file_meta, "MediaStorageSOPClassUID", "")
        ).strip()
        media_sop_instance = str(
            getattr(dataset.file_meta, "MediaStorageSOPInstanceUID", "")
        ).strip()
        transfer_syntax = str(getattr(dataset.file_meta, "TransferSyntaxUID", "")).strip()
        if (
            media_sop_class != sop_class_uid
            or media_sop_instance != _required_uid(dataset, "SOPInstanceUID")
            or not transfer_syntax
            or not UID(transfer_syntax).is_valid
        ):
            raise DicomValidationError("DICOM file metadata does not match the image")

        for element in dataset.iterall():
            if element.tag.is_private and _has_value(element.value):
                raise DicomValidationError("DICOM private metadata must be removed before upload")
            if element.keyword in IDENTIFYING_KEYWORDS and _has_value(element.value):
                raise DicomValidationError(
                    "DICOM contains identifying metadata; upload an anonymized series"
                )

        if (
            "PatientIdentityRemoved" in dataset
            and str(dataset.PatientIdentityRemoved).upper() != "YES"
        ):
            raise DicomValidationError("DICOM de-identification metadata is not valid")

        study_uid = _required_uid(dataset, "StudyInstanceUID")
        series_uid = _required_uid(dataset, "SeriesInstanceUID")
        sop_uid = _required_uid(dataset, "SOPInstanceUID")
        rows, columns = int(dataset.Rows), int(dataset.Columns)
        if rows <= 0 or columns <= 0 or rows * columns > max_pixels:
            raise DicomValidationError("DICOM image dimensions exceed the supported limit")
        if int(getattr(dataset, "SamplesPerPixel", 1)) != 1:
            raise DicomValidationError("Only single-channel CT images are accepted")
        if str(getattr(dataset, "PhotometricInterpretation", "")) not in {
            "MONOCHROME1",
            "MONOCHROME2",
        }:
            raise DicomValidationError("DICOM CT pixel interpretation is invalid")
        if int(getattr(dataset, "NumberOfFrames", 1)) != 1 or "PixelData" not in dataset:
            raise DicomValidationError("Each DICOM file must contain one complete image slice")

        pixels = dataset.pixel_array
        if not isinstance(pixels, np.ndarray) or pixels.shape != (rows, columns):
            raise DicomValidationError("DICOM pixel data is incomplete or invalid")

        position, normal, orientation = _position_and_normal(dataset)
        slice_position = sum(value * axis for value, axis in zip(position, normal))
        return ValidatedDicom(
            study_instance_uid=study_uid,
            series_instance_uid=series_uid,
            sop_instance_uid=sop_uid,
            slice_position=slice_position,
            z_position_mm=position[2],
            orientation=orientation,
        )
    except DicomValidationError:
        raise
    except (
        InvalidDicomError,
        OSError,
        EOFError,
        AttributeError,
        KeyError,
        TypeError,
        ValueError,
        NotImplementedError,
        RuntimeError,
    ) as error:
        raise DicomValidationError("DICOM file is corrupted or cannot be decoded") from error
