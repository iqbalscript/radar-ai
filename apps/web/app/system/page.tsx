"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_STUDIES } from "@/lib/demo-data";

export default function SystemStatusPage() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const [pingStatus, setPingStatus] = useState<
    "idle" | "checking" | "online" | "offline"
  >("idle");
  const [pingDetail, setPingDetail] = useState<string>(
    "Click 'Run Health Check' to test local FastAPI backend connectivity."
  );

  const checkBackendHealth = async () => {
    setPingStatus("checking");
    setPingDetail(`Connecting to ${apiBaseUrl}/health ...`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        method: "GET",
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        setPingStatus("online");
        setPingDetail(
          `Connected (${response.status} OK) — payload: ${JSON.stringify(data)}`
        );
      } else {
        setPingStatus("offline");
        setPingDetail(`Backend returned HTTP ${response.status}`);
      }
    } catch {
      setPingStatus("offline");
      setPingDetail(
        `Backend unreachable at ${apiBaseUrl}/health. Using validated demo_fixture state.`
      );
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System &amp; Meta Model API Status</h1>
          <p className="page-description">
            Backend connectivity, Meta Model API catalog configuration (RDA-18), and shared
            TypeScript/Pydantic contract schema v1.0.0.
          </p>
        </div>
        <Link href="/" className="btn">
          ← Back to Dashboard
        </Link>
      </div>

      <section className="metrics-grid" aria-label="System telemetry summary">
        <div className="metric-card">
          <span className="metric-label">API Base URL</span>
          <span className="metric-value mono" style={{ fontSize: "1.15rem" }}>
            {apiBaseUrl}
          </span>
          <span className="metric-subtext">Configured via NEXT_PUBLIC_API_BASE_URL</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Primary Model ID</span>
          <span className="metric-value mono" style={{ fontSize: "1.35rem" }}>
            muse-spark-1.3
          </span>
          <span className="metric-subtext">Meta Model API (https://api.meta.ai/v1)</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Data Privacy Mode</span>
          <span className="metric-value" style={{ fontSize: "1.35rem", color: "#34d399" }}>
            Standard Mode
          </span>
          <span className="metric-subtext">Contributor mode disabled for all RADAR data</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Contract Version</span>
          <span className="metric-value mono" style={{ fontSize: "1.35rem" }}>
            1.0.0
          </span>
          <span className="metric-subtext">@radar-ai/contracts ↔ radar_api.contracts</span>
        </div>
      </section>

      {/* FastAPI Health Check Panel */}
      <section className="panel-card" aria-labelledby="health-check-heading">
        <div className="panel-header">
          <h2 id="health-check-heading" className="panel-title">
            FastAPI Service Health Check
          </h2>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={checkBackendHealth}
            disabled={pingStatus === "checking"}
          >
            {pingStatus === "checking" ? "Checking..." : "Run Health Check"}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div
            role="status"
            aria-live="polite"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {pingStatus === "idle" && (
              <span className="badge badge-neutral">IDLE</span>
            )}
            {pingStatus === "checking" && (
              <span className="badge badge-warning">CHECKING</span>
            )}
            {pingStatus === "online" && (
              <span className="badge badge-success">ONLINE</span>
            )}
            {pingStatus === "offline" && (
              <span className="badge badge-danger">OFFLINE / FALLBACK</span>
            )}
            <span className="mono" style={{ fontSize: "0.85rem" }}>
              {pingDetail}
            </span>
          </div>
        </div>
      </section>

      {/* Shared Contract Sample Payload */}
      <section className="panel-card" aria-labelledby="contract-heading">
        <div className="panel-header">
          <h2 id="contract-heading" className="panel-title">
            Shared StudyAnalysisResponse Contract Payload (v1.0.0)
          </h2>
          <span className="badge badge-neutral mono">
            packages/contracts/src/radar-api.ts
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <p
            style={{
              margin: "0 0 12px 0",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            Validated across frontend TypeScript and backend Pydantic models (RDA-18 &amp; RDA-4).
            Opaque internal UUIDs only; zero PHI or DICOM patient identifiers.
          </p>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 16,
              backgroundColor: "var(--bg-viewport)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              overflowX: "auto",
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
            }}
          >
            {JSON.stringify(DEMO_STUDIES[0]?.analysis, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}
