from fastapi import FastAPI

from radar_api.contracts import StudyAnalysisResponse

app = FastAPI(
    title="RADAR AI API",
    description="Research prototype API for brain CT review assistance. Not for clinical use.",
    version="0.1.0",
)


@app.get("/health", tags=["operations"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": "research-prototype"}


@app.get("/v1/contracts/study-analysis", tags=["contracts"])
def study_analysis_contract() -> dict[str, object]:
    """Expose the versioned JSON Schema used by API and frontend workstreams."""

    return StudyAnalysisResponse.model_json_schema()
