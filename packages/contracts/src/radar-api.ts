/** Shared response contract v1.0.0. Research prototype only; not for clinical use. */

export type StudyStatus = "uploaded" | "processing" | "ready" | "failed";
export type FindingReviewStatus = "pending" | "accepted" | "rejected" | "uncertain";

export interface StudySlice {
  slice_id: string;
  index: number;
  image_asset_id: string;
  z_position_mm: number | null;
}

export interface Study {
  study_id: string;
  modality: "CT";
  status: StudyStatus;
  slices: StudySlice[];
}

export interface CreateStudyRequest {
  modality?: "CT";
}

export interface ModelVersion {
  model_version_id: string;
  provider: "meta_model_api" | "approved_alternate" | "demo_fixture";
  model_id: string;
  prompt_version: string;
}

export interface Finding {
  finding_id: string;
  category: "suspected_intracranial_hemorrhage";
  evidence_slice_ids: string[];
  confidence: number;
  review_status: FindingReviewStatus;
  model_version_id: string;
}

export interface StudyAnalysisResponse {
  schema_version: "1.0.0";
  study: Study;
  findings: Finding[];
  model_version: ModelVersion;
}

export interface StudySliceScore {
  slice_id: string;
  index: number;
  class_0_score: number;
  class_1_score: number;
}

export interface StudyModelScores {
  schema_version: "1.0.0";
  study_id: string;
  model_id: string;
  checkpoint_sha256: string;
  device: string;
  score_semantics: "Uncalibrated RSNA ICH slice-label scores; not a diagnosis";
  class_1_label_semantics: "RSNA ICH slice label 1 means hemorrhage annotated present; research score only";
  slices: StudySliceScore[];
}

