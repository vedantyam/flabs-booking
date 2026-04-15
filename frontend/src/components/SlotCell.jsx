import React from 'react';

// Format "10:00" → "10:00" (keep as-is, already HH:MM from API)
// Displayed as "10:00 - 10:30"
export default function SlotCell({ slot }) {
  if (!slot) return null;

  if (slot.available) {
    return (
      <div className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-800 font-medium">
        {slot.start} – {slot.end}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-300 line-through">
      {slot.start} – {slot.end}
    </div>
  );
}
