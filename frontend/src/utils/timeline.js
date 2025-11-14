// src/utils/timeline.js
export function toArrayTimeline(tl) {
  if (!tl) return [];
  // already array-of-arrays? return as-is
  if (Array.isArray(tl) && tl.length && Array.isArray(tl[0])) return tl;
  // assume array of objects like { pid, start, end }
  return tl.map((seg) => [seg.pid, Number(seg.start), Number(seg.end)]);
}

// src/utils/timeline.js (append)
export function traceToTimeline(trace) {
  if (!trace || !trace.length) return [];
  const timeline = [];
  let curPid = null;
  let curStart = null;
  for (const entry of trace) {
    if (entry.event !== 'running') {
      if (curPid !== null) {
        timeline.push([curPid, curStart, entry.time]);
        curPid = null;
        curStart = null;
      }
      continue;
    }
    if (curPid === null) {
      curPid = entry.pid;
      curStart = entry.time;
    } else if (entry.pid !== curPid) {
      timeline.push([curPid, curStart, entry.time]);
      curPid = entry.pid;
      curStart = entry.time;
    }
  }
  if (curPid !== null) {
    const lastTime = trace[trace.length - 1].time ?? 0;
    timeline.push([curPid, curStart, lastTime + 1]);
  }
  return timeline;
}
