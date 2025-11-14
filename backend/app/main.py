from __future__ import annotations
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.base import Base, engine
from .routers import config, simulate, compare, runs

app = FastAPI(title="Memory-Aware Scheduler Backend", version="2.0.0")

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins] if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config.router)
app.include_router(simulate.router)
app.include_router(compare.router)
app.include_router(runs.router)

@app.get("/")
def root():
    return {"message": "Memory-Aware CPU Scheduler Backend is running!"}
