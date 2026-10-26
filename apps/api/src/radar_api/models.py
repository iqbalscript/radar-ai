"""SQLAlchemy persistence models for research studies and image slices."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from radar_api.database import Base


class StudyRecord(Base):
    __tablename__ = "studies"
    __table_args__ = (
        CheckConstraint("modality = 'CT'", name="ck_studies_modality_ct"),
        CheckConstraint(
            "status IN ('uploaded', 'processing', 'ready', 'failed')",
            name="ck_studies_status",
        ),
    )

    study_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    modality: Mapped[str] = mapped_column(String(8), nullable=False, default="CT")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="uploaded")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    slices: Mapped[list["StudySliceRecord"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", order_by="StudySliceRecord.index"
    )


class StudySliceRecord(Base):
    __tablename__ = "study_slices"
    __table_args__ = (
        CheckConstraint('"index" >= 0', name="ck_study_slices_index_nonnegative"),
        UniqueConstraint("study_id", "index", name="uq_study_slices_study_index"),
    )

    slice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    study_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("studies.study_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    image_asset_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("image_assets.image_asset_id", ondelete="CASCADE"),
        nullable=False,
    )
    z_position_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    study: Mapped[StudyRecord] = relationship(back_populates="slices")
    image_asset: Mapped["ImageAssetRecord"] = relationship(back_populates="slices")


class ImageAssetRecord(Base):
    __tablename__ = "image_assets"
    __table_args__ = (CheckConstraint("size_bytes > 0", name="ck_image_assets_size_positive"),)

    image_asset_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    storage_key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    slices: Mapped[list[StudySliceRecord]] = relationship(back_populates="image_asset")


class ModelVersionRecord(Base):
    __tablename__ = "model_versions"

    model_version_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model_id: Mapped[str] = mapped_column(String(160), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    findings: Mapped[list["PersistedFindingRecord"]] = relationship(back_populates="model_version")
    analyses: Mapped[list["StudyAnalysisRecord"]] = relationship(back_populates="model_version")


class StudyAnalysisRecord(Base):
    __tablename__ = "study_analyses"

    analysis_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    study_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("studies.study_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model_version_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("model_versions.model_version_id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    model_version: Mapped[ModelVersionRecord] = relationship(back_populates="analyses")


class PersistedFindingRecord(Base):
    __tablename__ = "findings"
    __table_args__ = (
        CheckConstraint(
            "category = 'suspected_intracranial_hemorrhage'", name="ck_findings_category"
        ),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_findings_confidence"),
        CheckConstraint(
            "review_status IN ('pending', 'accepted', 'rejected', 'uncertain')",
            name="ck_findings_review_status",
        ),
    )

    finding_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    study_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("studies.study_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    review_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    model_version_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("model_versions.model_version_id"), nullable=False
    )
    model_version: Mapped[ModelVersionRecord] = relationship(back_populates="findings")
    evidence: Mapped[list["FindingEvidenceRecord"]] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
        order_by="FindingEvidenceRecord.slice_id",
    )


class FindingEvidenceRecord(Base):
    __tablename__ = "finding_evidence"
    __table_args__ = (UniqueConstraint("finding_id", "slice_id", name="uq_finding_evidence"),)

    evidence_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    finding_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("findings.finding_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slice_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("study_slices.slice_id", ondelete="CASCADE"), nullable=False
    )
    finding: Mapped[PersistedFindingRecord] = relationship(back_populates="evidence")


class ReviewEventRecord(Base):
    __tablename__ = "finding_review_events"
    __table_args__ = (
        CheckConstraint(
            "review_status IN ('accepted', 'rejected', 'uncertain')",
            name="ck_review_events_status",
        ),
    )

    review_event_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    finding_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("findings.finding_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_status: Mapped[str] = mapped_column(String(16), nullable=False)
    previous_review_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reviewer: Mapped[str] = mapped_column(String(64), nullable=False, default="local-reviewer")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
