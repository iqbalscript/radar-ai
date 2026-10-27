"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Study,
  StudyAnalysisResponse,
  StudyModelScores,
  StudyLocalizations,
  FindingReviewStatus,
} from "@radar-ai/contracts";
import { useAuth } from "@/components/AuthContext";
import {
  API_BASE,
  apiFetch,
  assertValidUuid,
  fetchAuthenticatedImageBlobUrl,
  isValidUuid,
} from "@/lib/api-client";

async function fetchModelScores(studyId: string): Promise<StudyModelScores> {
  const safeId = assertValidUuid(studyId, "Study ID");
  const response = await apiFetch(`/v1/studies/${safeId}/scores`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Skor model tidak tersedia (HTTP ${response.status}).`);
  }
  return (await response.json()) as StudyModelScores;
}

async function fetchStudyLocalizations(studyId: string): Promise<StudyLocalizations> {
  const safeId = assertValidUuid(studyId, "Study ID");
  const response = await apiFetch(`/v1/studies/${safeId}/localizations`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Lokalisasi lesi tidak tersedia (HTTP ${response.status}).`);
  }
  return (await response.json()) as StudyLocalizations;
}

export function StudyViewerClient({ studyId }: { studyId: string }) {
  const { user, authRequired } = useAuth();
  const [study, setStudy] = useState<Study | null>(null);
  const [analysis, setAnalysis] = useState<StudyAnalysisResponse | null>(null);
  const [modelScores, setModelScores] = useState<StudyModelScores | null>(null);
  const [localizations, setLocalizations] = useState<StudyLocalizations | null>(null);
  const [localizationError, setLocalizationError] = useState("");
  const [scoreError, setScoreError] = useState("");
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [blobImage, setBlobImage] = useState<{ sliceId: string; url: string } | null>(null);
  const slice = study?.slices[index];
  const topCandidate = modelScores?.slices.reduce((best, current) =>
    current.class_1_score > best.class_1_score ? current : best,
  );
  const activeSliceScore = modelScores?.slices.find((item) => item.index === index);
  const activeLocalization = localizations?.slices.find((item) => item.index === index);

  const fallbackImageUrl = useMemo(() => {
    if (!slice || !isValidUuid(studyId) || !isValidUuid(slice.slice_id)) return "";
    return `${API_BASE}/v1/studies/${studyId}/slices/${slice.slice_id}/image`;
  }, [slice, studyId]);

  useEffect(() => {
    if (!slice || !user) {
      return;
    }
    const targetSliceId = slice.slice_id;
    const controller = new AbortController();
    let createdObjectUrl = "";

    fetchAuthenticatedImageBlobUrl(studyId, targetSliceId, controller.signal)
      .then((objectUrl) => {
        createdObjectUrl = objectUrl;
        setBlobImage({ sliceId: targetSliceId, url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBlobImage(null);
        }
      });

    return () => {
      controller.abort();
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [slice, studyId, user]);

  const activeImageUrl =
    user && slice && blobImage?.sliceId === slice.slice_id
      ? blobImage.url
      : fallbackImageUrl;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const safeStudyId = assertValidUuid(studyId, "Study ID");
      const response = await apiFetch(`/v1/studies/${safeStudyId}`);
      if (response.status === 401) {
        throw new Error(
          "Autentikasi diperlukan untuk membuka studi ini. Silakan login terlebih dahulu."
        );
      }
      if (response.status === 404) throw new Error("Studi tidak ditemukan.");
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const value = (await response.json()) as Study;
      setStudy(value);
      setIndex((current) => Math.min(current, Math.max(0, value.slices.length - 1)));
      const analysisResponse = await apiFetch(`/v1/studies/${safeStudyId}/analysis`);
      setAnalysis(
        analysisResponse.ok
          ? ((await analysisResponse.json()) as StudyAnalysisResponse)
          : null
      );
      setModelScores(null);
      setLocalizations(null);
      setScoreError("");
      setLocalizationError("");
      void fetchModelScores(safeStudyId)
        .then(setModelScores)
        .catch((cause: unknown) =>
          setScoreError(
            cause instanceof Error ? cause.message : "Skor model tidak tersedia."
          )
        );
      void fetchStudyLocalizations(safeStudyId)
        .then(setLocalizations)
        .catch((cause: unknown) =>
          setLocalizationError(
            cause instanceof Error ? cause.message : "Lokalisasi lesi tidak tersedia."
          )
        );
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
        const safeStudyId = assertValidUuid(studyId, "Study ID");
        const response = await apiFetch(`/v1/studies/${safeStudyId}`);
        if (response.status === 401) {
          throw new Error(
            "Autentikasi diperlukan untuk membuka studi ini. Silakan login terlebih dahulu."
          );
        }
        if (response.status === 404) throw new Error("Studi tidak ditemukan.");
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const value = (await response.json()) as Study;
        if (!ignore) {
          setStudy(value);
          setIndex((current) => Math.min(current, Math.max(0, value.slices.length - 1)));
          setError("");
          setModelScores(null);
          setLocalizations(null);
          setScoreError("");
          setLocalizationError("");
        }
        const analysisResponse = await apiFetch(`/v1/studies/${safeStudyId}/analysis`);
        if (!ignore) {
          setAnalysis(
            analysisResponse.ok
              ? ((await analysisResponse.json()) as StudyAnalysisResponse)
              : null
          );
        }
        void fetchModelScores(safeStudyId)
          .then((scores) => {
            if (!ignore) setModelScores(scores);
          })
          .catch((cause: unknown) => {
            if (!ignore) {
              setScoreError(
                cause instanceof Error ? cause.message : "Skor model tidak tersedia."
              );
            }
          });
        void fetchStudyLocalizations(safeStudyId)
          .then((result) => {
            if (!ignore) setLocalizations(result);
          })
          .catch((cause: unknown) => {
            if (!ignore) {
              setLocalizationError(
                cause instanceof Error ? cause.message : "Lokalisasi lesi tidak tersedia."
              );
            }
          });
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
  }, [studyId, user]);

  async function recordReview(findingId: string, review_status: FindingReviewStatus) {
    setReviewError("");
    if (authRequired && !user) {
      setReviewError(
        "Silakan login dengan akun peneliti (Firebase OAuth) untuk mencatat keputusan review."
      );
      return;
    }
    try {
      const safeStudyId = assertValidUuid(studyId, "Study ID");
      const safeFindingId = assertValidUuid(findingId, "Finding ID");
      const response = await apiFetch(
        `/v1/studies/${safeStudyId}/findings/${safeFindingId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review_status }),
        }
      );
      if (response.status === 401) {
        throw new Error(
          "Autentikasi diperlukan untuk menyimpan keputusan reviewer."
        );
      }
      if (!response.ok) {
        throw new Error(
          `Keputusan reviewer gagal disimpan (HTTP ${response.status}).`
        );
      }
      if (!analysis) return;
      setAnalysis({
        ...analysis,
        findings: analysis.findings.map((finding) =>
          finding.finding_id === findingId
            ? { ...finding, review_status }
            : finding
        ),
      });
    } catch (cause) {
      setReviewError(
        cause instanceof Error
          ? cause.message
          : "Keputusan reviewer gagal disimpan."
      );
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
                  <>
                    <div className="ct-image-frame" style={activeLocalization ? { aspectRatio: `${activeLocalization.image_width} / ${activeLocalization.image_height}` } : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={activeImageUrl} alt={`Anonymized CT slice ${index + 1} of ${study.slices.length}`} />
                      {activeLocalization?.box && <div className="ct-lesion-box" style={{
                        left: `${activeLocalization.box.x * 100}%`,
                        top: `${activeLocalization.box.y * 100}%`,
                        width: `${activeLocalization.box.width * 100}%`,
                        height: `${activeLocalization.box.height * 100}%`,
                      }}><span>Area mask ICH · riset</span></div>}
                    </div>
                    {activeSliceScore && <div className={`ct-model-label${topCandidate?.index === index ? " ct-model-label-candidate" : ""}`} role="status" aria-live="polite">
                      <strong>{topCandidate?.index === index ? "KANDIDAT LABEL POSITIF ICH" : "SKOR LABEL POSITIF ICH"}</strong>
                      <span>{(activeSliceScore.class_1_score * 100).toFixed(1)}%</span>
                      <small>Skor model · bukan diagnosis</small>
                    </div>}
                  </>
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
              <h2>Skor model (riset)</h2>
              {modelScores ? (() => {
                const topSlice = modelScores.slices.reduce((best, current) =>
                  current.class_1_score > best.class_1_score ? current : best,
                );
                return <article className="finding-card">
                  <h3>Skor label positif ICH tertinggi</h3>
                  <p>Skor model untuk label dataset positif: {(topSlice.class_1_score * 100).toFixed(1)}% · irisan #{topSlice.index + 1}</p>
                  <p className="muted-copy">Label dataset negatif: {(topSlice.class_0_score * 100).toFixed(1)}% · positif: {(topSlice.class_1_score * 100).toFixed(1)}%</p>
                  <button className="evidence-link" type="button" onClick={() => setIndex(topSlice.index)}>Lihat irisan skor tertinggi</button>
                  <p className="muted-copy">Label 1 berarti irisan dianotasi mengandung perdarahan pada dataset RSNA ICH; label 0 berarti tidak ada anotasi positif. Ini skor model per irisan, bukan akurasi atau diagnosis; skor belum terkalibrasi.</p>
                  <p className="muted-copy">{modelScores.model_id} · {modelScores.device} · checkpoint {modelScores.checkpoint_sha256.slice(0, 12)}</p>
                </article>;
              })() : <div className="notice notice-warning" role="status">
                <strong>{scoreError ? "Inference belum tersedia." : "Menjalankan inference lokal…"}</strong>
                {scoreError && <><br />{scoreError}</>}
              </div>}
              <h3>Lokalisasi area oleh SAMIHS</h3>
              {localizations ? (() => {
                const candidates = localizations.slices.filter((item) => item.box !== null);
                const largest = candidates.reduce<(typeof candidates)[number] | null>(
                  (best, current) => !best || current.mask_pixels > best.mask_pixels ? current : best,
                  null,
                );
                return <article className="finding-card">
                  {largest ? <>
                    <p>Mask menemukan area kandidat pada {candidates.length} irisan. Kotak mengikuti batas area mask irisan, bukan diagnosis.</p>
                    <button className="evidence-link" type="button" onClick={() => setIndex(largest.index)}>Lihat area mask terbesar · irisan #{largest.index + 1}</button>
                  </> : <p>Model tidak menghasilkan area mask pada seri ini.</p>}
                  <p className="muted-copy">{localizations.model_id} · {localizations.device} · threshold {localizations.threshold} · checkpoint {localizations.checkpoint_sha256.slice(0, 12)}</p>
                </article>;
              })() : <div className="notice notice-warning" role="status">
                <strong>{localizationError ? "Lokalisasi belum tersedia." : "Menjalankan model lokalisasi lokal…"}</strong>
                {localizationError && <><br />{localizationError}</>}
              </div>}
              <h3>Kandidat model & temuan tersimpan</h3>
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
              </article>) : modelScores ? (() => {
                const candidate = modelScores.slices.reduce((best, current) =>
                  current.class_1_score > best.class_1_score ? current : best,
                );
                return <article className="finding-card">
                  <h3>Kandidat skor tertinggi · belum ditinjau</h3>
                  <p>Skor model untuk label positif ICH: {(candidate.class_1_score * 100).toFixed(1)}% · irisan #{candidate.index + 1}</p>
                  <button className="evidence-link" type="button" onClick={() => setIndex(candidate.index)}>Buka irisan kandidat</button>
                  <p className="muted-copy">Diturunkan langsung dari skor inference model untuk target anotasi RSNA ICH. Belum disimpan sebagai temuan dan belum ditinjau reviewer. Skor ini bukan diagnosis atau akurasi model.</p>
                </article>;
              })() : <div className="notice notice-warning" role="status">{scoreError ? "Kandidat model belum tersedia karena inference gagal." : "Memuat skor inference untuk menampilkan kandidat model…"}</div>}
              <p className="muted-copy">Semua skor model bersifat eksperimental dan tidak terkalibrasi. Hasil memerlukan peninjauan manusia.</p>
              {analysis && <p className="muted-copy">Model: {analysis.model_version.provider} · {analysis.model_version.model_id} · {analysis.model_version.prompt_version}</p>}
              <dl className="study-metadata"><div><dt>Status pipeline</dt><dd>{study.status}</dd></div><div><dt>Provider</dt><dd>{analysis?.model_version.provider ?? "Belum dikonfigurasi"}</dd></div><div><dt>Reviewer aktif</dt><dd>{user?.email ?? "local-reviewer"}</dd></div></dl>
            </aside>
          </div>
        </>
      )}
      <p className="research-note">Riset saja, bukan untuk penggunaan klinis. Tinjau seluruh irisan secara mandiri.</p>
    </div>
  );
}
