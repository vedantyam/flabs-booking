import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BookingsList from '../components/BookingsList.jsx';
import SupportPersonManager from '../components/SupportPersonManager.jsx';
import WoDayManager from '../components/WoDayManager.jsx';

const TABS = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'team', label: 'Support Team' },
  { id: 'wo', label: 'Absent Days' },
];

export default function AdminPanel() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookings');
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);

  function handleLogout() {
    localStorage.removeItem('admin_token');
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">FLABS Admin</h1>
            <p className="text-sm text-gray-500">Manage bookings and support team</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800 transition"
            >
              View Booking Page
            </a>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 px-3 py-1.5 rounded-lg transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-0" aria-label="Tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition
                  ${activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
          {activeTab === 'bookings' && (
            <BookingsList
              refreshKey={bookingsRefreshKey}
              onRefresh={() => setBookingsRefreshKey(k => k + 1)}
            />
          )}
          {activeTab === 'team' && <SupportPersonManager />}
          {activeTab === 'wo' && <WoDayManager />}
        </div>
      </main>
    </div>
  );
}
