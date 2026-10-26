# RADAR AI

RADAR AI is a research prototype for assisting review of brain CT studies. It is **not for clinical use** and does not replace a qualified clinician.

This repository follows the RADAR AI setup task in Jira: [RDA-8](https://iqbaldovandraa.atlassian.net/browse/RDA-8). Product work is tracked in Jira project **RDA**.

## Repository layout

```text
apps/
  api/             FastAPI service and API smoke tests
  web/             Next.js App Router application
docs/              Architecture and development workflow
packages/
  contracts/       Shared API contract documentation
```

## Requirements

- Node.js 20.9 or newer and npm
- Python 3.12

## Local setup

1. Copy `.env.example` to `apps/web/.env.local` and fill in local values. Do not commit local environment files or credentials.
2. Start the web app:

   ```powershell
   cd apps/web
   npm install
   npm run dev
   ```

3. In a second terminal, start the API:

   ```powershell
   cd apps/api
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   $env:PYTHONPATH = "src"
   uvicorn radar_api.main:app --reload --port 8000
   ```

The web app runs at <http://localhost:3000>; the API health check is at <http://localhost:8000/health>.
The shared API response contract is documented in [`docs/api-contract-v1.md`](docs/api-contract-v1.md)
and served as JSON Schema at <http://localhost:8000/v1/contracts/study-analysis>.

## Quality checks

```powershell
cd apps/web
npm install
npm run lint
npm run typecheck

cd ../api
python -m pip install -r requirements.txt
python -m ruff check .
python -m pytest
```

GitHub Actions runs these checks for pull requests and pushes to `main`. CI does not need secrets. The lockfile should be committed after the first dependency install so CI can switch to `npm ci`.

## Git and pull requests

- Keep `main` releasable; do development on short-lived branches named `feat/<summary>`, `fix/<summary>`, or `docs/<summary>`.
- Use pull requests to merge into `main`. Link the relevant Jira issue in the PR title or body (for example, `RDA-8`).
- Require passing CI and at least one approval before merging. Enable branch protection for `main` in GitHub repository settings once repository administration is available.
- Do not commit patient data, model weights, secrets, or generated datasets. Use only anonymized or synthetic fixtures approved for the project.

## Scope and safety

The RSNA Brain CT Hemorrhage dataset licensing assessment, source metadata manifest, and outstanding local profiling dependency are documented in [`docs/rsna-ich-licensing-and-profile.md`](docs/rsna-ich-licensing-and-profile.md) and [`docs/rsna-ich-source-manifest.json`](docs/rsna-ich-source-manifest.json). Dataset files and patient-level metadata must remain outside this repository.

The project is an early research/demo prototype. Model outputs are experimental, require human review, and must not be used to diagnose, triage, or make treatment decisions. Follow the data license and privacy requirements before using any dataset.
