# backend/app/routers/config.py
from __future__ import annotations
from fastapi import APIRouter
from ..models.schemas import SystemConfig, SimulationInput, AcceptsEither
import json
from pathlib import Path

router = APIRouter(prefix="/config", tags=["Configuration"])

@router.post("/submit")
def receive_config(payload: AcceptsEither | SimulationInput):
    """
    Accept either:
      - SimulationInput (nested { system, processes })
      - or AcceptsEither (flattened fields or nested) — AcceptsEither.to_flat() will normalize.
    Returns the normalized SystemConfig dict back to the caller.
    """
    # Normalize to internal flat shape
    flat: SystemConfig = payload.to_flat() if isinstance(payload, AcceptsEither) \
        else AcceptsEither.model_validate(payload.model_dump()).to_flat()
    return {"message": "Configuration received successfully!", "data": flat.model_dump()}

# Backwards-compat POST /config (fallback) so client fallback works
@router.post("/")
def receive_config_root(payload: AcceptsEither | SimulationInput):
    flat: SystemConfig = payload.to_flat() if isinstance(payload, AcceptsEither) \
        else AcceptsEither.model_validate(payload.model_dump()).to_flat()
    return {"message": "Configuration received successfully!", "data": flat.model_dump()}

@router.get("/sample")
def sample_config():
    p = Path(__file__).resolve().parents[1] / "sample_config.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    return data
