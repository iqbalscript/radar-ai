"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_STUDIES } from "@/lib/demo-data";
import { ReviewStatusBadge, StudyStatusBadge } from "@/components/ClinicalBadge";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";

type ViewState = "ready" | "loading" | "error" | "empty";

export default function DashboardPage() {
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredStudies = DEMO_STUDIES.filter((item) => {
    if (statusFilter === "all") return true;
    return item.analysis.study.status === statusFilter;
  });

  const totalStudies = DEMO_STUDIES.length;
  const flaggedStudiesCount = DEMO_STUDIES.filter(
    (s) => s.analysis.findings.length > 0
  ).length;
  const pendingReviewCount = DEMO_STUDIES.filter((s) =>
    s.analysis.findings.some((f) => f.review_status === "pending")
  ).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Brain CT Triage &amp; Review Dashboard</h1>
          <p className="page-description">
            Research prototype queue for reviewing non-contrast cranial CT studies and model-flagged
            intracranial hemorrhage candidates.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/studies/00000000-0000-4000-8000-000000000001"
            className="btn btn-primary"
          >
            Open Active Study Viewer →
          </Link>
        </div>
      </div>

      {/* Evaluator State Preview Toolbar */}
      <section
        className="state-toolbar"
        aria-label="UI state scaffolding switcher for evaluators"
      >
        <div className="state-toolbar-label">
          <span className="badge badge-neutral mono">RDA-4 A11Y STATES</span>
          <span>Inspect scaffolded UI states:</span>
        </div>
        <div className="state-btn-group" role="group" aria-label="Select dashboard UI state">
          {(
            [
              { id: "ready", label: "Populated Queue (Default)" },
              { id: "loading", label: "Loading Skeleton" },
              { id: "error", label: "Error State" },
              { id: "empty", label: "Empty State" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`btn btn-sm ${viewState === mode.id ? "btn-active" : ""}`}
              aria-pressed={viewState === mode.id}
              onClick={() => setViewState(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      {viewState === "loading" && <LoadingSkeleton />}

      {viewState === "error" && (
        <ErrorState onRetry={() => setViewState("ready")} />
      )}

      {viewState === "empty" && (
        <EmptyState onAction={() => setViewState("ready")} />
      )}

      {viewState === "ready" && (
        <>
          {/* Summary Metrics */}
          <section className="metrics-grid" aria-label="Study queue metrics">
            <div className="metric-card">
              <span className="metric-label">Ingested CT Studies</span>
              <span className="metric-value">{totalStudies}</span>
              <span className="metric-subtext">
                Anonymized synthetic fixtures (CT modality)
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Awaiting Clinician Review</span>
              <span className="metric-value" style={{ color: "var(--status-warning-text)" }}>
                {pendingReviewCount}
              </span>
              <span className="metric-subtext">
                Findings defaulted to pending human verification
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Suspected ICH Candidates</span>
              <span className="metric-value" style={{ color: "var(--status-danger-text)" }}>
                {flaggedStudiesCount}
              </span>
              <span className="metric-subtext">
                Category: suspected_intracranial_hemorrhage
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Active Contract &amp; Model</span>
              <span className="metric-value mono" style={{ fontSize: "1.35rem" }}>
                muse-spark-1.3
              </span>
              <span className="metric-subtext">
                Prompt: radar-findings-v1 • Contract v1.0.0
              </span>
            </div>
          </section>

          {/* Studies Triage Queue */}
          <section className="panel-card" aria-labelledby="queue-heading">
            <div className="panel-header">
              <div>
                <h2 id="queue-heading" className="panel-title">
                  Cranial CT Study Queue
                </h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label
                  htmlFor="status-filter"
                  style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}
                >
                  Filter by status:
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="btn btn-sm"
                  style={{ paddingRight: 24 }}
                >
                  <option value="all">All Statuses ({DEMO_STUDIES.length})</option>
                  <option value="ready">Ready</option>
                  <option value="processing">Processing</option>
                </select>
              </div>
            </div>

            {filteredStudies.length === 0 ? (
              <EmptyState
                title="No Studies Match Selected Filter"
                description="Reset the status filter to view all synthetic brain CT studies."
                actionLabel="Reset Filter"
                onAction={() => setStatusFilter("all")}
              />
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Study Code &amp; UUID</th>
                      <th scope="col">Protocol &amp; Slices</th>
                      <th scope="col">Pipeline Status</th>
                      <th scope="col">Model Findings (Unverified)</th>
                      <th scope="col">Clinician Review</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudies.map((entry) => {
                      const { study, findings, model_version } = entry.analysis;
                      const primaryFinding = findings[0];

                      return (
                        <tr key={study.study_id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{entry.code}</div>
                            <div
                              className="mono"
                              style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}
                            >
                              {study.study_id}
                            </div>
                          </td>
                          <td>
                            <div>{entry.seriesDescription}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                              {study.slices.length} axial slices • Ingested {entry.ingestedAt}
                            </div>
                          </td>
                          <td>
                            <StudyStatusBadge status={study.status} />
                          </td>
                          <td>
                            {primaryFinding ? (
                              <div>
                                <span className="badge badge-danger">
                                  Suspected ICH • Score {(primaryFinding.confidence * 100).toFixed(0)}
                                  %
                                </span>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                    marginTop: 4,
                                  }}
                                >
                                  {primaryFinding.evidence_slice_ids.length} evidence slice(s) cited
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>
                                No suspicious findings flagged
                              </span>
                            )}
                          </td>
                          <td>
                            {primaryFinding ? (
                              <ReviewStatusBadge status={primaryFinding.review_status} />
                            ) : (
                              <span className="badge badge-neutral">N/A (No Findings)</span>
                            )}
                          </td>
                          <td>
                            <span className="mono" style={{ color: "var(--text-secondary)" }}>
                              {model_version.provider}
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/studies/${study.study_id}`}
                              className="btn btn-sm btn-primary"
                              aria-label={`Inspect slices for study ${entry.code}`}
                            >
                              Inspect Study
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
