from pydantic import BaseModel
from typing import List, Dict, Optional

# ----- Phase 1 Schema -----
class Process(BaseModel):
    pid: str
    arrival_time: int
    burst_time: int
    priority: int
    memory_footprint: int
    access_pattern: Optional[List[int]] = None


class SystemConfig(BaseModel):
    total_ram_frames: int
    page_size: int
    cpu_quantum: int
    memory_threshold: float
    processes: List[Process]


# ----- Phase 2 Schema (Output) -----
class SimulationResult(BaseModel):
    turnaround_times: Dict[str, int]
    waiting_times: Dict[str, int]
    cpu_utilization: float
    total_time: int
    context_switches: int
    trace: List[Dict[str, str]]
