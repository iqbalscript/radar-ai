"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Study } from "@radar-ai/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function DashboardPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`${API_BASE}/v1/studies`, { cache: "no-store" });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setStudies((await response.json()) as Study[]);
    } catch {
      setError("Tidak dapat menghubungi API. Pastikan layanan berjalan di port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function uploadSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = fileInput.current?.files;
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const created = await fetch(`${API_BASE}/v1/studies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modality: "CT" }),
      });
      if (!created.ok) throw new Error("Gagal membuat catatan studi.");
      const study = (await created.json()) as Study;
      const body = new FormData();
      Array.from(files).forEach((file) => body.append("files", file));
      const uploaded = await fetch(`${API_BASE}/v1/studies/${study.study_id}/dicom`, {
        method: "POST",
        body,
      });
      if (!uploaded.ok) {
        const detail = (await uploaded.json().catch(() => ({}))) as { detail?: string };
        throw new Error(detail.detail ?? `Upload gagal (${uploaded.status}).`);
      }
      setMessage("Seri CT tervalidasi dan tersimpan di penyimpanan privat.");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload gagal.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="dashboard-shell">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">RADAR AI <span>RESEARCH WORKSPACE</span></p>
          <h1>CT study queue</h1>
          <p className="lead">Kelola seri CT anonim dan tinjau status pemrosesan.</p>
        </div>
        <div className="queue-count"><strong>{studies.length}</strong><span>studi tersimpan</span></div>
      </section>

      <section className="upload-panel" aria-labelledby="upload-title">
        <div>
          <p className="eyebrow">PRIVATE INGESTION</p>
          <h2 id="upload-title">Unggah seri DICOM</h2>
          <p>Pilih file DICOM dari satu seri CT yang sudah dianonimkan.</p>
        </div>
        <form className="upload-form" onSubmit={uploadSeries}>
          <label htmlFor="dicom-files">File seri CT</label>
          <input ref={fileInput} id="dicom-files" type="file" multiple required />
          <button className="button-primary" type="submit" disabled={uploading}>
            {uploading ? "Mengunggah…" : "Validasi dan unggah"}
          </button>
        </form>
        <p className="upload-note">Batas ukuran dan jumlah file mengikuti konfigurasi server. Nama file diabaikan; data gambar tidak disimpan di folder publik.</p>
      </section>

      <section className="queue-panel" aria-labelledby="queue-title">
        <div className="section-heading"><div><p className="eyebrow">STUDIES</p><h2 id="queue-title">Daftar studi</h2></div><button type="button" className="button-secondary" onClick={() => void refresh()}>Muat ulang</button></div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {message && <div className="notice notice-success" role="status">{message}</div>}
        {loading ? <p className="queue-state" role="status">Memuat daftar studi…</p> : studies.length === 0 ? (
          <div className="queue-state"><strong>Belum ada studi</strong><span>Unggah seri anonim untuk memulai.</span></div>
        ) : (
          <div className="table-wrap"><table className="study-table"><thead><tr><th scope="col">Study ID</th><th scope="col">Modalitas</th><th scope="col">Irisan</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody>
            {studies.map((study) => <tr key={study.study_id}><td><span className="study-code">{study.study_id.slice(0, 8).toUpperCase()}</span><small>{study.study_id}</small></td><td>{study.modality}</td><td>{study.slices.length}</td><td><span className={`status-pill status-${study.status}`}>{study.status}</span></td><td><Link className="table-link" href={`/studies/${study.study_id}`}>Buka viewer <span aria-hidden="true">→</span></Link></td></tr>)}
          </tbody></table></div>
        )}
      </section>
      <p className="research-note">Alat bantu riset dan demonstrasi saja. Bukan untuk penggunaan klinis; seluruh hasil memerlukan evaluasi manusia.</p>
    </div>
  );
}
