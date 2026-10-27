/**
 * Hardened API client and client-side DICOM upload validator for RADAR AI.
 */

import { getValidIdToken } from "@/lib/firebase-auth";

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CLIENT_UPLOAD_LIMITS = {
  maxFiles: 512,
  maxFileBytes: 64 * 1024 * 1024,
  maxSeriesBytes: 512 * 1024 * 1024,
} as const;

const FORBIDDEN_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".php",
  ".py",
  ".js",
  ".mjs",
  ".ts",
  ".html",
  ".htm",
  ".svg",
  ".zip",
  ".tar",
  ".gz",
]);

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export function assertValidUuid(value: string, label = "identifier"): string {
  const trimmed = value.trim();
  if (!isValidUuid(trimmed)) {
    throw new Error(`Format ${label} tidak valid.`);
  }
  return trimmed;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  if (!path.startsWith("/")) {
    throw new Error("API path harus diawali dengan '/'.");
  }
  const headers = new Headers(init.headers);
  headers.set("X-Requested-With", "XMLHttpRequest");

  const token = await getValidIdToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const apiKey = (process.env.NEXT_PUBLIC_RADAR_API_KEY ?? "").trim();
  if (apiKey && !headers.has("X-API-Key")) {
    headers.set("X-API-Key", apiKey);
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}

export async function fetchAuthenticatedImageBlobUrl(
  studyId: string,
  sliceId: string,
  signal?: AbortSignal
): Promise<string> {
  const safeStudyId = assertValidUuid(studyId, "Study ID");
  const safeSliceId = assertValidUuid(sliceId, "Slice ID");
  const response = await apiFetch(
    `/v1/studies/${safeStudyId}/slices/${safeSliceId}/image`,
    { signal }
  );
  if (!response.ok) {
    throw new Error(`Gagal memuat pratinjau irisan CT (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function hasForbiddenMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return true;
  // MZ (Windows PE), ELF, #!, PK (ZIP), %PDF
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  if (
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  ) {
    return true;
  }
  if (bytes[0] === 0x23 && bytes[1] === 0x21) return true;
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return true;
  }
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return true;
  }
  const headText = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 32))
    .trimStart()
    .toLowerCase();
  if (
    headText.startsWith("<!doctype html") ||
    headText.startsWith("<html") ||
    headText.startsWith("<script") ||
    headText.startsWith("<?php") ||
    headText.startsWith("<svg")
  ) {
    return true;
  }
  return false;
}

export async function validateDicomFilesBeforeUpload(
  fileList: FileList | File[]
): Promise<File[]> {
  const files = Array.from(fileList);
  if (files.length === 0) {
    throw new Error("Pilih minimal satu file DICOM CT.");
  }
  if (files.length > CLIENT_UPLOAD_LIMITS.maxFiles) {
    throw new Error(
      `Jumlah file melebihi batas maksimum (${CLIENT_UPLOAD_LIMITS.maxFiles} file per seri).`
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    const dotIndex = lowerName.lastIndexOf(".");
    if (dotIndex !== -1) {
      const ext = lowerName.slice(dotIndex);
      if (FORBIDDEN_EXTENSIONS.has(ext)) {
        throw new Error(
          `File "${file.name}" memiliki ekstensi terlarang (${ext}). Hanya file DICOM (.dcm) yang diizinkan.`
        );
      }
    }
    if (file.size <= 132) {
      throw new Error(
        `File "${file.name}" kosong atau terlalu kecil untuk menjadi objek DICOM Part 10.`
      );
    }
    if (file.size > CLIENT_UPLOAD_LIMITS.maxFileBytes) {
      throw new Error(
        `File "${file.name}" melebihi batas ukuran per file (maksimal 64 MB).`
      );
    }
    totalBytes += file.size;
    if (totalBytes > CLIENT_UPLOAD_LIMITS.maxSeriesBytes) {
      throw new Error(
        "Total ukuran seri DICOM melebihi batas maksimum (512 MB)."
      );
    }

    const headerBuffer = await file.slice(0, 132).arrayBuffer();
    const headerBytes = new Uint8Array(headerBuffer);
    if (hasForbiddenMagicBytes(headerBytes)) {
      throw new Error(
        `File "${file.name}" terdeteksi sebagai file eksekusi/dokumen aktif yang dilarang.`
      );
    }

    const dicmMagic = String.fromCharCode(
      headerBytes[128],
      headerBytes[129],
      headerBytes[130],
      headerBytes[131]
    );
    if (dicmMagic !== "DICM") {
      throw new Error(
        `File "${file.name}" bukan file DICOM Part 10 yang valid (header 'DICM' pada byte 128 tidak ditemukan).`
      );
    }
  }

  return files;
}

