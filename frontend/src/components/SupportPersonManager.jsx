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

function timeLabel(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${ampm}`;
}

const EMPTY_FORM = {
  name: '', email: '',
  work_start: '10:00', work_end: '18:00',
  lunch_start: '13:00', lunch_end: '14:00',
  tea_start: '', tea_end: '',
  is_active: true,
};

export default function SupportPersonManager() {
  const [persons, setPersons] = useState([]);
  const [todayWoDays, setTodayWoDays] = useState([]); // wo-day entries for today only
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(null); // person id currently being toggled

  const today = getTodayStr();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [pRes, woRes] = await Promise.all([
        axios.get(`${API_URL}/api/support-persons`, { headers: authHeader() }),
        axios.get(`${API_URL}/api/wo-days`, { headers: authHeader() }),
      ]);
      setPersons(pRes.data || []);
      setTodayWoDays((woRes.data || []).filter(w => w.date === today));
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Returns the wo-day id for a person if they are absent today, else null
  function getTodayWoId(personId) {
    const wo = todayWoDays.find(w => w.support_person_id === personId);
    return wo ? wo.id : null;
  }

  async function handleTogglePresence(person) {
    const woId = getTodayWoId(person.id);
    setToggling(person.id);
    try {
      if (woId) {
        // Absent → Present: remove wo-day
        await axios.delete(`${API_URL}/api/wo-days/${woId}`, { headers: authHeader() });
        setTodayWoDays(w => w.filter(x => x.id !== woId));
      } else {
        // Present → Absent: add wo-day for today
        const res = await axios.post(
          `${API_URL}/api/wo-days`,
          { support_person_id: person.id, date: today },
          { headers: authHeader() }
        );
        setTodayWoDays(w => [...w, res.data]);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    } finally {
      setToggling(null);
    }
  }

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function startEdit(person) {
    setForm({
      name: person.name || '',
      email: person.email || '',
      work_start: person.work_start || '10:00',
      work_end: person.work_end || '18:00',
      lunch_start: person.lunch_start || '',
      lunch_end: person.lunch_end || '',
      tea_start: person.tea_start || '',
      tea_end: person.tea_end || '',
      is_active: person.is_active !== false,
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
      {/* Header row */}
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
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="font-medium text-gray-800">
            {editId ? 'Edit Support Person' : 'Add Support Person'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *"      value={form.name}        onChange={v => setForm(f => ({ ...f, name: v }))}        placeholder="e.g. Tanuj Sharma" />
            <Field label="Email"       type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="e.g. tanuj@flabs.in" />
            <Field label="Work Start *" type="time" value={form.work_start}  onChange={v => setForm(f => ({ ...f, work_start: v }))} />
            <Field label="Work End *"   type="time" value={form.work_end}    onChange={v => setForm(f => ({ ...f, work_end: v }))} />
            <Field label="Lunch Start"  type="time" value={form.lunch_start} onChange={v => setForm(f => ({ ...f, lunch_start: v }))} />
            <Field label="Lunch End"    type="time" value={form.lunch_end}   onChange={v => setForm(f => ({ ...f, lunch_end: v }))} />
            <Field label="Tea Break Start" type="time" value={form.tea_start} onChange={v => setForm(f => ({ ...f, tea_start: v }))} />
            <Field label="Tea Break End"   type="time" value={form.tea_end}   onChange={v => setForm(f => ({ ...f, tea_end: v }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
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
                        onClick={() => handleTogglePresence(person)}
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
    </div>
  );
}

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
