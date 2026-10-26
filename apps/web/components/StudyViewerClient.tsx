"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Study, StudyAnalysisResponse, FindingReviewStatus } from "@radar-ai/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function StudyViewerClient({ studyId }: { studyId: string }) {
  const [study, setStudy] = useState<Study | null>(null);
  const [analysis, setAnalysis] = useState<StudyAnalysisResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const slice = study?.slices[index];
  const imageUrl = useMemo(
    () => slice ? `${API_BASE}/v1/studies/${studyId}/slices/${slice.slice_id}/image` : "",
    [slice, studyId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/v1/studies/${studyId}`, { cache: "no-store" });
      if (response.status === 404) throw new Error("Studi tidak ditemukan.");
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const value = (await response.json()) as Study;
      setStudy(value);
      setIndex((current) => Math.min(current, Math.max(0, value.slices.length - 1)));
      const analysisResponse = await fetch(`${API_BASE}/v1/studies/${studyId}/analysis`, { cache: "no-store" });
      setAnalysis(analysisResponse.ok ? (await analysisResponse.json()) as StudyAnalysisResponse : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tidak dapat memuat studi.");
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    let ignore = false;
    async function fetchStudy() {
      try {
        const response = await fetch(`${API_BASE}/v1/studies/${studyId}`, { cache: "no-store" });
        if (response.status === 404) throw new Error("Studi tidak ditemukan.");
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const value = (await response.json()) as Study;
        if (!ignore) {
          setStudy(value);
          setIndex((current) => Math.min(current, Math.max(0, value.slices.length - 1)));
          setError("");
        }
        const analysisResponse = await fetch(`${API_BASE}/v1/studies/${studyId}/analysis`, { cache: "no-store" });
        if (!ignore) {
          setAnalysis(analysisResponse.ok ? (await analysisResponse.json()) as StudyAnalysisResponse : null);
        }
      } catch (cause) {
        if (!ignore) {
          setError(cause instanceof Error ? cause.message : "Tidak dapat memuat studi.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void fetchStudy();
    return () => {
      ignore = true;
    };
  }, [studyId]);

  async function recordReview(findingId: string, review_status: FindingReviewStatus) {
    setReviewError("");
    try {
      const response = await fetch(`${API_BASE}/v1/studies/${studyId}/findings/${findingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status }),
      });
      if (!response.ok) throw new Error(`Keputusan reviewer gagal disimpan (HTTP ${response.status}).`);
      if (!analysis) return;
      setAnalysis({
        ...analysis,
        findings: analysis.findings.map((finding) => finding.finding_id === findingId ? { ...finding, review_status } : finding),
      });
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : "Keputusan reviewer gagal disimpan.");
    }
  }

  return (
    <div className="viewer-shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">← Kembali ke daftar studi</Link></nav>
      {loading && <p role="status">Memuat studi…</p>}
      {error && <div className="notice notice-error" role="alert">{error}<button className="button-secondary" onClick={() => void load()}>Coba lagi</button></div>}
      {study && (
        <>
          <header className="viewer-heading">
            <div><p className="eyebrow">ANONYMIZED CT STUDY</p><h1>Study {study.study_id.slice(0, 8).toUpperCase()}</h1><p>{study.modality} · {study.slices.length} irisan</p></div>
            <span className={`status-pill status-${study.status}`}>{study.status}</span>
          </header>
          <div className="viewer-grid">
            <section className="image-panel" aria-label="CT slice viewer">
              <div className="image-toolbar"><span>SLICE {slice ? index + 1 : 0} / {study.slices.length}</span><span>{slice?.z_position_mm == null ? "Z position unavailable" : `Z ${slice.z_position_mm} mm`}</span></div>
              <div className="image-stage">
                {slice ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imageUrl} alt={`Anonymized CT slice ${index + 1} of ${study.slices.length}`} />
                ) : (
                  <p>Studi ini belum memiliki irisan.</p>
                )}
              </div>
              <div className="slice-controls">
                <button className="button-secondary" type="button" disabled={!slice || index === 0} onClick={() => setIndex((n) => Math.max(0, n - 1))}>Irisan sebelumnya</button>
                <label htmlFor="slice-index">Irisan <strong>{slice ? index + 1 : 0}</strong> dari {study.slices.length}</label>
                <button className="button-secondary" type="button" disabled={!slice || index >= study.slices.length - 1} onClick={() => setIndex((n) => Math.min(study.slices.length - 1, n + 1))}>Irisan berikutnya</button>
                <input id="slice-index" type="range" min={0} max={Math.max(0, study.slices.length - 1)} value={index} disabled={!slice} onChange={(event) => setIndex(Number(event.target.value))} aria-label="Pilih irisan CT" />
              </div>
            </section>
            <aside className="review-panel">
              <p className="eyebrow">ANALYSIS & REVIEW</p>
              <h2>Temuan model</h2>
              {reviewError && <div className="notice notice-error" role="alert">{reviewError}</div>}
              {analysis?.findings.length ? analysis.findings.map((finding) => <article className="finding-card" key={finding.finding_id}>
                <h3>Dugaan perdarahan intrakranial</h3>
                <p>Skor model: {(finding.confidence * 100).toFixed(0)}% · belum terkalibrasi</p>
                <p className="finding-evidence">Irisan bukti: {finding.evidence_slice_ids.map((sliceId) => {
                  const evidenceIndex = study.slices.findIndex((item) => item.slice_id === sliceId);
                  return <button key={sliceId} type="button" className="evidence-link" onClick={() => evidenceIndex >= 0 && setIndex(evidenceIndex)}>#{evidenceIndex + 1}</button>;
              })}</p>
                <label htmlFor={`review-${finding.finding_id}`}>Keputusan reviewer</label>
                <select id={`review-${finding.finding_id}`} value={finding.review_status} onChange={(event) => void recordReview(finding.finding_id, event.target.value as FindingReviewStatus)}>
                  <option value="pending" disabled>Menunggu review</option><option value="accepted">Terima</option><option value="rejected">Tolak</option><option value="uncertain">Tidak pasti</option>
                </select>
              </article>) : <div className="notice notice-warning" role="status"><strong>{analysis ? "Analisis selesai tanpa temuan." : "Inference belum tersedia."}</strong><br />{analysis ? "Model tidak melaporkan temuan untuk ditinjau." : "Belum ada baseline model yang disiapkan untuk lingkungan ini. Tidak ada temuan yang dibuat atau disimulasikan."}</div>}
              <p className="muted-copy">Semua skor model bersifat eksperimental dan tidak terkalibrasi. Hasil memerlukan peninjauan manusia.</p>
              {analysis && <p className="muted-copy">Model: {analysis.model_version.provider} · {analysis.model_version.model_id} · {analysis.model_version.prompt_version}</p>}
              <dl className="study-metadata"><div><dt>Status pipeline</dt><dd>{study.status}</dd></div><div><dt>Provider</dt><dd>{analysis?.model_version.provider ?? "Belum dikonfigurasi"}</dd></div><div><dt>Review</dt><dd>{analysis?.findings.filter((finding) => finding.review_status === "pending").length ?? 0} menunggu</dd></div></dl>
            </aside>
          </div>
        </>
      )}
      <p className="research-note">Riset saja, bukan untuk penggunaan klinis. Tinjau seluruh irisan secara mandiri.</p>
    </div>
  );
}
