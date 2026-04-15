import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

function authHeader() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function WoDayManager() {
  const [woDays, setWoDays] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ support_person_id: '', date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [woRes, pRes] = await Promise.all([
        axios.get(`${API_URL}/api/wo-days`, { headers: authHeader() }),
        axios.get(`${API_URL}/api/support-persons`, { headers: authHeader() }),
      ]);
      setWoDays(woRes.data || []);
      setPersons(pRes.data || []);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!form.support_person_id || !form.date) {
      alert('Please select a person and date');
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/api/wo-days`, form, { headers: authHeader() });
      setWoDays(w => [...w, res.data]);
      setForm(f => ({ ...f, date: '' }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add WO day');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id) {
    if (!confirm('Remove this WO day?')) return;
    try {
      await axios.delete(`${API_URL}/api/wo-days/${id}`, { headers: authHeader() });
      setWoDays(w => w.filter(x => x.id !== id));
    } catch {
      alert('Failed to remove WO day');
    }
  }

  // Group WO days by person
  const byPerson = {};
  for (const wo of woDays) {
    const pid = wo.support_person_id;
    if (!byPerson[pid]) byPerson[pid] = { name: wo.support_persons?.name || pid, days: [] };
    byPerson[pid].days.push(wo);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Week Off / Absent Days</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Add form */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h3 className="font-medium text-gray-700 mb-3">Mark Absent Day</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Support Person</label>
            <select
              value={form.support_person_id}
              onChange={e => setForm(f => ({ ...f, support_person_id: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select person...</option>
              {persons.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="bg-orange-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Mark Absent'}
          </button>
        </div>
      </div>

      {/* WO Days list */}
      {loading ? (
        <div className="py-6 text-center text-gray-400">Loading...</div>
      ) : Object.keys(byPerson).length === 0 ? (
        <div className="py-8 text-center text-gray-400">No absent days marked</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byPerson).map(([pid, { name, days }]) => (
            <div key={pid} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="font-medium text-gray-800 text-sm">{name}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {days
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(wo => (
                    <div key={wo.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {new Date(wo.date + 'T00:00:00').toLocaleDateString('en-IN', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                        })}
                      </span>
                      <button
                        onClick={() => handleRemove(wo.id)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium transition"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
