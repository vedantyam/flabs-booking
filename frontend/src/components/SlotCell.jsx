import React from 'react';

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function SlotCell({ slot, onClick }) {
  if (!slot) {
    return <div className="h-10 rounded bg-gray-50" />;
  }

  if (slot.available) {
    return (
      <button
        onClick={() => onClick && onClick(slot)}
        className="w-full h-10 rounded-lg bg-green-100 hover:bg-green-200 border border-green-300 text-green-800 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center"
        title={`${formatTime(slot.start)} – ${formatTime(slot.end)} — Available`}
      >
        {formatTime(slot.start)}
      </button>
    );
  }

  return (
    <div
      className="w-full h-10 rounded-lg bg-red-50 border border-red-200 text-red-400 text-xs flex items-center justify-center cursor-not-allowed"
      title={`${formatTime(slot.start)} – ${formatTime(slot.end)} — Fully Booked`}
    >
      {formatTime(slot.start)}
    </div>
  );
}
