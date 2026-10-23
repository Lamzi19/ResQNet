import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.database.connection import engine, Base, SessionLocal
from backend.app.database.models import OfficialAdvisory
from backend.app.api.routes import router
from backend.app.services.predictor_service import load_model_artifact


# Ensure tables exist immediately
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables and seed data
    Base.metadata.create_all(bind=engine)
    print("[ResQNet] Database tables verified/initialized.")
    
    # Preload the machine learning pipeline artifact
    try:
        load_model_artifact()
    except Exception as e:
        print(f"[ResQNet WARNING] Model artifact preload failed: {e}")
        
    # Seed default official advisory if table is empty
    db = SessionLocal()
    try:
        count = db.query(OfficialAdvisory).count()
        if count == 0:
            seed_advisory = OfficialAdvisory(
                district="Dakshina Kannada & Udupi",
                alert_color="YELLOW",
                issuing_agency="IMD Karnataka & KSNDMC Bengaluru",
                description="Coastal Karnataka Monsoon Watch: Isolated heavy showers expected along Western Ghats catchments (Netravati and Swarna river basins). Stay alert in low-lying zones.",
                is_active=True
            )
            db.add(seed_advisory)
            db.commit()
            print("[ResQNet] Seeded default official advisory bulletin.")
    finally:
        db.close()
        
    yield
    print("[ResQNet] Shutting down backend.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Disaster-management AI platform for Mangaluru and coastal Karnataka flood risk prediction (Phase 1).",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Open in development for Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(router, prefix=settings.API_V1_STR)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
