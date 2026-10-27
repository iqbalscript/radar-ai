# Security Architecture & Vercel Deployment Guide

## 1. Security Audit Summary & Implemented Layers

Before deploying RADAR AI to Vercel, the following security gaps were identified and remediated across both `apps/web` (Next.js App Router) and `apps/api` (FastAPI):

| Layer | Vulnerability / Gap Found | Security Improvement Implemented |
| :--- | :--- | :--- |
| **Authentication & OAuth** | No authentication on web or API; all reviewer decisions were recorded under a shared hardcoded `"local-reviewer"` string, and CORS blocked `Authorization` headers. | Added Firebase OAuth (Google OAuth2 popup & Email/Password via Identity Toolkit v1) in [`firebase-auth.ts`](../apps/web/lib/firebase-auth.ts) and [`AuthContext.tsx`](../apps/web/components/AuthContext.tsx), plus multi-mode token verification (`firebase_jwt`, `firebase_lookup`, `hmac_session`, `api_key`) in [`security.py`](../apps/api/src/radar_api/security.py). Reviewer audit events now record the verified researcher identity (`principal.reviewer_id`). |
| **Rate Limiting** | No rate limiting on DICOM uploads, study creation, or model inference (`GET /v1/studies/{id}/scores`), exposing the service to DoS and storage/CPU exhaustion. | Added tiered sliding-window rate limiting in both FastAPI ([`SecurityAndRateLimitMiddleware`](../apps/api/src/radar_api/security.py)) and Next.js Edge Middleware ([`middleware.ts`](../apps/web/middleware.ts)) with separate buckets for uploads (`20/min`), inference (`30/min`), and general API traffic (`120/min`), returning `429 Too Many Requests` and `Retry-After`. |
| **File Upload & PHI Protection** | Uploads accepted arbitrary MIME types before staging to disk; DICOM validation checked 34 keywords but did not block arbitrary `VR=PN` (Person Name) tags, `OriginalAttributesSequence`, burned-in annotations (`BurnedInAnnotation=YES`), or overlay planes (`60xx,xxxx`), and Pillow lacked an explicit `MAX_IMAGE_PIXELS` bomb guard. | Added client-side binary `DICM` magic header & extension validation ([`api-client.ts`](../apps/web/lib/api-client.ts)), server-side executable/script/HTML magic-byte & MIME blocking ([`dicom_upload.py`](../apps/api/src/radar_api/dicom_upload.py)), expanded PHI/HIPAA tag + `VR=PN` + Overlay + `BurnedInAnnotation` rejection + finite pixel array verification ([`dicom_validation.py`](../apps/api/src/radar_api/dicom_validation.py)), and `Image.MAX_IMAGE_PIXELS` decompression bomb protection. |
| **API & Data Protection** | CT slice `<img src>` tags could not send `Authorization` headers; API responses lacked `Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`, `HSTS`, and `Cache-Control: no-store` on metadata endpoints. | Added authenticated blob URL fetching ([`fetchAuthenticatedImageBlobUrl`](../apps/web/lib/api-client.ts)) with automatic `URL.revokeObjectURL` cleanup, strict UUID validation (`assertValidUuid`), and comprehensive security headers on both Next.js and FastAPI. |

---

## 2. Deploying `apps/web` to Vercel

1. **Import Repository in Vercel**:
   - Set **Root Directory** to `apps/web`.
   - Framework Preset: **Next.js**.
2. **Configure Environment Variables in Vercel Project Settings**:
   - `NEXT_PUBLIC_API_BASE_URL`: HTTPS URL of your deployed FastAPI backend (e.g. `https://api.radar-ai.example.com`).
   - `NEXT_PUBLIC_FIREBASE_API_KEY`: Your Firebase Web API key.
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: `<your-project>.firebaseapp.com`.
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: `<your-project-id>`.
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: OAuth 2.0 Web Client ID from Google Cloud Console (add `https://<your-vercel-domain>/api/auth/oauth-callback` to **Authorized redirect URIs** and `https://<your-vercel-domain>` to **Authorized JavaScript origins**).
   - `NEXT_PUBLIC_REQUIRE_AUTH`: `true`.
3. **Configure FastAPI Backend Environment Variables**:
   - `RADAR_ENV=production`
   - `RADAR_AUTH_REQUIRED=true`
   - `RADAR_WEB_ORIGINS=https://<your-vercel-domain>`
   - `FIREBASE_PROJECT_ID=<your-project-id>`
   - `FIREBASE_WEB_API_KEY=<your-firebase-web-api-key>`
   - `RADAR_ALLOWED_EMAIL_DOMAINS=telkomuniversity.ac.id` (optional domain restriction)
   - `RADAR_TRUST_PROXY_HEADERS=true` (when running behind a reverse proxy / load balancer)

