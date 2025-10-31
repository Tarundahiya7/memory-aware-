from fastapi import APIRouter
from app.models.schemas import SystemConfig, SimulationResult
from app.core.scheduler import simulate_baseline, simulate_memory_aware

router = APIRouter(prefix="/simulate", tags=["Simulation"])

@router.post("/baseline", response_model=SimulationResult)
def baseline(config: SystemConfig):
    return simulate_baseline(config)

@router.post("/memory-aware", response_model=SimulationResult)
def memory_aware(config: SystemConfig):
    return simulate_memory_aware(config)
