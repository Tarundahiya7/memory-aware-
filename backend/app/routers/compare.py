from __future__ import annotations
from fastapi import APIRouter
from ..models.schemas import AcceptsEither, SimulationInput, CompareBundle
from ..core.scheduler import compare_schedulers

router = APIRouter(prefix="/compare", tags=["Comparison"])

# Accept both '/compare' and '/compare/' without redirect
@router.post("", response_model=CompareBundle)
@router.post("/", response_model=CompareBundle)
def compare(config: AcceptsEither | SimulationInput):
    flat = config.to_flat() if isinstance(config, AcceptsEither) \
           else AcceptsEither.model_validate(config.model_dump()).to_flat()
    return compare_schedulers(flat)
