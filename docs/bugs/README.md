# RADAR AI — Comprehensive Bug & Defect Audit

**Date:** 2026-10-29 (WIB)  
**Scope:** Full repository audit (`apps/web`, `apps/api`, `packages/contracts`, `docs/`, `scripts/`)  
**Project:** RADAR AI — Meta Global AI Developer Hackathon 2026  
**Notice:** Research prototype only — **NOT FOR CLINICAL USE**.

---

## 1. Executive Summary

This document presents a comprehensive audit of all discovered bugs, architectural gaps, memory leaks, deprecation warnings, and edge-case vulnerabilities identified across the RADAR AI codebase.

Each issue is classified by severity, root cause, reproduction steps, affected files, and recommended remediation.

---

## 2. Bug Registry & Severity Matrix

| Bug ID | Title | Component | Severity | Status |
| :--- | :--- | :--- | :---: | :---: |
| **[BUG-01](./BUG-01-study-viewer-empty-slices-crash.md)** | `StudyViewerClient` runtime crash on empty model slices (`Reduce of empty array`) | Frontend (`apps/web`) | **P1 (High)** | Documented / Fix available |
| **[BUG-02](./BUG-02-cornerstone-viewport-integration-gap.md)** | Orphaned `CornerstoneViewport` & documentation drift with `StudyViewerClient` | Frontend (`apps/web`) | **P2 (Medium)** | Documented |
| **[BUG-03](./BUG-03-web-memory-leak-blob-url-cleanup.md)** | Object URL memory leak during rapid CT slice scrubbing | Frontend (`apps/web`) | **P2 (Medium)** | Documented / Fix available |
| **[BUG-04](./BUG-04-missing-npm-test-script.md)** | Missing `npm test` script in `apps/web/package.json` | Tooling / CI | **P3 (Low)** | Documented / Fix available |
| **[BUG-05](./BUG-05-edge-rate-limiter-in-memory-state.md)** | Ephemeral in-memory rate limiting state in serverless & distributed environments | Security / Middleware | **P2 (Medium)** | Documented |
| **[BUG-06](./BUG-06-framework-deprecation-warnings.md)** | Next.js 16 `middleware` & Starlette `TestClient` deprecation warnings | Frameworks | **P3 (Low)** | Documented |
| **[BUG-07](./BUG-07-dicom-rendering-edge-cases.md)** | Window width floating-point division by zero & redundant disk I/O in DICOM decoding | Backend (`apps/api`) | **P3 (Low)** | Documented / Fix available |

---

## 3. Severity Definitions

- **P1 (High)**: Causes uncaught runtime exceptions, page crashes, or data loss under valid or edge-case workflows.
- **P2 (Medium)**: Architectural discrepancies, client-side resource leaks, or security bypasses in multi-instance/serverless production deployments.
- **P3 (Low)**: Tooling mismatches, framework deprecation warnings, or performance overhead without immediate failure.

---

## 4. Remediation Priority Roadmap

1. **Immediate (Sprint 2 Hardening)**:
   - Patch `BUG-01` to safeguard `Array.prototype.reduce` in `StudyViewerClient.tsx` with initial values or guard clauses.
   - Patch `BUG-03` to revoke abandoned Object URLs during async resolution.
   - Patch `BUG-04` by adding `"test": "node scripts/verify-dicom-fixture.mjs"` to `apps/web/package.json`.
2. **Next Sprint (Architecture & Viewer Enhancement)**:
   - Resolve `BUG-02` by integrating `CornerstoneViewport` into `StudyViewerClient` to unlock interactive Hounsfield Unit probing.
   - Resolve `BUG-05` by providing a distributed Redis/Upstash adapter for edge rate limiting in production.
   - Resolve `BUG-06` by migrating `apps/web/middleware.ts` to `apps/web/proxy.ts`.

