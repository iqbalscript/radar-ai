"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function SystemStatusPage() {
  const [status, setStatus] = useState<"idle" | "checking" | "online" | "offline">("idle");
  const [detail, setDetail] = useState("Pemeriksaan API belum dijalankan.");

  async function checkHealth() {
    setStatus("checking");
    setDetail(`Menghubungi ${API_BASE}/health…`);
    try {
      const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = (await response.json()) as { status?: string; environment?: string };
      setStatus("online");
      setDetail(`API aktif · ${health.environment ?? "environment tidak diketahui"}`);
    } catch (error) {
      setStatus("offline");
      setDetail(error instanceof Error ? error.message : "API tidak dapat dihubungi.");
    }
  }

  return (
    <div className="dashboard-shell">
      <section className="dashboard-intro"><div><p className="eyebrow">SYSTEM</p><h1>Status layanan</h1><p className="lead">Konfigurasi yang benar-benar tersedia di lingkungan ini.</p></div></section>
      <section className="queue-panel system-panel">
        <div className="section-heading"><div><p className="eyebrow">FASTAPI</p><h2>Konektivitas backend</h2></div><button className="button-primary" type="button" disabled={status === "checking"} onClick={() => void checkHealth()}>{status === "checking" ? "Memeriksa…" : "Periksa API"}</button></div>
        <div className="notice" role="status" aria-live="polite">{detail}</div>
      </section>
      <section className="queue-panel system-panel">
        <p className="eyebrow">MODEL & CONTRACT</p><h2>Inference lokal per studi</h2>
        <p className="muted-copy">Viewer meminta skor dari checkpoint DenseNet121 lokal saat studi dibuka. Halaman ini tidak memeriksa checkpoint. Baseline saat ini hanya mengeluarkan skor biner per irisan; arti label 0/1 belum terverifikasi, jadi skor tidak diubah menjadi temuan medis.</p>
        <dl className="study-metadata"><div><dt>Kontrak API</dt><dd>v1.0.0</dd></div><div><dt>Provider model</dt><dd>Checkpoint lokal, status per lingkungan</dd></div><div><dt>Label checkpoint</dt><dd>Biner 0/1 · arti klinis belum diverifikasi</dd></div><div><dt>Kegunaan</dt><dd>Riset saja</dd></div></dl>
      </section>
    </div>
  );
}

