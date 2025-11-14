# backend/app/core/scheduler.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple

from ..models.schemas import SystemConfig, SimulationResult, TraceEntry

# ---------- helpers ----------
def trace_to_timeline(trace: List[TraceEntry]) -> List[Dict[str, Any]]:
    # keep your previous implementation (unchanged) or reuse below if necessary
    timeline: List[Dict[str, Any]] = []
    cur_pid = None
    cur_start = None
    times = [entry.time for entry in trace if entry and entry.time is not None]
    inferredLastTime = max(times) if times else 0

    for entry in trace:
        if entry.event != "running":
            if cur_pid is not None:
                timeline.append({"pid": cur_pid, "start": cur_start, "end": entry.time})
                cur_pid = None
                cur_start = None
            continue
        if cur_pid is None:
            cur_pid = entry.pid
            cur_start = entry.time
        elif entry.pid != cur_pid:
            timeline.append({"pid": cur_pid, "start": cur_start, "end": entry.time})
            cur_pid = entry.pid
            cur_start = entry.time
    if cur_pid is not None:
        last_time = trace[-1].time if trace else inferredLastTime
        timeline.append({"pid": cur_pid, "start": cur_start, "end": last_time + 1})
    return timeline


def simulate_rr_with_quanta(processes: List[str], bursts: List[int], quanta: Dict[str, int],
                            arrivals: Optional[Dict[str, int]] = None, idle_between_quanta: int = 0
                           ) -> List[Tuple[str, int, int]]:
    """
    RR scheduler that respects per-process arrival times.
    Returns timeline: list of (pid, start, end)
    idle_between_quanta: if >0, insert an IDLE segment of that length after each quantum (useful for visualization)
    """
    if arrivals is None:
        arrivals = {p: 0 for p in processes}
    rem = {p: b for p, b in zip(processes, bursts)}
    timeline: List[Tuple[str, int, int]] = []
    t = 0
    rr_order = list(processes)
    # loop until all done
    while any(rem[p] > 0 for p in processes):
        made_progress = False
        for p in rr_order:
            if rem[p] <= 0:
                continue
            if arrivals.get(p, 0) > t:
                continue
            q = int(round(quanta.get(p, 1)))
            use = min(q, rem[p])
            start, end = t, t + use
            timeline.append((p, start, end))
            rem[p] -= use
            t = end
            made_progress = True

            # If configured, insert idle gap after this quantum if there is still remaining work
            if idle_between_quanta and any(rem[x] > 0 for x in processes):
                timeline.append(("IDLE", t, t + int(idle_between_quanta)))
                t = t + int(idle_between_quanta)

        if not made_progress:
            future_arrivals = [arrivals[p] for p in processes if rem[p] > 0 and arrivals.get(p, 0) > t]
            if not future_arrivals:
                break
            next_t = int(min(future_arrivals))
            if next_t > t:
                timeline.append(("IDLE", t, next_t))
            t = next_t
    return timeline


def count_context_switches(timeline: List[Tuple[str, int, int]]) -> int:
    if not timeline:
        return 0
    switches = 0
    prev = None
    for pid, s, e in timeline:
        if prev is None:
            prev = pid
            continue
        if pid == "IDLE" or prev == "IDLE":
            prev = pid
            continue
        if pid != prev:
            switches += 1
        prev = pid
    return switches


def compute_wait_turnaround(processes: List[str], bursts: List[int], timeline: List[tuple],
                            arrivals: Optional[Dict[str, int]] = None):
    if arrivals is None:
        arrivals = {p: 0 for p in processes}
    completion: Dict[str, int] = {}
    for pid, s, e in timeline:
        if pid == "IDLE":
            continue
        completion[pid] = e
    waiting, turnaround = {}, {}
    for p, bt in zip(processes, bursts):
        arr = arrivals.get(p, 0)
        comp = completion.get(p, None)
        if comp is None:
            turnaround[p] = 0
            waiting[p] = 0
            continue
        tat = comp - arr
        wt = tat - bt
        turnaround[p] = tat
        waiting[p] = wt
    avg_wait = sum(waiting.values()) / len(processes) if processes else 0
    avg_tat = sum(turnaround.values()) / len(processes) if processes else 0
    return waiting, turnaround, avg_wait, avg_tat


def simulate_baseline(cfg: SystemConfig) -> SimulationResult:
    processes = [p.pid for p in cfg.processes]
    bursts = [p.burst_time for p in cfg.processes]
    arrivals = {p.pid: p.arrival_time for p in cfg.processes}
    baseline_quanta = {p: cfg.cpu_quantum for p in processes}

    # pass idle_between_quanta from cfg.cpu_idle_gap
    timeline = simulate_rr_with_quanta(processes, bursts, baseline_quanta, arrivals=arrivals, idle_between_quanta=getattr(cfg, "cpu_idle_gap", 0))
    ctx = count_context_switches(timeline)
    waiting, turnaround, avg_wait, avg_tat = compute_wait_turnaround(processes, bursts, timeline, arrivals=arrivals)

    total_time = timeline[-1][2] if timeline else 0
    cpu_busy = sum((e - s) for (pid, s, e) in timeline if pid != "IDLE")
    utilization = (cpu_busy / total_time) * 100.0 if total_time > 0 else 0.0

    trace: List[TraceEntry] = []
    for pid, s, e in timeline:
        if pid == "IDLE":
            for t in range(s, e):
                trace.append(TraceEntry(time=t, event="idle", pid=None))
        else:
            for t in range(s, e):
                trace.append(TraceEntry(time=t, event="running", pid=pid))

    # do not include IDLE rows in the per-process memory_timeline — frontend expects only real process bars
    memory_timeline = [{"pid": pid, "start": s, "end": e} for (pid, s, e) in timeline if pid != "IDLE"]


    return SimulationResult(
        turnaround_times=turnaround,
        waiting_times=waiting,
        cpu_utilization=utilization,
        total_time=total_time,
        context_switches=ctx,
        trace=trace,
        memory_timeline=memory_timeline,
    )


def simulate_memory_aware(cfg: SystemConfig) -> SimulationResult:
    processes = [p.pid for p in cfg.processes]
    bursts = [p.burst_time for p in cfg.processes]
    arrivals = {p.pid: p.arrival_time for p in cfg.processes}

    mem_estimates: Dict[str, int] = {}
    inferred_quanta: Dict[str, int] = {}
    for p in cfg.processes:
        mem_signal = min(1.0, (getattr(p, "pages_count", 0) / max(1, cfg.total_frames)))
        mem_estimates[p.pid] = int(8 + mem_signal * (320 - 8))
        inferred_quanta[p.pid] = max(1, int(round(cfg.cpu_quantum * (1.0 + mem_signal))))

    timeline = simulate_rr_with_quanta(processes, bursts, inferred_quanta, arrivals=arrivals, idle_between_quanta=getattr(cfg, "cpu_idle_gap", 0))
    ctx = count_context_switches(timeline)
    waiting, turnaround, avg_wait, avg_tat = compute_wait_turnaround(processes, bursts, timeline, arrivals=arrivals)

    total_time = timeline[-1][2] if timeline else 0
    cpu_busy = sum((e - s) for (pid, s, e) in timeline if pid != "IDLE")
    utilization = (cpu_busy / total_time) * 100.0 if total_time > 0 else 0.0

    trace: List[TraceEntry] = []
    for pid, s, e in timeline:
        if pid == "IDLE":
            for t in range(s, e):
                trace.append(TraceEntry(time=t, event="idle", pid=None))
        else:
            for t in range(s, e):
                trace.append(TraceEntry(time=t, event="running", pid=pid))

    fault_record = {p.pid: [] for p in cfg.processes}

    # do not include IDLE rows in the per-process memory_timeline — frontend expects only real process bars
    memory_timeline = [{"pid": pid, "start": s, "end": e} for (pid, s, e) in timeline if pid != "IDLE"]


    return SimulationResult(
        turnaround_times=turnaround,
        waiting_times=waiting,
        cpu_utilization=utilization,
        total_time=total_time,
        context_switches=ctx,
        trace=trace,
        fault_record=fault_record,
        memory_timeline=memory_timeline,
        inferred_quanta=inferred_quanta,
        memory_estimates=mem_estimates,
    )


def compare_schedulers(cfg: SystemConfig) -> Dict[str, SimulationResult]:
    return {
        "baseline": simulate_baseline(cfg),
        "memory_aware": simulate_memory_aware(cfg),
    }
