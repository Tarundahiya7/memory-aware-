from app.models.schemas import SystemConfig, SimulationResult
import random
from collections import deque

# ---------------- Baseline ----------------
def simulate_baseline(config: SystemConfig) -> SimulationResult:
    time = 0
    cpu_busy_time = 0
    context_switches = 0
    trace = []

    ready_q = deque()
    processes = {p.pid: {"arrival": p.arrival_time, "burst": p.burst_time, "remaining": p.burst_time}
                 for p in config.processes}
    turnaround_times, waiting_times = {}, {}

    while processes:
        # enqueue
        for pid, p in list(processes.items()):
            if p["arrival"] == time:
                ready_q.append(pid)

        # finished?
        finished = [pid for pid, p in processes.items() if p["remaining"] <= 0]
        for pid in finished:
            turnaround_times[pid] = time - processes[pid]["arrival"]
            processes.pop(pid)
            if pid in ready_q:
                ready_q.remove(pid)

        if not ready_q:
            trace.append({"time": time, "running": "IDLE"})
            time += 1
            continue

        running = ready_q.popleft()
        context_switches += 1
        for _ in range(config.cpu_quantum):
            if running not in processes:
                break
            cpu_busy_time += 1
            processes[running]["remaining"] -= 1
            trace.append({"time": time, "running": running})
            time += 1

        if running in processes and processes[running]["remaining"] > 0:
            ready_q.append(running)

    total_time = time
    cpu_util = (cpu_busy_time / total_time) * 100
    waiting_times = {pid: turnaround_times[pid] - config.processes[i].burst_time
                     for i, pid in enumerate(turnaround_times)}

    return SimulationResult(
        turnaround_times=turnaround_times,
        waiting_times=waiting_times,
        cpu_utilization=cpu_util,
        total_time=total_time,
        context_switches=context_switches,
        trace=trace
    )


# ---------------- Memory Aware ----------------
def simulate_memory_aware(config: SystemConfig) -> SimulationResult:
    time = 0
    cpu_busy_time = 0
    context_switches = 0
    trace = []

    ready_q = deque()
    page_fault_window = 5
    threshold = config.memory_threshold
    recent_faults, page_faults = {}, {}

    processes = {p.pid: {
        "arrival": p.arrival_time,
        "burst": p.burst_time,
        "remaining": p.burst_time,
        "priority": p.priority,
        "mem": p.memory_footprint
    } for p in config.processes}

    turnaround_times, waiting_times = {}, {}
    for pid in processes:
        recent_faults[pid] = []
        page_faults[pid] = 0

    while processes:
        for pid, p in list(processes.items()):
            if p["arrival"] == time:
                ready_q.append(pid)

        finished = [pid for pid, p in processes.items() if p["remaining"] <= 0]
        for pid in finished:
            turnaround_times[pid] = time - processes[pid]["arrival"]
            processes.pop(pid)
            if pid in ready_q:
                ready_q.remove(pid)

        if not ready_q:
            trace.append({"time": time, "running": "IDLE"})
            time += 1
            continue

        # priority adjustment based on faults
        effective_priorities = {}
        for pid in ready_q:
            faults_recent = len([f for f in recent_faults[pid] if time - f < page_fault_window])
            penalty = 10 if faults_recent > threshold else 0
            effective_priorities[pid] = processes[pid]["priority"] + penalty

        running = min(ready_q, key=lambda pid: effective_priorities[pid])
        ready_q.remove(running)
        context_switches += 1

        for _ in range(config.cpu_quantum):
            if running not in processes:
                break
            cpu_busy_time += 1
            processes[running]["remaining"] -= 1
            trace.append({"time": time, "running": running})

            if random.random() < 0.15:  # simulate 15% page fault chance
                page_faults[running] += 1
                recent_faults[running].append(time)
            time += 1

        if running in processes and processes[running]["remaining"] > 0:
            ready_q.append(running)

    total_time = time
    cpu_util = (cpu_busy_time / total_time) * 100
    waiting_times = {pid: turnaround_times[pid] - config.processes[i].burst_time
                     for i, pid in enumerate(turnaround_times)}

    return SimulationResult(
        turnaround_times=turnaround_times,
        waiting_times=waiting_times,
        cpu_utilization=cpu_util,
        total_time=total_time,
        context_switches=context_switches,
        trace=trace
    )


def compare_schedulers(config: SystemConfig):
    baseline = simulate_scheduler(config, memory_aware=False)
    memory = simulate_scheduler(config, memory_aware=True)

    return {
        "metrics": {
            "CPU Utilization (%)": {
                "Baseline": baseline.cpu_utilization,
                "Memory-Aware": memory.cpu_utilization
            },
            "Total Time": {
                "Baseline": baseline.total_time,
                "Memory-Aware": memory.total_time
            },
            "Context Switches": {
                "Baseline": baseline.context_switches,
                "Memory-Aware": memory.context_switches
            }
        },
        "turnaround_times": {
            "Baseline": baseline.turnaround_times,
            "Memory-Aware": memory.turnaround_times
        },
        "waiting_times": {
            "Baseline": baseline.waiting_times,
            "Memory-Aware": memory.waiting_times
        }
    }
