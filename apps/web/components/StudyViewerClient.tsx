"use client";

import { useState } from "react";
import Link from "next/link";
import type { FindingReviewStatus } from "@radar-ai/contracts";
import type { DemoStudyEntry } from "@/lib/demo-data";
import { ReviewStatusBadge, StudyStatusBadge } from "@/components/ClinicalBadge";
import { EmptyState } from "@/components/states/EmptyState";

export function StudyViewerClient({ studyEntry }: { studyEntry: DemoStudyEntry }) {
  const { study, findings, model_version, schema_version } = studyEntry.analysis;
  const slices = study.slices;

  // Default to the first evidence slice if present, otherwise slice 0
  const initialSliceIndex = (() => {
    const firstEvidenceId = findings[0]?.evidence_slice_ids[0];
    if (!firstEvidenceId) return 0;
    const foundIdx = slices.findIndex((s) => s.slice_id === firstEvidenceId);
    return foundIdx >= 0 ? foundIdx : 0;
  })();

  const [activeSliceIdx, setActiveSliceIdx] = useState<number>(initialSliceIndex);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [reviewStatuses, setReviewStatuses] = useState<Record<string, FindingReviewStatus>>(
    () =>
      Object.fromEntries(findings.map((f) => [f.finding_id, f.review_status]))
  );

  const currentSlice = slices[activeSliceIdx] ?? slices[0];
  const isEvidenceSlice = findings.some((f) =>
    f.evidence_slice_ids.includes(currentSlice?.slice_id ?? "")
  );

  const handleReviewChange = (findingId: string, nextStatus: FindingReviewStatus) => {
    setReviewStatuses((prev) => ({
      ...prev,
      [findingId]: nextStatus,
    }));
  };

  return (
    <div>
      {/* Breadcrumb & Header */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
        <Link
          href="/"
          style={{
            color: "var(--accent-primary-hover)",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}
        >
          ← Back to Triage Queue
        </Link>
      </nav>

      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              {studyEntry.code} • {studyEntry.seriesDescription}
            </h1>
            <StudyStatusBadge status={study.status} />
          </div>
          <p className="page-description" style={{ marginTop: 6 }}>
            Study UUID: <span className="mono">{study.study_id}</span> • Modality:{" "}
            <strong>{study.modality}</strong> • Schema: <span className="mono">v{schema_version}</span>
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`btn btn-sm ${showOverlay ? "btn-active" : ""}`}
            aria-pressed={showOverlay}
            onClick={() => setShowOverlay((prev) => !prev)}
          >
            {showOverlay ? "Hide AI Evidence Overlay" : "Show AI Evidence Overlay"}
          </button>
        </div>
      </div>

      <div className="viewer-layout">
        {/* Left Column: Axial CT Slice Viewport Skeleton */}
        <section
          className="ct-viewport-card"
          aria-label="Axial Brain CT Slice Viewport Placeholder"
        >
          <div className="panel-header" style={{ backgroundColor: "var(--bg-surface)" }}>
            <span className="panel-title">
              Axial Viewport Skeleton (Slice {activeSliceIdx + 1} of {slices.length})
            </span>
            {isEvidenceSlice ? (
              <span className="badge badge-danger">
                ★ Cited Evidence Slice (Z = {currentSlice?.z_position_mm ?? 0} mm)
              </span>
            ) : (
              <span className="badge badge-neutral">
                Standard Slice (Z = {currentSlice?.z_position_mm ?? 0} mm)
              </span>
            )}
          </div>

          <div className="ct-canvas-placeholder">
            <div className="ct-hud-overlay" aria-hidden="true">
              <div className="ct-hud-row">
                <div>
                  <div>RADAR AI PROTOTYPE VIEWPORT</div>
                  <div>MODALITY: {study.modality} (NON-CONTRAST CRANIAL)</div>
                  <div>WINDOW: BRAIN (W:80 L:40)</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>STUDY: {studyEntry.code}</div>
                  <div>SLICE IDX: {currentSlice?.index ?? 0}</div>
                  <div>Z-POS: {currentSlice?.z_position_mm ?? "N/A"} mm</div>
                </div>
              </div>

              <div className="ct-hud-row">
                <div>ASSET: {currentSlice?.image_asset_id}</div>
                <div>NOT FOR CLINICAL USE</div>
              </div>
            </div>

            {/* Simulated Cranial Axial Contour */}
            <div className="ct-axial-ring" role="img" aria-label="Simulated axial brain CT contour">
              {isEvidenceSlice && showOverlay && (
                <div
                  className="ct-highlight-marker"
                  title="Simulated Suspected ICH ROI Candidate"
                />
              )}
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.78rem",
                  padding: 16,
                }}
              >
                <div className="mono" style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                  SLICE #{currentSlice?.index ?? 0}
                </div>
                <div>Z: {currentSlice?.z_position_mm ?? 0} mm</div>
                {isEvidenceSlice && showOverlay && (
                  <div
                    style={{
                      marginTop: 8,
                      color: "var(--status-danger-text)",
                      fontWeight: 600,
                    }}
                  >
                    [AI ROI Candidate Flagged]
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Accessible Slice Scrubber */}
          <div className="slice-scrubber">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <label htmlFor="slice-range-input" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Scrub Axial Slices (0 – {slices.length - 1}):
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={activeSliceIdx <= 0}
                  onClick={() => setActiveSliceIdx((i) => Math.max(0, i - 1))}
                >
                  ← Prev Slice
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={activeSliceIdx >= slices.length - 1}
                  onClick={() => setActiveSliceIdx((i) => Math.min(slices.length - 1, i + 1))}
                >
                  Next Slice →
                </button>
              </div>
            </div>

            <input
              id="slice-range-input"
              type="range"
              min={0}
              max={Math.max(0, slices.length - 1)}
              value={activeSliceIdx}
              onChange={(e) => setActiveSliceIdx(Number(e.target.value))}
              aria-valuemin={0}
              aria-valuemax={Math.max(0, slices.length - 1)}
              aria-valuenow={activeSliceIdx}
              aria-valuetext={`Slice index ${currentSlice?.index ?? 0}, Z position ${
                currentSlice?.z_position_mm ?? 0
              } millimeters`}
              style={{ width: "100%", accentColor: "var(--accent-primary)" }}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {slices.map((s, idx) => {
                const cited = findings.some((f) => f.evidence_slice_ids.includes(s.slice_id));
                return (
                  <button
                    key={s.slice_id}
                    type="button"
                    onClick={() => setActiveSliceIdx(idx)}
                    className={`btn btn-sm ${idx === activeSliceIdx ? "btn-active" : ""}`}
                    aria-label={`Jump to slice ${s.index} (${s.z_position_mm} mm)${
                      cited ? ", cited as evidence" : ""
                    }`}
                  >
                    Slice {s.index} ({s.z_position_mm}mm) {cited ? "★" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Column: Findings & Human Review Panel */}
        <aside aria-label="AI Findings and Clinician Verification Panel">
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">AI Findings &amp; Human Review</h2>
              <span className="badge badge-neutral mono">{findings.length} finding(s)</span>
            </div>

            <div style={{ padding: 20 }}>
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                }}
              >
                <strong>Note:</strong> Confidence is an uncalibrated model score in{" "}
                <span className="mono">[0, 1]</span>. Every finding requires explicit clinician
                review.
              </p>

              {findings.length === 0 ? (
                <EmptyState
                  title="No Suspected ICH Flagged"
                  description="The model reported zero findings for this study. Human inspection of all slices is still required."
                />
              ) : (
                findings.map((finding) => {
                  const currentReview =
                    reviewStatuses[finding.finding_id] ?? finding.review_status;

                  return (
                    <div
                      key={finding.finding_id}
                      style={{
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--radius-sm)",
                        padding: 16,
                        marginBottom: 16,
                        backgroundColor: "rgba(30, 41, 59, 0.4)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span className="badge badge-danger">
                          suspected_intracranial_hemorrhage
                        </span>
                        <ReviewStatusBadge status={currentReview} />
                      </div>

                      <div style={{ fontSize: "0.85rem", marginBottom: 12 }}>
                        <div>
                          <strong>Model Score:</strong>{" "}
                          <span className="mono">{(finding.confidence * 100).toFixed(1)}%</span> (
                          {finding.confidence})
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                          Finding ID: <span className="mono">{finding.finding_id}</span>
                        </div>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            marginBottom: 6,
                          }}
                        >
                          Cited Evidence Slices ({finding.evidence_slice_ids.length}):
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {finding.evidence_slice_ids.map((sliceId) => {
                            const targetIdx = slices.findIndex((s) => s.slice_id === sliceId);
                            const targetSlice = slices[targetIdx];
                            return (
                              <button
                                key={sliceId}
                                type="button"
                                className="btn btn-sm"
                                onClick={() => {
                                  if (targetIdx >= 0) setActiveSliceIdx(targetIdx);
                                }}
                              >
                                Jump to Slice #{targetSlice?.index ?? "?"} (Z=
                                {targetSlice?.z_position_mm ?? "?"}mm)
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Clinician Action Controls */}
                      <fieldset
                        style={{
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                          margin: 0,
                        }}
                      >
                        <legend
                          style={{
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            padding: "0 6px",
                          }}
                        >
                          Set Clinician Review Status
                        </legend>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(["accepted", "rejected", "uncertain", "pending"] as const).map(
                            (statusOption) => (
                              <button
                                key={statusOption}
                                type="button"
                                className={`btn btn-sm ${
                                  currentReview === statusOption ? "btn-active" : ""
                                }`}
                                aria-pressed={currentReview === statusOption}
                                onClick={() =>
                                  handleReviewChange(finding.finding_id, statusOption)
                                }
                              >
                                {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
                              </button>
                            )
                          )}
                        </div>
                      </fieldset>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Model Provenance Card */}
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">Model Provenance (RDA-18 Contract)</h2>
            </div>
            <div style={{ padding: 20, fontSize: "0.84rem" }}>
              <dl
                style={{
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "130px 1fr",
                  rowGap: 8,
                }}
              >
                <dt style={{ color: "var(--text-muted)" }}>Provider:</dt>
                <dd className="mono" style={{ margin: 0 }}>
                  {model_version.provider}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>Model ID:</dt>
                <dd className="mono" style={{ margin: 0 }}>
                  {model_version.model_id}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>Prompt Version:</dt>
                <dd className="mono" style={{ margin: 0 }}>
                  {model_version.prompt_version}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>Version UUID:</dt>
                <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
                  {model_version.model_version_id}
                </dd>
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
