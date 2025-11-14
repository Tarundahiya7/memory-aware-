// frontend/src/components/ConfigForm.jsx
import { Database, BarChart2, Plus, Trash2 } from 'lucide-react';

const blankSystem = { total_frames: '', page_size: '', cpu_quantum: '', memory_threshold: '' };
const blankProcess = (i = 1) => ({ pid: `P${i}`, arrival_time: '', burst_time: '', priority: '', pages_count: '' });

export default function ConfigForm({ system, setSystem, processes, setProcesses }) {
  const updateSystem = (key, value) => setSystem((prev) => ({ ...prev, [key]: value }));
  const updateProcess = (index, key, value) =>
    setProcesses((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

  const addProc = () => setProcesses((prev) => [...prev, blankProcess(prev.length + 1)]);
  const removeProc = (indexToRemove) => setProcesses((prev) => prev.filter((_, i) => i !== indexToRemove));

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Database size={18}/> System Parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(system).map(([k, v]) => (
            <label key={k} className="grid text-sm gap-1">
              <span className="opacity-80 capitalize">{k.replaceAll('_', ' ')}</span>
              <input value={v} onChange={(e) => updateSystem(k, e.target.value)} type="number"
                     className="px-3 py-2 rounded-lg bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10" />
            </label>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><BarChart2 size={18}/> Processes</h3>
          <button onClick={addProc} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-xl text-sm text-white">
            <Plus size={16}/> Add process
          </button>
        </div>

        <div className="table-wrap">
          <table className="min-w-full text-sm border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
            <thead className="bg-black/5 dark:bg-white/10">
              <tr>
                {['pid','arrival_time','burst_time','priority','pages_count','actions'].map((h) => (
                  <th key={h} className="text-left p-2 capitalize">{h.replaceAll('_',' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processes.map((p, i) => (
                <tr key={i} className="odd:bg-transparent even:bg-black/5 dark:even:bg-white/10">
                  <td className="p-2">
                    <input className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 w-28"
                           value={p.pid} onChange={(e) => updateProcess(i,'pid', e.target.value)} />
                  </td>
                  {['arrival_time','burst_time','priority','pages_count'].map((k) => (
                    <td key={k} className="p-2">
                      <input type="number"
                             className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 w-36"
                              value={p[k]} onChange={(e) => updateProcess(i,k, e.target.value)} />
                    </td>
                  ))}
                  <td className="p-2">
                    <button onClick={() => removeProc(i)} className="inline-flex items-center gap-1 text-red-500 hover:text-red-400">
                      <Trash2 size={16}/> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
