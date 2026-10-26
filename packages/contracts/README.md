# API contracts

The v1 study-analysis request and response schemas are shared between the API and frontend workstreams (v1.0.0).

- TypeScript definitions: [`src/radar-api.ts`](src/radar-api.ts), consumed by `apps/web` via `@radar-ai/contracts`.
- Python validation models: `apps/api/src/radar_api/contracts.py` (RDA-18).
- Contract details and example payload: [`docs/api-contract-v1.md`](../../docs/api-contract-v1.md).
- Runtime JSON Schema: `GET /v1/contracts/study-analysis`.

Keep breaking changes versioned and link schema changes to the relevant Jira issue (`RDA-4`, `RDA-18`) and pull request. This contract is for research prototyping only, not clinical use.
