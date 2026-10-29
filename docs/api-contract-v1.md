# RADAR API contract v1.0.0

This is the shared contract for the web and API workstreams in RDA-18. Python models in
`apps/api/src/radar_api/contracts.py` validate API payloads; the matching TypeScript types live in
`packages/contracts/src/radar-api.ts`.

## Study analysis response

```json
{
  "schema_version": "1.0.0",
  "study": {
    "study_id": "00000000-0000-4000-8000-000000000001",
    "modality": "CT",
    "status": "ready",
    "slices": [
      {
        "slice_id": "00000000-0000-4000-8000-000000000002",
        "index": 0,
        "image_asset_id": "00000000-0000-4000-8000-000000000003",
        "z_position_mm": 1.5
      }
    ]
  },
  "findings": [
    {
      "finding_id": "00000000-0000-4000-8000-000000000005",
      "category": "suspected_intracranial_hemorrhage",
      "evidence_slice_ids": ["00000000-0000-4000-8000-000000000002"],
      "confidence": 0.25,
      "review_status": "pending",
      "model_version_id": "00000000-0000-4000-8000-000000000004"
    }
  ],
  "model_version": {
    "model_version_id": "00000000-0000-4000-8000-000000000004",
    "provider": "meta_model_api",
    "model_id": "muse-spark-1.3",
    "prompt_version": "radar-findings-v1"
  }
}
```

`confidence` is a model-reported score in `[0, 1]`, not a calibrated probability. Every finding
must cite one or more evidence slices and is `pending` human review by default. The contract
contains opaque internal UUIDs and intentionally has no patient name, date of birth, or DICOM UID.
Unknown fields are rejected by the API models so incompatible changes surface during development.

## Study metadata endpoints

- `POST /v1/studies` accepts `CreateStudyRequest` (`{}` or `{"modality":"CT"}`) and returns a
  new `Study` with status `uploaded` and no slices yet.
- `GET /v1/studies` returns the saved studies as a JSON array of `Study` values.
- `GET /v1/studies/{study_id}` returns one `Study` or `404` when it does not exist.

The API stores opaque study and slice UUIDs only. It does not accept patient names, dates of birth,
DICOM UIDs, or image bytes. The dependent upload workstream handles DICOM validation and private
image storage. OpenAPI exposes the route and request/response schemas at `/openapi.json`.

`GET /v1/studies/{study_id}/slices/{slice_id}/image` renders a validated stored slice to a
windowed PNG preview and sends `Cache-Control: private, no-store`.
`GET /v1/studies/{study_id}/slices/{slice_id}/dicom` streams the validated stored Part 10 DICOM
slice (`application/dicom`) with `Cache-Control: private, no-store` so the Cornerstone3D viewer
can perform client-side Hounsfield Unit calibration and windowing on the exact uploaded slice.

`GET /v1/studies/{study_id}/analysis` returns persisted findings in the v1 contract, or `404` if
the study has no completed analysis. It never generates a placeholder finding. Review decisions
are submitted through `POST /v1/studies/{study_id}/findings/{finding_id}/review` with
`{"review_status":"accepted"}`, `rejected`, or `uncertain`. Each decision is stored in
`finding_review_events` and can be read from the corresponding `/reviews` route. Reviewer identity
is currently the fixed local value `local-reviewer`; a real multi-user audit trail requires
authentication before deployment. Each audit event stores both the previous and newly selected
review status.

### Upload one anonymized CT series

`POST /v1/studies/{study_id}/dicom` accepts repeated multipart `files` fields and returns the
updated `Study`. The series must contain readable, single-frame CT images with matching study and
series identifiers, unique SOP instances, valid image geometry, and decodable pixel data. Direct
patient and institution identifiers are rejected. A study accepts one series; use the study UUID
returned by `POST /v1/studies`.

Uploads are streamed to a private filesystem directory (default `apps/api/data/private-images` when
the API is run from `apps/api`). The directory is not mounted as static content. Storage paths use
server-generated UUIDs; client filenames and content types are ignored. On POSIX systems directories
are created with mode `0700` and files with mode `0600`. No DICOM tags or storage paths are returned.

Configurable limits are `RADAR_MAX_DICOM_FILE_BYTES` (64 MiB per file),
`RADAR_MAX_DICOM_SERIES_BYTES` (512 MiB per series), `RADAR_MAX_DICOM_FILES` (512 files), and
`RADAR_MAX_DICOM_PIXELS` (16,777,216 pixels per image). A size or file-count overflow returns `413`,
invalid or identifiable DICOM returns `422`, an unknown study returns `404`, and a study that already
has a series returns `409`.

## Meta model access check

Meta's current Model API documents `https://api.meta.ai/v1`, bearer authentication using
`MODEL_API_KEY`, `GET /models`, and OpenAI-compatible `POST /chat/completions`. The proposed
text-only smoke-check model is `muse-spark-1.3`; the live model catalog is authoritative for what
the account can use. The test sends only the synthetic prompt `Reply with the single word: ready`
and never sends CT images or patient information.

References: [API reference](https://dev.meta.ai/docs/api-reference), [model catalog](https://dev.meta.ai/docs/models),
[chat completions quickstart](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions), and
[pricing, usage, and rate limits](https://dev.meta.ai/docs/pricing-rate-limits).

Run from `apps/api` after placing a Meta API key in the local environment (do not commit it):

```powershell
$env:MODEL_API_KEY = "<local key>"
python scripts/check_meta_model_access.py
```

The script prints model availability, token usage, estimated Standard-mode cost, and available
rate-limit headers. Cost estimate for Muse Spark 1.3 is calculated from current published rates:
input `$1.25` / million tokens, cached input `$0.15` / million tokens, and output `$4.25` /
million tokens. Rates and model availability can change; confirm them in the Meta dashboard before
budgeting. The API reports per-request token usage, while rate limits are shared per team.

**Live access was not tested for this repository** because no `MODEL_API_KEY` is configured. Set
one locally and run the command above to complete the account-specific check. Never paste the key
into chat, a PR, or source control.

## Fallback and safety

- If Meta is unavailable, return an explicit unavailable/error state; do not silently mark an
  unvalidated model or static fixture as real inference.
- A `demo_fixture` provider is permitted only for synthetic demonstration data and must remain
  visibly marked as a fixture. Production/demo integrations can use an `approved_alternate` only
  after its access, cost, contract compatibility, and research validation are recorded.
- Use Standard mode for any approved integration. Do not use Contributor mode for any RADAR data.
- This is research prototyping only, not for clinical use. All model outputs require human review.
