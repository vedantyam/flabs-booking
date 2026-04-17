import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

function authHeader() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function normalizeTime(t) {
  if (!t) return '';
  return t.substring(0, 5);
}

function timeLabel(t) {
  if (!t) return '—';
  const [h, m] = normalizeTime(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getDatesInRange(fromDate, toDate) {
  const dates = [];
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  let current = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function fmtDateObj(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDisplay(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d} - ${m} - ${y}`;
}

function getNext7DaysRange(todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  return {
    from: fmtDateObj(new Date(y, m - 1, d)),
    to:   fmtDateObj(new Date(y, m - 1, d + 6)),
  };
}

const EMPTY_FORM = {
  name: '', email: '',
  work_start: '10:00', work_end: '18:00',
  lunch_start: '13:00', lunch_end: '14:00',
  tea_start: '', tea_end: '',
  is_active: true,
};

export default function SupportPersonManager() {
  const [persons, setPersons]       = useState([]);
  const [todayWoDays, setTodayWoDays] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [toggling, setToggling]     = useState(null);

  // dateModal: null | { person, mode, fromDate, toDate, saving, quickOption, calKey }
  const [dateModal, setDateModal] = useState(null);

  const today = getTodayStr();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [pRes, woRes] = await Promise.all([
        axios.get(`${API_URL}/api/support-persons`, { headers: authHeader() }),
        axios.get(`${API_URL}/api/wo-days`,          { headers: authHeader() }),
      ]);
      setPersons(pRes.data || []);
      setTodayWoDays((woRes.data || []).filter(w => w.date === today));
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function getTodayWoId(personId) {
    const wo = todayWoDays.find(w => w.support_person_id === personId);
    return wo ? wo.id : null;
  }

  function handleStatusClick(person) {
    const isAbsent = !!getTodayWoId(person.id);
    setDateModal({
      person,
      mode: isAbsent ? 'present' : 'absent',
      fromDate: today,
      toDate: today,
      saving: false,
      quickOption: 'today',
      calKey: 0,
    });
  }

  async function handleConfirmDateRange() {
    const { person, mode, fromDate, toDate } = dateModal;
    setDateModal(d => ({ ...d, saving: true }));
    try {
      if (mode === 'absent') {
        for (const date of getDatesInRange(fromDate, toDate)) {
          try {
            await axios.post(
              `${API_URL}/api/wo-days`,
              { support_person_id: person.id, date },
              { headers: authHeader() }
            );
          } catch (err) {
            if (err.response?.status !== 409) throw err;
          }
        }
      } else {
        await axios.delete(`${API_URL}/api/wo-days/range`, {
          headers: authHeader(),
          data: { support_person_id: person.id, start_date: fromDate, end_date: toDate },
        });
      }
      setDateModal(null);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${mode === 'absent' ? 'mark absent' : 'mark present'}`);
      setDateModal(d => ({ ...d, saving: false }));
    }
  }

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function startEdit(person) {
    setForm({
      name:        person.name || '',
      email:       person.email || '',
      work_start:  normalizeTime(person.work_start) || '10:00',
      work_end:    normalizeTime(person.work_end)   || '18:00',
      lunch_start: normalizeTime(person.lunch_start),
      lunch_end:   normalizeTime(person.lunch_end),
      tea_start:   normalizeTime(person.tea_start),
      tea_end:     normalizeTime(person.tea_end),
      is_active:   person.is_active !== false,
    });
    setEditId(person.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.work_start || !form.work_end) {
      alert('Name, work start, and work end are required');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const res = await axios.put(
          `${API_URL}/api/support-persons/${editId}`, form, { headers: authHeader() }
        );
        setPersons(p => p.map(x => x.id === editId ? res.data : x));
      } else {
        const res = await axios.post(
          `${API_URL}/api/support-persons`, form, { headers: authHeader() }
        );
        setPersons(p => [...p, res.data]);
      }
      setShowForm(false);
      setEditId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete ${name}? This will NOT delete their existing bookings.`)) return;
    try {
      await axios.delete(`${API_URL}/api/support-persons/${id}`, { headers: authHeader() });
      setPersons(p => p.filter(x => x.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Support Team</h2>
        <button
          onClick={startAdd}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + Add Person
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
          <h3 className="font-medium text-gray-800">
            {editId ? 'Edit Support Person' : 'Add Support Person'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *"  value={form.name}  onChange={v => setForm(f => ({ ...f, name: v }))}  placeholder="e.g. Tanuj Sharma" />
            <Field label="Email"   type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="e.g. tanuj@flabs.in" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Work Start *" type="time" value={form.work_start} onChange={v => setForm(f => ({ ...f, work_start: v }))} />
            <Field label="Work End *"   type="time" value={form.work_end}   onChange={v => setForm(f => ({ ...f, work_end: v }))} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Break Times</p>
            <BreakRow
              label="Lunch Break"
              start={form.lunch_start} end={form.lunch_end}
              onStart={v => setForm(f => ({ ...f, lunch_start: v }))}
              onEnd={v => setForm(f => ({ ...f, lunch_end: v }))}
              onClear={() => setForm(f => ({ ...f, lunch_start: '', lunch_end: '' }))}
            />
            <BreakRow
              label="Tea Break"
              start={form.tea_start} end={form.tea_end}
              onStart={v => setForm(f => ({ ...f, tea_start: v }))}
              onEnd={v => setForm(f => ({ ...f, tea_end: v }))}
              onClear={() => setForm(f => ({ ...f, tea_start: '', tea_end: '' }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave} disabled={saving}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Person'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditId(null); }}
              className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-8 text-center text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Working Hours</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Lunch Break</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tea Break</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Today's Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {persons.map(person => {
                const isAbsent = !!getTodayWoId(person.id);
                return (
                  <tr key={person.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-800">{person.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {timeLabel(person.work_start)} – {timeLabel(person.work_end)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {person.lunch_start
                        ? `${timeLabel(person.lunch_start)} – ${timeLabel(person.lunch_end)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {person.tea_start
                        ? `${timeLabel(person.tea_start)} – ${timeLabel(person.tea_end)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleStatusClick(person)}
                        disabled={toggling === person.id}
                        title={isAbsent ? 'Click to mark Present' : 'Click to mark Absent'}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition disabled:opacity-50 ${
                          isAbsent
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isAbsent ? 'bg-red-500' : 'bg-green-500'}`} />
                        {toggling === person.id ? '…' : isAbsent ? 'Absent' : 'Present'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => startEdit(person)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(person.id, person.name)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {persons.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    No support persons added yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Absent / Present date-range modal */}
      {dateModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !dateModal.saving && setDateModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-800">
              {dateModal.mode === 'absent'
                ? `Mark ${dateModal.person.name} Absent`
                : `Mark ${dateModal.person.name} Present`}
            </h3>

            {/* Custom inline calendar — key resets picking state when quick option changes */}
            <MiniCalendar
              key={dateModal.calKey}
              fromDate={dateModal.fromDate}
              toDate={dateModal.toDate}
              onChange={({ from, to }) =>
                setDateModal(d => ({ ...d, fromDate: from, toDate: to, quickOption: null }))
              }
            />

            {/* Quick options */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Quick options</p>
              <div className="flex gap-2">
                <div className="relative group">
                  <button
                    onClick={() => setDateModal(d => ({
                      ...d,
                      fromDate: today, toDate: today,
                      quickOption: 'today',
                      calKey: (d.calKey || 0) + 1,
                    }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                      dateModal.quickOption === 'today'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Today only
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {fmtDisplay(today)}
                  </span>
                </div>
                <div className="relative group">
                  <button
                    onClick={() => {
                      const r = getNext7DaysRange(today);
                      setDateModal(d => ({
                        ...d,
                        fromDate: r.from, toDate: r.to,
                        quickOption: 'next7',
                        calKey: (d.calKey || 0) + 1,
                      }));
                    }}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                      dateModal.quickOption === 'next7'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Next 7 days
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {fmtDisplay(today)} → {fmtDisplay(getNext7DaysRange(today).to)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmDateRange}
                disabled={dateModal.saving || !dateModal.fromDate || !dateModal.toDate}
                className={`flex-1 text-sm px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 ${
                  dateModal.mode === 'absent'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {dateModal.saving
                  ? 'Saving…'
                  : dateModal.mode === 'absent' ? 'Confirm Absent' : 'Confirm Present'}
              </button>
              <button
                onClick={() => setDateModal(null)}
                disabled={dateModal.saving}
                className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Custom inline calendar (no browser date picker) ───────────────────────────

const CAL_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const CAL_DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function MiniCalendar({ fromDate, toDate, onChange }) {
  const init = fromDate ? new Date(fromDate + 'T00:00:00') : new Date();
  const [year, setYear]   = useState(init.getFullYear());
  const [month, setMonth] = useState(init.getMonth());
  const [picking, setPicking] = useState('from'); // 'from' | 'to'

  const todayStr = getTodayStr();

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function cell(d) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function handleDayClick(ds) {
    if (picking === 'from') {
      // Set from; clamp to so it's never before from
      const newTo = toDate && toDate >= ds ? toDate : ds;
      onChange({ from: ds, to: newTo });
      setPicking('to');
    } else {
      if (ds < fromDate) {
        onChange({ from: ds, to: fromDate });
      } else {
        onChange({ from: fromDate, to: ds });
      }
      setPicking('from');
    }
  }

  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const firstDow     = new Date(year, month, 1).getDay();
  const startPadding = firstDow === 0 ? 6 : firstDow - 1; // Monday-first grid

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* From / To toggle pills */}
      <div className="grid grid-cols-2 gap-px bg-gray-200">
        {[
          { key: 'from', label: 'Start Date', value: fromDate },
          { key: 'to',   label: 'End Date',   value: toDate },
        ].map(({ key, label, value }) => (
          <button
            key={key}
            onClick={() => setPicking(key)}
            className={`py-2 px-3 text-left transition ${
              picking === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className={`block text-[10px] font-medium leading-none mb-0.5 ${
              picking === key ? 'text-blue-200' : 'text-gray-400'
            }`}>{label}</span>
            <span className="text-xs font-semibold">{fmtDisplay(value)}</span>
          </button>
        ))}
      </div>

      <div className="px-3 pt-1.5 pb-0">
        <p className="text-[10px] text-gray-400 text-center">Click start date, then end date</p>
      </div>

      <div className="p-3">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={prevMonth}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none transition"
          >‹</button>
          <span className="text-xs font-semibold text-gray-700 select-none">
            {CAL_MONTHS[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none transition"
          >›</button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {CAL_DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-0.5 select-none">
              {d}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: startPadding }, (_, i) => (
            <div key={`p${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d  = i + 1;
            const ds = cell(d);
            const isFrom   = ds === fromDate;
            const isTo     = ds === toDate;
            const inRange  = fromDate && toDate && fromDate !== toDate
                              && ds > fromDate && ds < toDate;
            const isToday  = ds === todayStr;

            let cls = 'h-7 w-full flex items-center justify-center text-xs rounded-full transition cursor-pointer ';
            if (isFrom || isTo) {
              cls += 'bg-blue-600 text-white font-semibold';
            } else if (inRange) {
              cls += 'bg-blue-100 text-blue-700';
            } else if (isToday) {
              cls += 'ring-2 ring-blue-400 ring-inset text-gray-800 font-medium';
            } else {
              cls += 'text-gray-700 hover:bg-gray-100';
            }

            return (
              <button key={ds} onClick={() => handleDayClick(ds)} className={cls}>
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Field / BreakRow helpers ──────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function BreakRow({ label, start, end, onStart, onEnd, onClear }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-gray-600 w-24 shrink-0">{label}:</span>
      <input
        type="time" value={start} onChange={e => onStart(e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="text-xs text-gray-400">to</span>
      <input
        type="time" value={end} onChange={e => onEnd(e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {(start || end) && (
        <button type="button" onClick={onClear}
          className="text-xs text-gray-400 hover:text-red-500 transition ml-1">
          Clear
        </button>
      )}
    </div>
  );
}
