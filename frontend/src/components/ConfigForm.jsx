import { useState } from "react";
import { submitConfig } from "../api/apiClient";

export default function ConfigForm() {
  const [system, setSystem] = useState({
    total_frames: "",
    page_size: "",
    cpu_quantum: "",
    memory_threshold: "",
  });

  const [processes, setProcesses] = useState([
    { pid: "P1", arrival_time: "", burst_time: "", priority: "", memory_footprint: "" },
  ]);

  const handleSystemChange = (e) => {
    setSystem({ ...system, [e.target.name]: e.target.value });
  };

  const handleProcessChange = (i, e) => {
    const newProcs = [...processes];
    newProcs[i][e.target.name] = e.target.value;
    setProcesses(newProcs);
  };

  const addProcess = () => {
    setProcesses([...processes, { pid: `P${processes.length + 1}`, arrival_time: "", burst_time: "", priority: "", memory_footprint: "" }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { system, processes };
    const res = await submitConfig(payload);
    alert(res.data.message);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto bg-gray-100 rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold mb-4">🧠 Memory-Aware CPU Scheduler — Input Config</h1>

      <h2 className="text-xl font-semibold mb-2">System Parameters</h2>
      {Object.keys(system).map((key) => (
        <div key={key} className="mb-2">
          <label className="block text-sm font-medium">{key}</label>
          <input type="number" name={key} value={system[key]} onChange={handleSystemChange} className="border p-1 rounded w-full" />
        </div>
      ))}

      <h2 className="text-xl font-semibold mt-4 mb-2">Processes</h2>
      {processes.map((p, i) => (
        <div key={i} className="border p-2 mb-3 rounded bg-white">
          {Object.keys(p).map((field) => (
            <div key={field} className="mb-1">
              <label className="block text-sm">{field}</label>
              <input type="text" name={field} value={p[field]} onChange={(e) => handleProcessChange(i, e)} className="border p-1 rounded w-full" />
            </div>
          ))}
        </div>
      ))}
      <button onClick={addProcess} className="bg-blue-600 text-white px-3 py-1 rounded mr-2">+ Add Process</button>
      <button onClick={handleSubmit} className="bg-green-600 text-white px-4 py-2 rounded">Submit Config</button>
    </div>
  );
}
