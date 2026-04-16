import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── Layout constants ──────────────────────────────────────────────────────────
const HOUR_H    = 64;           // px per hour
const MIN_PX    = HOUR_H / 60; // px per minute  (≈1.067)
const DAY_START = 8 * 60;      // 08:00 in minutes
const DAY_END   = 22 * 60;     // 22:00 in minutes
const TIME_W    = 52;           // px width of time gutter column
const TOTAL_H   = Math.round((DAY_END - DAY_START) * MIN_PX); // grid height px

// ── Person colour palette ─────────────────────────────────────────────────────
const PALETTE = {
  'Kajal Kaushik': { pill: '#3B82F6', bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF' },
  'Milky Gupta':   { pill: '#F59E0B', bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' },
  'Kajal Gupta':   { pill: '#10B981', bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46' },
  'Tannu Sharma':  { pill: '#8B5CF6', bg: '#EDE9FE', border: '#C4B5FD', text: '#4C1D95' },
};
const DEFAULT_COLOR = { pill: '#6B7280', bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' };
function getColor(name) { return PALETTE[name] || DEFAULT_COLOR; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMin(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
function toY(min)              { return Math.round((min - DAY_START) * MIN_PX); }
function toH(sMin, eMin)       { return Math.round((eMin - sMin) * MIN_PX); }
function clamp(v, lo, hi)      { return Math.max(lo, Math.min(hi, v)); }

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function shiftDay(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function nowMin()   { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

// Hour + half-hour tick marks for the time gutter
const TIME_TICKS = Array.from(
  { length: (DAY_END - DAY_START) / 30 },
  (_, i) => DAY_START + i * 30
);

// ── Component ─────────────────────────────────────────────────────────────────
export default function DayView() {
  const today = todayStr();
  const [date, setDate]       = useState(today);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [nowY, setNowY]       = useState(null);
  const scrollRef             = useRef(null);

  // ── Current-time red line ───────────────────────────────────────────────────
  function refreshNow() {
    const m = nowMin();
    setNowY(m >= DAY_START && m <= DAY_END ? toY(m) : null);
  }

  // ── Fetch calendar data ─────────────────────────────────────────────────────
  async function load(d) {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_URL}/api/calendar/day`, { params: { date: d } });
      setData(res.data);
    } catch {
      setError('Could not load calendar — check backend connection.');
    } finally {
      setLoading(false);
    }
  }

  // Reload when date changes
  useEffect(() => { load(date); }, [date]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const t = setInterval(() => load(date), 60_000);
    return () => clearInterval(t);
  }, [date]);

  // Tick current-time line every 60 s
  useEffect(() => {
    refreshNow();
    const t = setInterval(refreshNow, 60_000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll: show 1 hour before current time on load
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTo = Math.max(0, toY(clamp(nowMin() - 60, DAY_START, DAY_END)));
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollTo; }, 80);
  }, [date]);

  const persons      = data?.persons      || [];
  const personEvents = data?.personEvents || [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden"
      style={{ height: 680 }}>

      {/* ── Navigation bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(d => shiftDay(d, -1))}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition text-xl leading-none"
            aria-label="Previous day"
          >‹</button>
          <span className="text-sm font-semibold text-gray-800 min-w-[230px] text-center select-none">
            {fmtDate(date)}
          </span>
          <button
            onClick={() => setDate(d => shiftDay(d, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition text-xl leading-none"
            aria-label="Next day"
          >›</button>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          <button
            onClick={() => setDate(today)}
            disabled={date === today}
            className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
          >Today</button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-100 flex-shrink-0">
          {error}
        </div>
      )}

      {/* ── Sticky person-name header ── */}
      <div className="flex flex-shrink-0 bg-white border-b border-gray-100 shadow-sm">
        {/* Gutter spacer */}
        <div style={{ width: TIME_W, minWidth: TIME_W }} className="flex-shrink-0" />
        {persons.length === 0 && !loading && (
          <div className="flex-1 py-2 text-xs text-gray-400 text-center">
            No active team members found
          </div>
        )}
        {persons.map(p => {
          const c = getColor(p.name);
          return (
            <div key={p.id}
              className="flex-1 py-2 px-1 text-center border-l border-gray-100 overflow-hidden">
              <span
                className="inline-block text-xs font-semibold text-white px-2 py-0.5 rounded-full truncate max-w-full"
                style={{ backgroundColor: c.pill }}
              >{p.name}</span>
            </div>
          );
        })}
      </div>

      {/* ── Scrollable time grid ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: TOTAL_H }}>

          {/* Time gutter */}
          <div
            className="flex-shrink-0 relative border-r border-gray-100 bg-white"
            style={{ width: TIME_W, minWidth: TIME_W }}
          >
            {TIME_TICKS.filter(m => m % 60 === 0).map(min => (
              <div
                key={min}
                className="absolute right-1.5 leading-none select-none"
                style={{ top: toY(min) - 6, fontSize: 10, color: '#9CA3AF' }}
              >
                {`${String(min / 60).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Person columns */}
          {persons.map((p, colIdx) => {
            const c = getColor(p.name);
            const evts = personEvents.find(pe => pe.personId === p.id)?.events || [];

            const workStart = toMin(p.work_start || '08:00');
            const workEnd   = toMin(p.work_end   || '22:00');

            const breaks = [];
            if (p.lunch_start && p.lunch_end) {
              breaks.push({ label: 'LUNCH', s: toMin(p.lunch_start), e: toMin(p.lunch_end) });
            }
            if (p.tea_start && p.tea_end) {
              breaks.push({ label: 'TEA', s: toMin(p.tea_start), e: toMin(p.tea_end) });
            }

            return (
              <div
                key={p.id}
                className="flex-1 relative border-l border-gray-100"
                style={{ backgroundColor: colIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}
              >
                {/* Hour grid lines */}
                {TIME_TICKS.filter(m => m % 60 === 0).map(min => (
                  <div key={min}
                    className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none"
                    style={{ top: toY(min) }} />
                ))}
                {/* Half-hour dashed lines */}
                {TIME_TICKS.filter(m => m % 60 === 30).map(min => (
                  <div key={min}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{ top: toY(min), borderTop: '1px dashed #F0F0F0' }} />
                ))}

                {/* Before-work-hours dimmed overlay */}
                {workStart > DAY_START && (
                  <div className="absolute left-0 right-0 bg-gray-100/60 pointer-events-none"
                    style={{ top: 0, height: toY(workStart) }} />
                )}
                {/* After-work-hours dimmed overlay */}
                {workEnd < DAY_END && (
                  <div className="absolute left-0 right-0 bg-gray-100/60 pointer-events-none"
                    style={{ top: toY(workEnd), height: TOTAL_H - toY(workEnd) }} />
                )}

                {/* Break blocks */}
                {breaks.map(b => {
                  const cs = clamp(b.s, DAY_START, DAY_END);
                  const ce = clamp(b.e, DAY_START, DAY_END);
                  if (ce <= cs) return null;
                  const h = Math.max(toH(cs, ce) - 2, 12);
                  return (
                    <div key={b.label}
                      className="absolute left-px right-px rounded overflow-hidden flex items-center justify-center pointer-events-none"
                      style={{
                        top: toY(cs) + 1,
                        height: h,
                        background:
                          'repeating-linear-gradient(45deg,#E5E7EB 0,#E5E7EB 3px,#F9FAFB 3px,#F9FAFB 8px)',
                      }}
                    >
                      <span style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, letterSpacing: '0.05em' }}>
                        {b.label}
                      </span>
                    </div>
                  );
                })}

                {/* Calendar events */}
                {evts.map((ev, i) => {
                  const sm = toMin(ev.start);
                  const em = toMin(ev.end);
                  const cs = clamp(sm, DAY_START, DAY_END);
                  const ce = clamp(em, DAY_START, DAY_END);
                  if (ce <= cs) return null;
                  const h = Math.max(toH(cs, ce) - 2, 18);
                  return (
                    <div key={i}
                      className="absolute left-0.5 right-0.5 rounded-md overflow-hidden px-1.5 py-0.5"
                      style={{
                        top: toY(cs) + 1,
                        height: h,
                        backgroundColor: c.bg,
                        borderLeft: `3px solid ${c.border}`,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                      }}
                    >
                      <p className="font-semibold leading-tight truncate"
                        style={{ color: c.text, fontSize: 10 }}>
                        {ev.title}
                      </p>
                      {h >= 30 && (
                        <p className="leading-tight truncate"
                          style={{ color: c.text, fontSize: 9, opacity: 0.65 }}>
                          {ev.start}–{ev.end}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* ── Current-time red line (spans all person columns) ── */}
          {nowY !== null && (
            <div
              className="absolute pointer-events-none z-20"
              style={{ top: nowY, left: TIME_W, right: 0 }}
            >
              <div className="relative" style={{ borderTop: '2px solid #EF4444' }}>
                <div
                  className="absolute rounded-full bg-red-400"
                  style={{ width: 8, height: 8, top: -5, left: -4 }}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
