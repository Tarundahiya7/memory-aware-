from __future__ import annotations
from fastapi import APIRouter
from ..models.schemas import AcceptsEither, SimulationInput, SimulationResult
from ..core.scheduler import simulate_baseline, simulate_memory_aware

router = APIRouter(prefix="/simulate", tags=["Simulation"])

@router.post("/baseline", response_model=SimulationResult)
def baseline(config: AcceptsEither | SimulationInput):
    flat = config.to_flat() if isinstance(config, AcceptsEither) else AcceptsEither.model_validate(config.model_dump()).to_flat()
    return simulate_baseline(flat)

@router.post("/memory-aware", response_model=SimulationResult)
def memory_aware(config: AcceptsEither | SimulationInput):
    flat = config.to_flat() if isinstance(config, AcceptsEither) else AcceptsEither.model_validate(config.model_dump()).to_flat()
    return simulate_memory_aware(flat)
