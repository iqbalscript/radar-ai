"""Group a flat DICOM CT folder into anonymized, position-sorted series folders."""

from __future__ import annotations

import argparse
import csv
import math
import os
import re
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from pydicom import dcmread
from pydicom.config import IGNORE, settings
from pydicom.errors import InvalidDicomError
from pydicom.uid import UID, CTImageStorage, EnhancedCTImageStorage

ANONYMIZED_ID = re.compile(r"ID_[0-9A-Fa-f]{8,12}\Z")
CT_STORAGE_CLASSES = {str(CTImageStorage), str(EnhancedCTImageStorage)}
SPLIT_NAMES = {"train", "test", "validation", "val"}


class SortError(ValueError):
    """A DICOM file or series cannot be safely grouped and ordered."""


@dataclass(frozen=True)
class Slice:
    path: Path
    split: str
    study_id: str
    series_id: str
    sop_id: str
    position: float | None
    z_position: float | None
    orientation: tuple[float, ...] | None
    instance_number: int | None
    rows: int
    columns: int


def _is_identifier(value: str) -> bool:
    return UID(value).is_valid or ANONYMIZED_ID.fullmatch(value) is not None


def _split_for(path: Path, source: Path) -> str:
    relative_parts = path.relative_to(source).parts[:-1]
    for part in relative_parts:
        if part.lower() in SPLIT_NAMES:
            return part.lower()
    return "all"


def _read_slice(path: Path, source: Path) -> Slice:
    try:
        dataset = dcmread(path, stop_before_pixels=True, force=False)
        modality = str(getattr(dataset, "Modality", "")).strip().upper()
        if modality != "CT":
            raise SortError("file is not tagged as CT")
        sop_class = str(getattr(dataset, "SOPClassUID", "")).strip()
        if sop_class not in CT_STORAGE_CLASSES:
            raise SortError("unsupported CT storage class")
        if int(getattr(dataset, "NumberOfFrames", 1)) != 1:
            raise SortError("multi-frame DICOM objects are not supported")

        study_id = str(getattr(dataset, "StudyInstanceUID", "")).strip()
        series_id = str(getattr(dataset, "SeriesInstanceUID", "")).strip()
        sop_id = str(getattr(dataset, "SOPInstanceUID", "")).strip()
        if not all(_is_identifier(value) for value in (study_id, series_id, sop_id)):
            raise SortError("Study/Series/SOP identifier is missing or unsupported")

        rows, columns = int(dataset.Rows), int(dataset.Columns)
        if rows <= 0 or columns <= 0:
            raise SortError("invalid image dimensions")

        has_position = "ImagePositionPatient" in dataset
        has_orientation = "ImageOrientationPatient" in dataset
        if has_position != has_orientation:
            raise SortError("incomplete slice geometry")
        position_value: float | None = None
        z_position: float | None = None
        orientation_value: tuple[float, ...] | None = None
        if has_position:
            position = tuple(float(value) for value in dataset.ImagePositionPatient)
            orientation_value = tuple(
                float(value) for value in dataset.ImageOrientationPatient
            )
            if len(position) != 3 or len(orientation_value) != 6:
                raise SortError("invalid slice geometry")
            if not all(math.isfinite(value) for value in (*position, *orientation_value)):
                raise SortError("non-finite slice geometry")
            row, column = orientation_value[:3], orientation_value[3:]
            row_norm = math.sqrt(sum(value * value for value in row))
            column_norm = math.sqrt(sum(value * value for value in column))
            dot = sum(left * right for left, right in zip(row, column, strict=True))
            if not math.isclose(row_norm, 1.0, abs_tol=1e-3) or not math.isclose(
                column_norm, 1.0, abs_tol=1e-3
            ) or not math.isclose(dot, 0.0, abs_tol=1e-3):
                raise SortError("invalid image orientation")
            normal = (
                row[1] * column[2] - row[2] * column[1],
                row[2] * column[0] - row[0] * column[2],
                row[0] * column[1] - row[1] * column[0],
            )
            position_value = sum(value * axis for value, axis in zip(position, normal, strict=True))
            z_position = position[2]

        instance_value: int | None = None
        raw_instance = str(getattr(dataset, "InstanceNumber", "")).strip()
        if raw_instance:
            instance_value = int(raw_instance)
        return Slice(
            path=path,
            split=_split_for(path, source),
            study_id=study_id,
            series_id=series_id,
            sop_id=sop_id,
            position=position_value,
            z_position=z_position,
            orientation=orientation_value,
            instance_number=instance_value,
            rows=rows,
            columns=columns,
        )
    except SortError:
        raise
    except (
        InvalidDicomError,
        OSError,
        EOFError,
        AttributeError,
        KeyError,
        TypeError,
        ValueError,
    ) as error:
        raise SortError("DICOM header is unreadable or incomplete") from error


def _order_group(slices: list[Slice]) -> list[Slice]:
    if len({item.sop_id for item in slices}) != len(slices):
        raise SortError("duplicate SOP identifiers")
    if len({(item.rows, item.columns) for item in slices}) != 1:
        raise SortError("inconsistent image dimensions")

    has_geometry = [item.position is not None for item in slices]
    if any(has_geometry) and not all(has_geometry):
        raise SortError("some slices are missing physical position")
    if all(has_geometry):
        reference = slices[0].orientation
        if reference is None or any(
            item.orientation is None
            or any(
                not math.isclose(left, right, abs_tol=1e-4)
                for left, right in zip(item.orientation, reference, strict=True)
            )
            for item in slices[1:]
        ):
            raise SortError("inconsistent image orientation")
        if len({round(item.position or 0.0, 4) for item in slices}) != len(slices):
            raise SortError("duplicate physical slice positions")
        return sorted(slices, key=lambda item: item.position or 0.0)

    if len(slices) == 1:
        return slices

    numbers = [item.instance_number for item in slices]
    if any(number is None for number in numbers) or len(set(numbers)) != len(numbers):
        raise SortError("no complete geometry or unique Instance Number for ordering")
    return sorted(slices, key=lambda item: item.instance_number or 0)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Folder containing DICOM files")
    parser.add_argument("--output", required=True, type=Path, help="New folder for sorted series")
    parser.add_argument(
        "--mode",
        choices=("hardlink", "copy"),
        default="hardlink",
        help="Hardlinks save disk space and require source/output on the same drive (default)",
    )
    args = parser.parse_args()
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_dir():
        parser.error("--input must be an existing folder")
    if output == source or source in output.parents:
        parser.error("--output must be outside the input folder")
    if output.exists():
        parser.error("--output must not already exist")

    # This dataset uses opaque ID_<hex> values in DICOM UI fields. They are only
    # read locally to group matching slices; they are never written to output.
    settings.reading_validation_mode = IGNORE
    paths = sorted(
        path for path in source.rglob("*") if path.is_file() and path.suffix.lower() == ".dcm"
    )
    if not paths:
        parser.error("No .dcm files were found under --input")

    groups: dict[tuple[str, str, str], list[Slice]] = defaultdict(list)
    errors: list[tuple[Path, str]] = []
    for path in paths:
        try:
            item = _read_slice(path, source)
            groups[(item.split, item.study_id, item.series_id)].append(item)
        except SortError as error:
            errors.append((path, str(error)))

    ordered_groups: list[tuple[tuple[str, str, str], list[Slice]]] = []
    for key, items in sorted(groups.items()):
        try:
            ordered_groups.append((key, _order_group(items)))
        except SortError as error:
            errors.extend((item.path, str(error)) for item in items)
    if errors:
        print(
            f"Found {len(errors)} files in invalid/incomplete groups; no output was written. "
            "Check DICOM metadata and rerun after fixing the source set.",
            file=sys.stderr,
        )
        return 2

    output.mkdir(parents=True)
    study_numbers: dict[tuple[str, str], int] = {}
    series_numbers: dict[tuple[str, str, str], int] = {}
    rows: list[dict[str, str | int | float]] = []
    next_study = 0
    next_series = 0
    try:
        for key, items in ordered_groups:
            split, study_id, series_id = key
            study_key = (split, study_id)
            if study_key not in study_numbers:
                next_study += 1
                study_numbers[study_key] = next_study
            series_numbers[key] = next_series = next_series + 1
            study_name = f"study_{study_numbers[study_key]:04d}"
            series_name = f"series_{series_numbers[key]:05d}"
            group_dir = output / split / study_name / series_name
            group_dir.mkdir(parents=True, exist_ok=True)
            for index, item in enumerate(items, start=1):
                output_name = f"slice_{index:04d}.dcm"
                output_path = group_dir / output_name
                if args.mode == "copy":
                    shutil.copy2(item.path, output_path)
                else:
                    os.link(item.path, output_path)
                rows.append(
                    {
                        "split": split,
                        "study_folder": study_name,
                        "series_folder": series_name,
                        "slice_index": index,
                        "z_position_mm": item.z_position if item.z_position is not None else "",
                        "source_relative_path": item.path.relative_to(source).as_posix(),
                        "output_relative_path": output_path.relative_to(output).as_posix(),
                    }
                )
        with (output / "manifest.csv").open("w", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    except BaseException:
        shutil.rmtree(output, ignore_errors=True)
        raise

    print(
        f"Organized {len(paths)} CT DICOM files into {len(ordered_groups)} series under {output}. "
        f"Original files were not modified; mode={args.mode}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
