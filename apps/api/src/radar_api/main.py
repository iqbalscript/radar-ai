from fastapi import FastAPI

app = FastAPI(
    title="RADAR AI API",
    description="Research prototype API for brain CT review assistance. Not for clinical use.",
    version="0.1.0",
)


@app.get("/health", tags=["operations"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": "research-prototype"}
