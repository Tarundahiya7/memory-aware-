// frontend/src/components/charts/DualGantt.jsx
import React, { useRef, useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useTheme } from '../../theme/useTheme' // path relative to components/charts
import { AlignCenter } from 'lucide-react'
// at the top of DualGantt.jsx
import iconFullscreen from '../../assets/fullscreen.svg'
import iconExit from '../../assets/exitfullscreen.svg'


/* -------------------------
   Helpers
------------------------- */
function traceToTimeline(trace = []) {


  // convert trace [{time,event,pid}, ...] -> [[pid,start,end],...]
  if (!Array.isArray(trace)) return []
  const timeline = []
  let curPid = null
  let curStart = null
  const times = trace.map((r) => Number(r?.time ?? 0)).filter(Number.isFinite)
  const inferredLast = times.length ? Math.max(...times) : 0

  for (const entry of trace) {
    if (!entry) continue
    const ev = entry.event
    const pid = entry.pid != null ? String(entry.pid) : null
    const t = Number(entry.time ?? NaN)
    const isRunning = ev === 'running'
    if (!isRunning) {
      if (curPid !== null) {
        const end = Number.isFinite(t) ? t : inferredLast
        timeline.push([String(curPid), Number(curStart), Number(end)])
        curPid = null
        curStart = null
      }
      continue
    }
    if (curPid === null) {
      curPid = pid
      curStart = Number.isFinite(t) ? t : 0
    } else if (pid !== curPid) {
      const end = Number.isFinite(t) ? t : inferredLast
      timeline.push([String(curPid), Number(curStart), Number(end)])
      curPid = pid
      curStart = Number.isFinite(t) ? t : 0
    }
  }
  if (curPid !== null) {
    const lastTime = inferredLast
    timeline.push([String(curPid), Number(curStart), Number(lastTime) + 1])
  }
  return timeline
}

function normalizeTimeline(tl = []) {
  // Accepts:
  //  - array-of-arrays: [[pid,start,end],...]
  //  - array-of-objects: [{pid,start,end}, ...] or {pid,s,e} or {pid,start,duration}
  //  - trace-like: [{time,event,pid}, ...]
  if (!Array.isArray(tl) || tl.length === 0) return []

  const first = tl[0]

  // array-of-arrays
  if (Array.isArray(first)) {
    return tl
      .map((arr) => {
        if (!Array.isArray(arr) || arr.length < 3) return null
        const pid = arr[0] != null ? String(arr[0]) : ''
        const s = Number(arr[1] ?? 0)
        const e = Number(arr[2] ?? 0)
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null
        return [String(pid), Number(s), Number(e)]
      })
      .filter(Boolean)
  }

  // array-of-objects
  if (first && typeof first === 'object') {
    // trace-like?
    const looksLikeTrace = tl.every(
      (o) => o && ('time' in o) && ('pid' in o) && ('event' in o)
    )
    if (looksLikeTrace) {
      return traceToTimeline(tl)
    }

    return tl
      .map((obj) => {
        if (!obj) return null
        const pid = obj.pid != null ? String(obj.pid) : ''
        if ('start' in obj && 'end' in obj) {
          const s = Number(obj.start ?? 0)
          const e = Number(obj.end ?? 0)
          if (!Number.isFinite(s) || !Number.isFinite(e)) return null
          return [pid, s, e]
        }
        if ('s' in obj && 'e' in obj) {
          const s = Number(obj.s ?? 0)
          const e = Number(obj.e ?? 0)
          if (!Number.isFinite(s) || !Number.isFinite(e)) return null
          return [pid, s, e]
        }
        if ('start' in obj && 'duration' in obj) {
          const s = Number(obj.start ?? 0)
          const d = Number(obj.duration ?? 0)
          if (!Number.isFinite(s) || !Number.isFinite(d)) return null
          return [pid, s, s + d]
        }
        // unknown shape -> ignore
        return null
      })
      .filter(Boolean)
  }

  return []
}

function normalizeForRender(tl = []) {
  // convert normalized array-of-arrays -> [{pid,start,end,len}]
  return tl.map(([pid, s, e]) => {
    const ss = Number(s ?? 0)
    const ee = Number(e ?? 0)
    return { pid: String(pid ?? ''), start: ss, end: ee, len: Math.max(0, ee - ss) }
  })
}

function hashTo360(s = '') {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b)
  if (a === 0) return b
  if (b === 0) return a
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  return a
}
function twoHuesForPid(pid, hueOffset = 0, isDark = false) {
  const h = (hashTo360(String(pid)) + hueOffset) % 360
  if (isDark) {
    return { light: `hsl(${h} 68% 58%)`, dark: `hsl(${(h + 8) % 360} 68% 36%)` }
  }
  return { light: `hsl(${h} 72% 62%)`, dark: `hsl(${(h + 8) % 360} 64% 44%)` }
}

/* -------------------------
   DualGantt Component
------------------------- */
export default function DualGantt({
  baseline = [],
  marr = [],
  processesOrder = [],
  baseline_quanta: propBaselineQuanta = undefined,
}) {
  const { mode } = useTheme?.() ?? { mode: 'light' }
  const isDark = mode === 'dark'

  // normalize timelines (accept many shapes)
  const baseArr = useMemo(() => normalizeTimeline(baseline), [baseline])
  const memArr = useMemo(() => normalizeTimeline(marr), [marr])

  const base = useMemo(() => normalizeForRender(baseArr), [baseArr])
  const mem = useMemo(() => normalizeForRender(memArr), [memArr])

  // If processesOrder not provided, infer from timelines (preserve stable order)
  const inferredProcesses = useMemo(() => {
    if (Array.isArray(processesOrder) && processesOrder.length) return processesOrder.map(String)
    const seen = new Set()
    const order = []
      ;[...base, ...mem].forEach((s) => {
        if (!seen.has(String(s.pid))) {
          seen.add(String(s.pid))
          order.push(String(s.pid))
        }
      })
    return order
  }, [processesOrder, base, mem])

  // infer baseline quanta map (GCD-based) unless provided
  const baselineQuantaMap = useMemo(() => {
    if (propBaselineQuanta && typeof propBaselineQuanta === 'object') {
      // make string keys
      const out = {}
      Object.keys(propBaselineQuanta).forEach((k) => (out[String(k)] = Number(propBaselineQuanta[k] || 1)))
      return out
    }

    const acc = {}
    base.forEach((seg) => {
      const pid = String(seg.pid)
      if (!acc[pid]) acc[pid] = { lengths: [], sum: 0, count: 0 }
      acc[pid].lengths.push(Math.max(1, Math.round(seg.len)))
      acc[pid].sum += Math.max(1, Math.round(seg.len))
      acc[pid].count += 1
    })

    const map = {}
    Object.keys(acc).forEach((pid) => {
      const lengths = acc[pid].lengths
      let g = lengths.reduce((a, b) => gcd(a, b), 0)
      if (!g || g <= 0) g = Math.min(...lengths)
      if (!g || g <= 0) g = Math.max(1, Math.round(acc[pid].sum / Math.max(1, acc[pid].count)))
      map[pid] = Math.max(1, g)
    })

    inferredProcesses.forEach((pid) => {
      if (!(pid in map)) map[pid] = 1
    })

    return map
  }, [base, inferredProcesses, propBaselineQuanta])

  // === Layout
  const pxPerTime = 28
  const tailExtraTime = 2.5
  const laneH = 50
  const lanes = Math.max(0, inferredProcesses.length)
  const padding = { left: 140, right: 36, top: 12, between: 36, bottom: 28 }

  const maxTime = Math.max(
    ...(base.length ? base.map((d) => d.end) : [1]),
    ...(mem.length ? mem.map((d) => d.end) : [1]),
    1
  )

  const width = Math.max(1200, (maxTime + tailExtraTime) * pxPerTime + padding.left + padding.right)
  const innerW = width - padding.left - padding.right
  const svgHeight = padding.top + lanes * laneH + padding.bottom

  // UI state
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: '' })
  const [hovered, setHovered] = useState(null)

  // tooltip handlers (absolute coordinates relative to component)
  const showTip = (e, seg) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const x = e.clientX - (rect?.left || 0) + 12
    const y = e.clientY - (rect?.top || 0) + 12
    setTooltip({
      visible: true,
      x,
      y,
      content: `${seg.pid} — ${seg.start} → ${seg.end} (len=${seg.len})`,
    })
  }
  const hideTip = () => setTooltip({ visible: false, x: 0, y: 0, content: '' })

  const quantemapStr = inferredProcesses.map((pid) => `${pid}:${baselineQuantaMap[pid] ?? 1}`).join('  •  ')

  // Theme variables
  const containerBg = isDark ? 'rgba(6,8,15,0.6)' : '#ffffff'
  const panelBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const labelColor = isDark ? '#E6EEF8' : '#111827'
  const subLabel = isDark ? '#9AA8C3' : '#6B7280'
  const laneFill = isDark ? 'rgba(255,255,255,0.02)' : '#fbfbfb'
  const gridLine = isDark ? 'rgba(255,255,255,0.03)' : '#f3f3f3'
  const timeText = isDark ? '#9AA8C3' : '#666'

  // Gradient defs
  const gradientDefs = (
    <defs>
      {inferredProcesses.map((pid) => {
        const { light: bLight, dark: bDark } = twoHuesForPid(pid, 6, isDark)
        const { light: mLight, dark: mDark } = twoHuesForPid(pid, 150, isDark)
        const idB = `b-${String(pid).replace(/\s+/g, '-')}`
        const idM = `m-${String(pid).replace(/\s+/g, '-')}`
        return (
          <React.Fragment key={pid}>
            <linearGradient id={idB} x1="0" x2="1">
              <stop offset="0%" stopColor={bLight} stopOpacity="0.98" />
              <stop offset="100%" stopColor={bDark} stopOpacity="0.96" />
            </linearGradient>
            <linearGradient id={idM} x1="0" x2="1">
              <stop offset="0%" stopColor={mLight} stopOpacity="0.98" />
              <stop offset="100%" stopColor={mDark} stopOpacity="0.96" />
            </linearGradient>
          </React.Fragment>
        )
      })}
      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.08" />
      </filter>
    </defs>
  )

  // Render single timeline
  const renderSingleTimeline = (data, chartFamily = 'b') => (
    <svg
      width={width}
      height={svgHeight}
      viewBox={`0 0 ${width} ${svgHeight}`}
      preserveAspectRatio="xMinYMin"
      role="img"
      aria-label={chartFamily === 'b' ? 'Baseline timeline' : 'Memory-aware timeline'}
      style={{ display: 'block' }}
    >
      {gradientDefs}

      {/* time ticks */}
      <g transform={`translate(${padding.left}, ${padding.top + 14})`}>
        {Array.from({ length: Math.floor(maxTime) + 2 }).map((_, i) => {
          const t = i
          const x = (t / (maxTime + tailExtraTime)) * innerW
          return (
            <g key={i} transform={`translate(${x},0)`}>
              <line x1={0} y1={0} x2={0} y2={lanes * laneH + 12} stroke={gridLine} />
              <text x={0} y={-10} fontSize={11} textAnchor="middle" fill={timeText}>
                {t}
              </text>
            </g>
          )
        })}
      </g>

      {/* lanes */}
      {inferredProcesses.map((pid, idx) => {
        const y = padding.top + 14 + idx * laneH
        return (
          <g key={pid}>
            <rect x={padding.left} y={y - 6} width={innerW} height={laneH} rx={10} fill={laneFill} />
            <text
              x={padding.left - 18}
              y={y + laneH / 2}
              fontSize={13}
              textAnchor="end"
              dominantBaseline="middle"
              fill={labelColor}
            >
              {pid}
            </text>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y + laneH / 2}
              y2={y + laneH / 2}
              stroke={gridLine}
            />
          </g>
        )
      })}

      {/* segments */}
      <g transform={`translate(${padding.left}, ${padding.top + 14})`}>
        {data.map((seg, i) => {
          const x = (seg.start / (maxTime + tailExtraTime)) * innerW
          const w = Math.max(8, (seg.len / (maxTime + tailExtraTime)) * innerW)
          const pidIdx = inferredProcesses.indexOf(String(seg.pid))
          const y = pidIdx >= 0 ? pidIdx * laneH + 6 : 0
          const gradId = `${chartFamily}-${String(seg.pid).replace(/\s+/g, '-')}`
          const hoveredKey = `seg-${chartFamily}-${i}`
          const isHovered = hovered === hoveredKey

          return (
            <g key={`${chartFamily}-${i}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={laneH - 12}
                rx={12}
                fill={`url(#${gradId})`}
                stroke={isDark ? 'rgba(255,255,255,0.02)' : '#111'}
                strokeOpacity={0.06}
                filter={isHovered ? 'url(#softShadow)' : undefined}
                onMouseEnter={(e) => {
                  setHovered(hoveredKey)
                  showTip(e, seg)
                }}
                onMouseMove={(e) => showTip(e, seg)}
                onMouseLeave={() => {
                  setHovered(null)
                  hideTip()
                }}
                style={{
                  cursor: 'pointer',
                  transformOrigin: 'left center',
                  transform: isHovered ? 'translateY(-4px) scale(1.02)' : 'none',
                  transition: 'transform .14s cubic-bezier(.2,.9,.2,1), filter .14s, opacity .14s',
                }}
              />
              <text
                x={x + Math.min(w / 2, 72)}
                y={y + (laneH - 12) / 2 + 6}
                fontSize={12}
                textAnchor="middle"
                fill="#fff"
                fontWeight={800}
                pointerEvents="none"
              >
                {seg.pid}
              </text>

              <line
                x1={x + w}
                x2={x + w}
                y1={y - 8}
                y2={y + laneH}
                stroke={isDark ? 'rgba(255,255,255,0.06)' : '#000'}
                strokeDasharray="3 2"
                strokeOpacity={0.08}
              />
              <circle
                cx={x + w}
                cy={y + (laneH - 12) / 2}
                r={4}
                fill={isDark ? 'rgba(255,255,255,0.06)' : '#000'}
                opacity={0.08}
              />
              <text x={x + w + 10} y={y + (laneH - 12) / 2 + 6} fontSize={11} fill={labelColor}>
                {seg.end}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )


  const [isFullscreen, setIsFullscreen] = useState(false);
  // robust fullscreen toggle using the ref (works in Safari + modern browsers)
  const fullscreen = async () => {

    const el = containerRef.current;
    if (!el) return;

    const current = document.fullscreenElement;

    try {
      if (current === el) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await el.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  return (
    <div
      ref={containerRef}
      className="rounded-xl shadow-md border relative w-full container"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        background: containerBg,
        borderColor: panelBorder,
        padding: 20,
        marginTop: 12,
        maxHeight: '80vh',
        overflow: 'auto',
      }}
    >
      {/* Top-right fullscreen button (absolute in container) */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 90 }}>
        <img
          src={isFullscreen ? iconExit : iconFullscreen}
          alt={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
          onClick={fullscreen}
          style={{
            width: 26,
            height: 26,
            cursor: 'pointer',
            opacity: 0.6,
            filter: 'brightness(0) invert(1)', // keeps icon white
            display: 'block',
          }}
          onError={(e) => console.warn('img load error', e.currentTarget.src)}
        />
      </div>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: labelColor }}>Baseline vs Memory-Aware RR</h3>
          <div style={{ marginTop: 6, fontSize: 13, color: subLabel }}>
            Compare baseline scheduling vs memory-aware scheduling
          </div>
        </div>
      </div>
      
      
      {/* Baseline */}
      <div style={{ marginTop: 18 }} className='gant-chart1'>
        <div style={{ paddingLeft: padding.left, marginBottom: 8 }}>
          <strong style={{ fontSize: 18, color: labelColor }}>Baseline </strong>
          <div style={{ fontSize: 12, color: subLabel, marginTop: 4 }}>Quanta — {quantemapStr}</div>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
          <div style={{ width: width, minWidth: width }}>{renderSingleTimeline(base, 'b')}</div>
        </div>
      </div>


      {/* Memory-aware */}
      <div style={{ marginTop: 50 }}>
        <div style={{ paddingLeft: padding.left, marginBottom: 8 }}>
          <strong style={{ fontSize: 18, color: labelColor }}>Memory-Aware </strong>
          <div style={{ fontSize: 12, color: subLabel, marginTop: 4 }}>Quanta — {quantemapStr}</div>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
          <div style={{ width: width, minWidth: width }}>{renderSingleTimeline(mem, 'm')}</div>
        </div>
      </div>

      {/* tooltip */}
      {tooltip.visible && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            background: isDark ? 'rgba(6,8,15,0.95)' : 'rgba(0,0,0,0.9)',
            color: '#fff',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 13,
            pointerEvents: 'none',
            transform: 'translate(8px,8px)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
            zIndex: 60,
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

DualGantt.propTypes = {
  baseline: PropTypes.array, // array-of-arrays or array-of-objects or trace
  marr: PropTypes.array,
  processesOrder: PropTypes.arrayOf(PropTypes.string),
  baseline_quanta: PropTypes.object,
}

