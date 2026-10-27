"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Study } from "@radar-ai/contracts";
import { useAuth } from "@/components/AuthContext";
import {
  apiFetch,
  assertValidUuid,
  validateDicomFilesBeforeUpload,
} from "@/lib/api-client";

export default function DashboardPage() {
  const { user, authRequired } = useAuth();
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/v1/studies");
      if (response.status === 401) {
        throw new Error(
          "Autentikasi diperlukan. Silakan klik 'Login Peneliti' di bagian atas halaman."
        );
      }
      if (response.status === 429) {
        throw new Error(
          "Batas laju permintaan (rate limit) tercapai. Tunggu beberapa saat sebelum memuat ulang."
        );
      }
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setStudies((await response.json()) as Study[]);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error && !cause.message.startsWith("API returned")
          ? cause.message
          : "Tidak dapat menghubungi API. Pastikan layanan berjalan di port 8000."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchStudies() {
      try {
        const response = await apiFetch("/v1/studies");
        if (response.status === 401) {
          throw new Error(
            "Autentikasi diperlukan. Silakan klik 'Login Peneliti' di bagian atas halaman."
          );
        }
        if (response.status === 429) {
          throw new Error(
            "Batas laju permintaan (rate limit) tercapai. Tunggu beberapa saat."
          );
        }
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = (await response.json()) as Study[];
        if (!ignore) {
          setStudies(data);
          setError("");
        }
      } catch (cause) {
        if (!ignore) {
          setError(
            cause instanceof Error && !cause.message.startsWith("API returned")
              ? cause.message
              : "Tidak dapat menghubungi API. Pastikan layanan berjalan di port 8000."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void fetchStudies();
    return () => {
      ignore = true;
    };
  }, [user]);

  async function uploadSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawFiles = fileInput.current?.files;
    if (!rawFiles?.length) return;
    if (authRequired && !user) {
      setError("Silakan login melalui Firebase OAuth terlebih dahulu sebelum mengunggah studi DICOM.");
      return;
    }

    setUploading(true);
    setMessage("");
    setError("");
    let createdStudyId: string | null = null;
    try {
      const validatedFiles = await validateDicomFilesBeforeUpload(rawFiles);

      const created = await apiFetch("/v1/studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modality: "CT" }),
      });
      if (created.status === 401) {
        throw new Error("Sesi autentikasi tidak valid atau telah berakhir. Silakan login kembali.");
      }
      if (created.status === 429) {
        throw new Error("Terlalu banyak permintaan unggah. Silakan tunggu 1 menit.");
      }
      if (!created.ok) throw new Error("Gagal membuat catatan studi.");
      const study = (await created.json()) as Study;
      createdStudyId = assertValidUuid(study.study_id, "Study ID");

      const body = new FormData();
      validatedFiles.forEach((file) => body.append("files", file));
      const uploaded = await apiFetch(`/v1/studies/${createdStudyId}/dicom`, {
        method: "POST",
        body,
      });
      if (!uploaded.ok) {
        const detail = (await uploaded.json().catch(() => ({}))) as { detail?: string };
        const errMessage =
          detail.detail === "Only CT images are accepted"
            ? "Tag DICOM Modality (0008,0060) menyatakan modalitas selain CT. Jika tag ini kosong, jenis CT diperiksa dari SOP Class UID."
            : detail.detail ?? `Upload gagal (${uploaded.status}).`;
        throw new Error(errMessage);
      }
      createdStudyId = null;
      setMessage(
        validatedFiles.length === 1
          ? "Irisan DICOM CT tersimpan sebagai studi satu irisan di penyimpanan privat."
          : "Seri CT tervalidasi dan tersimpan di penyimpanan privat."
      );
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (cause) {
      if (createdStudyId) {
        await apiFetch(`/v1/studies/${createdStudyId}`, { method: "DELETE" }).catch(
          () => undefined
        );
      }
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
          <h2 id="upload-title">Unggah DICOM CT</h2>
          <p>Pilih irisan dari satu seri DICOM CT yang sudah dianonimkan. Untuk banyak irisan, sistem mengurutkan dari posisi fisik; jika metadata posisi tidak tersedia, setiap irisan harus memiliki nomor Instance Number yang unik.</p>
        </div>
        <form className="upload-form" onSubmit={uploadSeries}>
          <label htmlFor="dicom-files">File CT</label>
          <input ref={fileInput} id="dicom-files" type="file" accept=".dcm,application/dicom" multiple required />
          <button className="button-primary" type="submit" disabled={uploading}>
            {uploading ? "Mengunggah…" : "Validasi dan unggah"}
          </button>
        </form>
        <p className="upload-note">Validasi berlapis memeriksa header biner DICM Part 10, ukuran file, penghapusan tag identitas pasien (PHI/PN), larangan overlay/anotasi tertanam, serta rate limiting sebelum gambar disimpan di penyimpanan privat.</p>
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
