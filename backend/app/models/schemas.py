# backend/app/models/schemas.py
from __future__ import annotations
from pydantic import BaseModel, Field, model_validator
from typing import List, Dict, Optional, Any


# ========= Requests (frontend shape) =========

class Process(BaseModel):
    pid: str
    arrival_time: int
    burst_time: int
    priority: int
    # frontend now sends pages_count (replaces memory_footprint)
    pages_count: int


class SystemParams(BaseModel):
    total_frames: int = Field(..., ge=0)
    page_size: int = Field(..., ge=1)
    cpu_quantum: int = Field(..., ge=1)
    memory_threshold: float = Field(..., ge=0)
    cpu_idle_gap: int = Field(0, ge=0)


class SimulationInput(BaseModel):
    system: SystemParams
    processes: List[Process]


# ========= Internal flattened system config =========

class SystemConfig(BaseModel):
    total_frames: int
    page_size: int
    cpu_quantum: int
    memory_threshold: float
    cpu_idle_gap: int = 0
    processes: List[Process]


class AcceptsEither(BaseModel):
    system: Optional[SystemParams] = None
    processes: Optional[List[Process]] = None

    # support flat keys including cpu_idle_gap (was missing)
    total_frames: Optional[int] = None
    page_size: Optional[int] = None
    cpu_quantum: Optional[int] = None
    memory_threshold: Optional[float] = None
    cpu_idle_gap: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> Any:
        # Accept either {system: {...}, processes: [...]} or the flat form
        if isinstance(v, dict) and "system" in v and "processes" in v:
            return v

        keys = ("total_frames", "page_size", "cpu_quantum", "memory_threshold", "processes")
        # include cpu_idle_gap optionally in the flat-to-nested conversion
        if isinstance(v, dict) and all(k in v for k in keys):
            system = {
                "total_frames": v["total_frames"],
                "page_size": v["page_size"],
                "cpu_quantum": v["cpu_quantum"],
                "memory_threshold": v["memory_threshold"],
            }
            if "cpu_idle_gap" in v:
                system["cpu_idle_gap"] = v["cpu_idle_gap"]
            return {
                "system": system,
                "processes": v["processes"],
            }

        return v

    def to_flat(self) -> SystemConfig:
        assert self.system is not None and self.processes is not None
        return SystemConfig(
            total_frames=self.system.total_frames,
            page_size=self.system.page_size,
            cpu_quantum=self.system.cpu_quantum,
            memory_threshold=self.system.memory_threshold,
            cpu_idle_gap=getattr(self.system, "cpu_idle_gap", 0),
            processes=self.processes,
        )



# ========= Responses (fixed) =========

class TraceEntry(BaseModel):
    time: int
    event: str
    pid: Optional[str] = None


class SimulationResult(BaseModel):
    turnaround_times: Dict[str, int]
    waiting_times: Dict[str, int]
    cpu_utilization: float
    total_time: int
    context_switches: int
    trace: List[TraceEntry]

    # optional: faults per pid (list of times)
    fault_record: Optional[Dict[str, List[int]]] = None

    # memory_timeline: list of objects with pid (string) and start/end ints
    memory_timeline: Optional[List[Dict[str, Any]]] = None

    # inferred quanta & memory estimates per pid (optional)
    inferred_quanta: Optional[Dict[str, int]] = None
    memory_estimates: Optional[Dict[str, int]] = None


class CompareBundle(BaseModel):
    baseline: SimulationResult
    memory_aware: SimulationResult


class SaveRunRequest(BaseModel):
    name: Optional[str] = None
    input: SimulationInput
    results: Dict[str, object]
