// frontend/src/App.jsx
import { useEffect, useState } from 'react';
import { Download, Play, GitCompare, Save } from 'lucide-react';
import ConfigForm from './components/ConfigForm';
import ExcelUpload from './components/ExcelUpload';
import Results from './components/Results';
import CompareRuns from './components/CompareRuns';
import ThemeToggle from './theme/ThemeToggle';
import { api } from './api/apiClient';
import { resolveBaseURL } from './utils/env';

const blankSystem = { total_frames: '', page_size: '', cpu_quantum: '', memory_threshold: '' , cpu_idle_gap: '1' };
const blankProcess = (i = 1) => ({ pid: `P${i}`, arrival_time: '', burst_time: '', priority: '', pages_count: '' });

export default function App() {
  const [system, setSystem] = useState({ ...blankSystem });
  const [processes, setProcesses] = useState([blankProcess(1)]);
  const [loading, setLoading] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [memoryAware, setMemoryAware] = useState(null);
  const [apiUrl, setApiUrl] = useState(resolveBaseURL());

  useEffect(() => {
    api.getSample()
      .then((res) => {
        const s = res?.data?.system;
        const pro = res?.data?.processes;
        if (s) setSystem((prev) => ({ ...prev, ...s }));
        if (Array.isArray(pro) && pro.length) {
          setProcesses(pro.map((p, i) => ({ ...blankProcess(i + 1), ...p })));
        }
      })
      .catch(() => {});
  }, []);

  const toPayload = (systemObj, processesArr) => ({
    system: {
      total_frames: Number(systemObj.total_frames),
      page_size: Number(systemObj.page_size),
      cpu_quantum: Number(systemObj.cpu_quantum),
      memory_threshold: Number(systemObj.memory_threshold),
      cpu_idle_gap: Number(systemObj.cpu_idle_gap || 0),
    },
    processes: (Array.isArray(processesArr) ? processesArr : []).map((p) => ({
      pid: String(p.pid),
      arrival_time: Number(p.arrival_time),
      burst_time: Number(p.burst_time),
      priority: Number(p.priority),
      pages_count: Number(p.pages_count),
    })),
  });

  const validPayload = (payload) => {
    if (!payload || !payload.system || !Array.isArray(payload.processes)) return false;
    const s = payload.system;
    const sysOk = [s.total_frames, s.page_size, s.cpu_quantum, s.memory_threshold].every(
      (x) => Number.isFinite(x) && x >= 0
    );
    const proOk =
      payload.processes.length > 0 &&
      payload.processes.every((p) => {
        const allNums = [p.arrival_time, p.burst_time, p.priority, p.pages_count].every(
          (x) => Number.isFinite(x) && x >= 0
        );
        return allNums && !!p.pid;
      });
    return sysOk && proOk;
  };

  const saveRunLocal = (name, input, results) => {
    try {
      const key = 'scheduler_runs';
      const now = new Date().toISOString();
      const record = { id: crypto?.randomUUID?.() ?? String(Date.now()), name, input, results, created_at: now };
      const raw = localStorage.getItem(key);
      const arr = Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
      arr.unshift(record);
      localStorage.setItem(key, JSON.stringify(arr));
      return record;
    } catch (err) {
      console.warn('Failed to save run locally', err);
      return null;
    }
  };

  const run = async (mode) => {
    const payload = toPayload(system, processes);
    if (!validPayload(payload)) {
      alert('Please fill all numeric fields with non-negative numbers.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'baseline') {
        setMemoryAware(null);

        const resp = await api.simulateBaseline(payload);
        const data = resp?.data ?? null;
        window.__lastBaselineForDebug = data; // stash for console debugging

        console.group('[API] simulateBaseline response');
        console.log('raw response', resp);
        console.log('data.total_time:', data?.total_time);
        console.log('data.cpu_series (first 40):', data?.cpu_series ? data.cpu_series.slice(0, 40) : data?.cpu_series);
        console.log('data.memory_timeline (first 40):', data?.memory_timeline ? data.memory_timeline.slice(0, 40) : data?.memory_timeline);
        console.log('data.trace (first 40):', data?.trace ? data.trace.slice(0, 40) : data?.trace);
        console.groupEnd();

        if (!data) throw new Error('Invalid response from baseline API');
        setBaseline({ ...data, input: payload });
        saveRunLocal(`Run ${new Date().toLocaleString()} (Baseline)`, payload, { baseline: data });
      } else if (mode === 'memory') {
        setBaseline(null);

        const resp = await api.simulateMemoryAware(payload);
        const data = resp?.data ?? null;
        window.__lastMemoryAwareForDebug = data; // stash for debugging

        console.group('[API] simulateMemoryAware response');
        console.log('raw response', resp);
        console.log('data.total_time:', data?.total_time);
        console.log('data.cpu_series (first 40):', data?.cpu_series ? data.cpu_series.slice(0, 40) : data?.cpu_series);
        console.log('data.memory_timeline (first 40):', data?.memory_timeline ? data.memory_timeline.slice(0, 40) : data?.memory_timeline);
        console.log('data.trace (first 40):', data?.trace ? data.trace.slice(0, 40) : data?.trace);
        console.groupEnd();

        if (!data) throw new Error('Invalid response from memory-aware API');
        setMemoryAware({ ...data, input: payload });
        saveRunLocal(`Run ${new Date().toLocaleString()} (Memory)`, payload, { memoryAware: data });
      } else if (mode === 'compare') {
        const resp = await api.compareSchedulers(payload);
        const data = resp?.data ?? null;
        window.__lastCompareForDebug = data; // stash both

        console.group('[API] compareSchedulers response');
        console.log('raw response', resp);
        console.log('baseline.total_time:', data?.baseline?.total_time);
        console.log('baseline.cpu_series (first 40):', data?.baseline?.cpu_series ? data.baseline.cpu_series.slice(0, 40) : data?.baseline?.cpu_series);
        console.log('baseline.memory_timeline (first 40):', data?.baseline?.memory_timeline ? data.baseline.memory_timeline.slice(0, 40) : data?.baseline?.memory_timeline);
        console.log('baseline.trace (first 40):', data?.baseline?.trace ? data.baseline.trace.slice(0, 40) : data?.baseline?.trace);
        console.log('memory_aware.total_time:', data?.memory_aware?.total_time);
        console.log('memory_aware.cpu_series (first 40):', data?.memory_aware?.cpu_series ? data.memory_aware.cpu_series.slice(0, 40) : data?.memory_aware?.cpu_series);
        console.log('memory_aware.memory_timeline (first 40):', data?.memory_aware?.memory_timeline ? data.memory_aware.memory_timeline.slice(0, 40) : data?.memory_aware?.memory_timeline);
        console.log('memory_aware.trace (first 40):', data?.memory_aware?.trace ? data.memory_aware.trace.slice(0, 40) : data?.memory_aware?.trace);
        console.groupEnd();

        if (!data || !data.baseline || !data.memory_aware) throw new Error('Invalid response from compare API');
        setBaseline({ ...data.baseline, input: payload });
        setMemoryAware({ ...data.memory_aware, input: payload });
        saveRunLocal(
          `Compare ${new Date().toLocaleString()}`,
          payload,
          { baseline: data.baseline, memoryAware: data.memory_aware }
        );
      } else {
        console.warn('Unknown run mode', mode);
      }
    } catch (e) {
      console.error(e);
      alert('API error — check console / backend server.');
    } finally {
      setLoading(false);
    }
  };

  const submitConfig = async () => {
    const payload = toPayload(system, processes);
    if (!validPayload(payload)) {
      alert('Please complete required fields.');
      return;
    }
    try {
      await api.sendConfig(payload);
      alert('Configuration saved to backend.');
    } catch (e) {
      console.error(e);
      alert('Failed to save config.');
    }
  };

  const importFromExcel = ({ system: s, processes: procs }) => {
    if (s) setSystem((prev) => ({ ...prev, ...s }));
    if (Array.isArray(procs) && procs.length) setProcesses(procs);
  };

  const exportJSON = () => {
    try {
      const payload = toPayload(system, processes);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scheduler_input_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  return (
    <div className="min-h-dvh bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="app-container py-4 sm:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src="/vite.svg" className="w-8 h-8 sm:w-9 sm:h-9" alt="logo" />
            <div>
              <h1 className="font-semibold" style={{ fontSize: 'var(--step-2)' }}>Memory-Aware CPU Scheduler</h1>
              <p className="opacity-70 text-xs sm:text-sm">Standard Priority vs Memory-Aware under constrained memory</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <ExcelUpload onData={importFromExcel} />
            <button
              onClick={exportJSON}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
            >
              <Download size={16} /> Export JSON
            </button>
          </div>
        </div>
      </header>

      <main className="app-container pb-16 grid gap-6 sm:gap-8">
        <div className="card p-4 sm:p-6">
          <ConfigForm system={system} setSystem={setSystem} processes={processes} setProcesses={setProcesses} />
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <button
            disabled={loading}
            onClick={() => run('baseline')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl disabled:opacity-60 bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Play size={16} /> Run Baseline
          </button>

          <button
            disabled={loading}
            onClick={() => run('memory')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl disabled:opacity-60 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Play size={16} /> Run Memory-Aware
          </button>

          <button
            disabled={loading}
            onClick={() => run('compare')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl disabled:opacity-60 bg-amber-600 hover:bg-amber-500 text-white"
          >
            <GitCompare size={16} /> Run Both & Compare
          </button>

          <button
            onClick={submitConfig}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <Save size={16} /> Save Input to Backend
          </button>
        </div>

        {(baseline || memoryAware) ? (
          <div className="card p-4 sm:p-6">
            <Results baseline={baseline} memoryAware={memoryAware} />
          </div>
        ) : (
          <div className="card p-6 text-sm opacity-80">
            Run a simulation to see KPIs, tables, and graphs here.
          </div>
        )}

        <div className="card p-4 sm:p-6">
          <CompareRuns />
        </div>
      </main>

      <footer className="app-container pb-8 text-xs opacity-70">
        Tip: Set <code>VITE_API_URL</code> in your <code>.env</code> — or use Diagnostics to override at runtime.
        Current: <code>{apiUrl}</code>
      </footer>
    </div>
  );
}
