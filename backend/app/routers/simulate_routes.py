from fastapi import APIRouter
from app.models.schemas import SystemConfig, SimulationResult

router = APIRouter(prefix="/simulate", tags=["Simulate"])

@router.post("/baseline", response_model=SimulationResult)
def baseline_simulation(config: SystemConfig):
    # temporary dummy simulation logic
    result = {
        "turnaround_times": {"P1": 7, "P2": 4},
        "waiting_times": {"P1": 2, "P2": 1},
        "cpu_utilization": 100.0,
        "total_time": 7,
        "context_switches": 3,
        "trace": [
            {"time": 0, "pid": "P1"},
            {"time": 1, "pid": "P1"},
            {"time": 2, "pid": "P2"}
        ]
    }
    return result
