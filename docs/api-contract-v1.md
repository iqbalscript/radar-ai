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
