// frontend/src/components/Results.jsx
import { useMemo } from 'react';
import SingleCPUChart from './charts/SingleCPUChart';
import CPUComparison from './charts/CPUComparison';
import DualGantt from './charts/DualGantt';
import CombinedTable from './tables/CombinedTable';

/* ---------- Helpers (robust normalization & timeline -> series) ---------- */

function isIdlePid(pid) {
  if (pid == null) return true;
  const s = String(pid).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (lower === 'idle') return true;
  // some backends may use '0' or '-1' for idle
  if (lower === '0' || lower === '-1') return true;
  return false;
}

/**
 * normalizeTimeline(tl)
 * Accepts timeline in several shapes:
 *  - array of arrays: [pid, start, end] OR [pid, start, duration] (detects duration if end <= start)
 *  - array of objects: { pid, start, end } OR { pid, s, e } OR { pid, start, duration }
 * Returns array of [pid, start, end] with numbers.
 */
function normalizeTimeline(tl = []) {
  if (!tl || !Array.isArray(tl) || tl.length === 0) return [];

  const first = tl[0];

  // If array-of-arrays (tuples)
  if (Array.isArray(first) && first.length >= 3) {
    return tl
      .map((arr) => {
        if (!Array.isArray(arr)) return null;
        const pid = arr[0] == null ? '' : String(arr[0]);
        const s = Number(arr[1]);
        let e = Number(arr[2]);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
        // If third value is <= start, treat it as duration (end = start + duration)
        if (e <= s) e = s + e;
        return [pid, s, e];
      })
      .filter((x) => x && Number.isFinite(x[1]) && Number.isFinite(x[2]));
  }

  // If array-of-objects
  if (first && typeof first === 'object') {
    return tl
      .map((obj) => {
        if (!obj) return null;
        const pid = obj.pid != null ? String(obj.pid) : '';
        if ('start' in obj && 'end' in obj) {
          const s = Number(obj.start ?? 0);
          const e = Number(obj.end ?? 0);
          if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
          return [pid, s, e];
        }
        if ('s' in obj && 'e' in obj) {
          const s = Number(obj.s ?? 0);
          const e = Number(obj.e ?? 0);
          if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
          return [pid, s, e];
        }
        if ('start' in obj && 'duration' in obj) {
          const s = Number(obj.start ?? 0);
          const d = Number(obj.duration ?? 0);
          if (!Number.isFinite(s) || !Number.isFinite(d)) return null;
          return [pid, s, s + d];
        }
        return null;
      })
      .filter(Boolean);
  }

  return [];
}

/**
 * timelineToSeries(timeline, total_time)
 * Builds a per-bucket 0/100 CPU series:
 *  - determines total_time if not provided (max end + 1)
 *  - creates len = ceil(total_time) buckets
 *  - marks bucket busy if any non-IDLE segment covers that bucket
 * Returns { series: [{time, cpu}], meta: { len, busyCount, busyPct } }
 */
function timelineToSeries(timeline = [], total_time = 0) {
  const norm = normalizeTimeline(timeline);
  if (!norm.length) return { series: [], meta: { len: 0, busyCount: 0, busyPct: 0 } };

  const times = norm.flatMap((s) => [Number(s[1]), Number(s[2])]).filter(Number.isFinite);
  let tt = Number(total_time) || 0;
  if (!tt) tt = times.length ? Math.max(...times) + 1 : 0;
  if (!Number.isFinite(tt) || tt <= 0) return { series: [], meta: { len: 0, busyCount: 0, busyPct: 0 } };

  const len = Math.max(0, Math.ceil(tt));
  const busy = new Array(len).fill(false);

  for (const seg of norm) {
    const pid = String(seg[0]);
    const s = Number(seg[1]);
    const e = Number(seg[2]);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    // clamp start/end to valid range
    const startBucket = Math.floor(Math.max(0, Math.min(s, len)));
    const endBucket = Math.max(0, Math.min(len, Math.ceil(e)));
    // mark busy only for non-IDLE segments
    if (isIdlePid(pid)) continue;
    for (let t = startBucket; t < endBucket; t++) {
      busy[t] = true;
    }
  }

  const busyCount = busy.reduce((a, v) => a + (v ? 1 : 0), 0);
  const busyPct = len ? Math.round((busyCount / len) * 100) : 0;
  return { series: busy.map((b, i) => ({ time: i, cpu: b ? 100 : 0 })), meta: { len, busyCount, busyPct } };
}

/* ---------- Main component (Results) ---------- */

export default function Results({ baseline = null, memoryAware = null }) {
  const baseSeries = useMemo(() => {
    if (!baseline) return [];
    const tt = Number(baseline.total_time) || 0;

    // prefer backend-provided cpu_series
    if (Array.isArray(baseline.cpu_series) && baseline.cpu_series.length) {
      console.debug('[Results] using baseline.cpu_series from backend');
      return baseline.cpu_series.map((p, i) => {
        if (p == null) return { time: i, cpu: 0 };
        if (typeof p === 'object' && 'time' in p && 'cpu' in p) return { time: Number(p.time), cpu: Number(p.cpu) };
        if (Array.isArray(p)) return { time: Number(p[0]), cpu: Number(p[1]) };
        return { time: i, cpu: Number(p) || 0 };
      });
    }

    // prefer memory_timeline if present
    if (Array.isArray(baseline.memory_timeline) && baseline.memory_timeline.length) {
      const out = timelineToSeries(baseline.memory_timeline, tt);
      console.debug('[Results] baseline: built series from memory_timeline meta=', out.meta);
      return out.series;
    }

    // fallback to trace
    if (Array.isArray(baseline.trace)) {
      const trace = baseline.trace;
      const times = trace.map((r) => Number(r?.time ?? NaN)).filter(Number.isFinite);
      let inferredTT = tt || (times.length ? Math.max(...times) + 1 : 0);
      const len = Math.max(0, Math.ceil(inferredTT));
      const busy = new Array(len).fill(false);
      trace.forEach((ev) => {
        if (ev && ev.event === 'running') {
          const t = Math.floor(Number(ev.time));
          if (t >= 0 && t < len) busy[t] = true;
        }
      });
      const busyCount = busy.reduce((a, v) => a + (v ? 1 : 0), 0);
      const meta = { len, busyCount, busyPct: len ? Math.round((busyCount / len) * 100) : 0 };
      console.debug('[Results] baseline: built series from trace meta=', meta);
      return busy.map((b, i) => ({ time: i, cpu: b ? 100 : 0 }));
    }

    return [];
  }, [baseline]);

  const marrSeries = useMemo(() => {
    if (!memoryAware) return [];
    const tt = Number(memoryAware.total_time) || 0;

    if (Array.isArray(memoryAware.cpu_series) && memoryAware.cpu_series.length) {
      console.debug('[Results] using memoryAware.cpu_series from backend');
      return memoryAware.cpu_series.map((p, i) => {
        if (p == null) return { time: i, cpu: 0 };
        if (typeof p === 'object' && 'time' in p && 'cpu' in p) return { time: Number(p.time), cpu: Number(p.cpu) };
        if (Array.isArray(p)) return { time: Number(p[0]), cpu: Number(p[1]) };
        return { time: i, cpu: Number(p) || 0 };
      });
    }

    if (Array.isArray(memoryAware.memory_timeline) && memoryAware.memory_timeline.length) {
      const out = timelineToSeries(memoryAware.memory_timeline, tt);
      console.debug('[Results] memoryAware: built series from memory_timeline meta=', out.meta);
      return out.series;
    }

    if (Array.isArray(memoryAware.trace)) {
      const trace = memoryAware.trace;
      const times = trace.map((r) => Number(r?.time ?? NaN)).filter(Number.isFinite);
      let inferredTT = tt || (times.length ? Math.max(...times) + 1 : 0);
      const len = Math.max(0, Math.ceil(inferredTT));
      const busy = new Array(len).fill(false);
      trace.forEach((ev) => {
        if (ev && ev.event === 'running') {
          const t = Math.floor(Number(ev.time));
          if (t >= 0 && t < len) busy[t] = true;
        }
      });
      const busyCount = busy.reduce((a, v) => a + (v ? 1 : 0), 0);
      const meta = { len, busyCount, busyPct: len ? Math.round((busyCount / len) * 100) : 0 };
      console.debug('[Results] memoryAware: built series from trace meta=', meta);
      return busy.map((b, i) => ({ time: i, cpu: b ? 100 : 0 }));
    }

    return [];
  }, [memoryAware]);

  // Process ordering: prefer input ordering; hide 'IDLE' from chips/list
  const processes = useMemo(() => {
    const list = Array.isArray(baseline?.input?.processes)
      ? baseline.input.processes
      : Array.isArray(memoryAware?.input?.processes)
      ? memoryAware.input.processes
      : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((p) => {
        if (!p) return '';
        if (typeof p === 'object' && 'pid' in p) return String(p.pid);
        return String(p);
      })
      .filter((pid) => pid !== 'IDLE' && pid !== 'idle' && pid !== '0' && pid !== '' && pid != null);
  }, [baseline, memoryAware]);

  // Decide which view to show
  const showBaselineOnly = !!baseline && !memoryAware;
  const showMemoryOnly = !!memoryAware && !baseline;
  const showBoth = !!baseline && !!memoryAware;

  // Prepare timelines for DualGantt; return normalized arrays (pid,start,end)
  const baselineTimeline = useMemo(() => {
    if (Array.isArray(baseline?.memory_timeline) && baseline.memory_timeline.length) {
      return normalizeTimeline(baseline.memory_timeline);
    }
    if (Array.isArray(baseline?.trace) && baseline.trace.length) {
      const trace = baseline.trace;
      const tl = [];
      let curPid = null;
      let curStart = null;
      for (const e of trace) {
        if (!e) continue;
        const isRun = e.event === 'running';
        const pid = e.pid ?? null;
        const t = Number(e.time ?? NaN);
        if (!isRun) {
          if (curPid !== null) {
            tl.push([String(curPid), curStart, t]);
            curPid = null;
            curStart = null;
          }
          continue;
        }
        if (curPid === null) {
          curPid = pid;
          curStart = t;
        } else if (pid !== curPid) {
          tl.push([String(curPid), curStart, t]);
          curPid = pid;
          curStart = t;
        }
      }
      if (curPid !== null) {
        const last = Math.max(...trace.map((r) => Number(r.time ?? 0)));
        tl.push([String(curPid), curStart, last + 1]);
      }
      return tl;
    }
    return [];
  }, [baseline]);

  const marrTimeline = useMemo(() => {
    if (Array.isArray(memoryAware?.memory_timeline) && memoryAware.memory_timeline.length) {
      return normalizeTimeline(memoryAware.memory_timeline);
    }
    if (Array.isArray(memoryAware?.trace) && memoryAware.trace.length) {
      const trace = memoryAware.trace;
      const tl = [];
      let curPid = null;
      let curStart = null;
      for (const e of trace) {
        if (!e) continue;
        const isRun = e.event === 'running';
        const pid = e.pid ?? null;
        const t = Number(e.time ?? NaN);
        if (!isRun) {
          if (curPid !== null) {
            tl.push([String(curPid), curStart, t]);
            curPid = null;
            curStart = null;
          }
          continue;
        }
        if (curPid === null) {
          curPid = pid;
          curStart = t;
        } else if (pid !== curPid) {
          tl.push([String(curPid), curStart, t]);
          curPid = pid;
          curStart = t;
        }
      }
      if (curPid !== null) {
        const last = Math.max(...trace.map((r) => Number(r.time ?? 0)));
        tl.push([String(curPid), curStart, last + 1]);
      }
      return tl;
    }
    return [];
  }, [memoryAware]);

  // Debugging: sample outputs (helps identify why 100% might appear)
  // (Leave these; remove or toggle as needed)
  console.debug('[Results] baseSeries sample:', baseSeries.slice(0, 40));
  console.debug('[Results] marrSeries sample:', marrSeries.slice(0, 40));
  if (baseline?.memory_timeline) console.debug('[Results] baseline.memory_timeline sample:', baseline.memory_timeline.slice(0, 40));
  if (memoryAware?.memory_timeline) console.debug('[Results] memoryAware.memory_timeline sample:', memoryAware.memory_timeline.slice(0, 40));

  return (
    <div className="grid gap-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
          <div className="text-sm opacity-80">Baseline CPU Util (%)</div>
          <div className="text-2xl font-semibold">
            {baseline?.cpu_utilization != null ? Number(baseline.cpu_utilization).toFixed(2) : '–'}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
          <div className="text-sm opacity-80">Memory-Aware CPU Util (%)</div>
          <div className="text-2xl font-semibold">
            {memoryAware?.cpu_utilization != null ? Number(memoryAware.cpu_utilization).toFixed(2) : '–'}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
          <div className="text-sm opacity-80">Baseline Time</div>
          <div className="text-2xl font-semibold">{baseline?.total_time ?? '–'}</div>
        </div>

        <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
          <div className="text-sm opacity-80">Memory-Aware Time</div>
          <div className="text-2xl font-semibold">{memoryAware?.total_time ?? '–'}</div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Baseline-only -> show baseline CPU chart */}
        {showBaselineOnly && <SingleCPUChart series={baseSeries} title={'Baseline CPU Utilization'} color={'#FFA500'} />}

        {/* Memory-only -> show memory-aware CPU chart */}
        {showMemoryOnly && <SingleCPUChart series={marrSeries} title={'Memory-Aware CPU Utilization'} color={'#2ECC71'} />}

        {/* Both -> comparison + gantt + combined table */}
        {showBoth && (
          <>
            <CPUComparison baseSeries={baseSeries} marrSeries={marrSeries} />

            <DualGantt
              baseline={baselineTimeline}
              marr={marrTimeline}
              processesOrder={processes}
              baseline_quanta={baseline?.inferred_quanta || {}}
            />

            <CombinedTable
              processes={processes}
              mem_est={memoryAware?.memory_estimates || baseline?.memory_estimates || {}}
              inferred_quanta={memoryAware?.inferred_quanta || baseline?.inferred_quanta || {}}
              baselineMetrics={{
                waiting_times: baseline?.waiting_times || {},
                turnaround_times: baseline?.turnaround_times || {},
              }}
              memoryMetrics={{
                waiting_times: memoryAware?.waiting_times || {},
                turnaround_times: memoryAware?.turnaround_times || {},
              }}
              cpu_base_util={baseline?.cpu_utilization ?? 0}
              cpu_marr_util={memoryAware?.cpu_utilization ?? 0}
              ctx_base={baseline?.context_switches ?? 0}
              ctx_marr={memoryAware?.context_switches ?? 0}
            />
          </>
        )}
      </div>
    </div>
  );
}
