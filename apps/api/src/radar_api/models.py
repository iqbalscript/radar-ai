"""SQLAlchemy persistence models for research studies and image slices."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
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
    image_asset_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, default=uuid4)
    z_position_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    study: Mapped[StudyRecord] = relationship(back_populates="slices")
