const { DateTime } = require('luxon');

const TIMEZONE = 'Asia/Kolkata';
const SLOT_DURATION = 30; // minutes
const DAY_START_HOUR = 10; // 10am
const DAY_END_HOUR = 20;   // 8pm

// Normalize time to HH:MM, handles both "HH:MM" and "HH:MM:SS" (from Supabase time columns)
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  return timeStr.substring(0, 5);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const t = normalizeTime(timeStr);
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Generate all 30-min slots for a day (10am–8pm IST)
function generateDaySlots(dateStr) {
  const slots = [];
  const startMinutes = DAY_START_HOUR * 60;
  const endMinutes = DAY_END_HOUR * 60;

  for (let m = startMinutes; m < endMinutes; m += SLOT_DURATION) {
    slots.push({
      start: minutesToTime(m),
      end: minutesToTime(m + SLOT_DURATION),
    });
  }
  return slots;
}

// Check if a slot overlaps with a person's break
function isPersonOnBreak(person, slotStart, slotEnd) {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);

  if (person.lunch_start && person.lunch_end) {
    const lunchStart = timeToMinutes(person.lunch_start);
    const lunchEnd = timeToMinutes(person.lunch_end);
    if (slotStartMin < lunchEnd && slotEndMin > lunchStart) return true;
  }

  if (person.tea_start && person.tea_end) {
    const teaStart = timeToMinutes(person.tea_start);
    const teaEnd = timeToMinutes(person.tea_end);
    if (slotStartMin < teaEnd && slotEndMin > teaStart) return true;
  }

  return false;
}

// Check if a person is available (working hours + not on break)
function isPersonScheduledForSlot(person, slotStart, slotEnd) {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);
  const workStart = timeToMinutes(person.work_start);
  const workEnd = timeToMinutes(person.work_end);

  if (slotStartMin < workStart || slotEndMin > workEnd) return false;
  if (isPersonOnBreak(person, slotStart, slotEnd)) return false;

  return true;
}

// Convert IST date + time to UTC ISO string for Google Calendar
function toUTCISO(dateStr, timeStr) {
  return DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone: TIMEZONE }).toUTC().toISO();
}

// Convert IST date + time to IST ISO string with +05:30 offset for Google Calendar freebusy
function toIST_ISO(dateStr, timeStr) {
  return DateTime.fromISO(`${dateStr}T${timeStr}:00`, { zone: TIMEZONE }).toISO();
}

// Check if a slot falls within a person's working hours (ignores breaks)
function isPersonInWorkingHours(person, slotStart, slotEnd) {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);
  const workStart = timeToMinutes(person.work_start);
  const workEnd = timeToMinutes(person.work_end);
  return slotStartMin >= workStart && slotEndMin <= workEnd;
}

// Get free persons for a slot given persons list, WO set, bookings, and GCal busy data
function getFreePersonsForSlot(persons, slotStart, slotEnd, woPersonIds, bookings, gcalBusy) {
  return persons.filter(person => {
    // Must be scheduled (work hours + not on break)
    if (!isPersonScheduledForSlot(person, slotStart, slotEnd)) return false;

    // Must not be on WO
    if (woPersonIds.has(person.id)) return false;

    // Must not have existing booking overlapping this slot
    // Normalize times since Supabase may return "HH:MM:SS" format
    const hasBooking = bookings.some(b =>
      b.support_person_id === person.id &&
      normalizeTime(b.slot_start) < slotEnd &&
      normalizeTime(b.slot_end) > slotStart
    );
    if (hasBooking) return false;

    // Must not be busy on Google Calendar
    if (gcalBusy && gcalBusy[person.email]) {
      const isBusy = gcalBusy[person.email].some(busy =>
        busy.start < slotEnd && busy.end > slotStart
      );
      if (isBusy) return false;
    }

    return true;
  });
}

async function getDaySlotsWithAvailability(dateStr, supabase, gcalService, personId = null) {
  // Fetch persons, WO days, and bookings in parallel — saves ~2 round-trips vs sequential
  const [personsResult, woDaysResult, bookingsResult] = await Promise.all([
    supabase.from('support_persons').select('*').eq('is_active', true),
    supabase.from('wo_days').select('support_person_id').eq('date', dateStr),
    supabase.from('bookings').select('*').eq('date', dateStr),
  ]);

  if (personsResult.error) throw personsResult.error;
  if (woDaysResult.error) throw woDaysResult.error;
  if (bookingsResult.error) throw bookingsResult.error;

  // If personId filter, narrow to just that person
  const persons = personId
    ? (personsResult.data || []).filter(p => p.id === personId)
    : (personsResult.data || []);

  const woPersonIds = new Set((woDaysResult.data || []).map(w => w.support_person_id));
  const bookings = bookingsResult.data || [];

  // Get Google Calendar busy periods via events.list per person.
  // getPersonsBusy internally fetches all persons in parallel via Promise.all.
  let gcalBusy = {};
  if (gcalService && persons.length > 0) {
    try {
      gcalBusy = await gcalService.getPersonsBusy(persons, dateStr);
    } catch (err) {
      console.error('[SLOTS] Google Calendar events.list error:', err.message);
    }
  }

  const slots = generateDaySlots(dateStr);

  return slots.map(slot => {
    const freePersons = getFreePersonsForSlot(
      persons,
      slot.start,
      slot.end,
      woPersonIds,
      bookings || [],
      gcalBusy
    );

    // Log per-person status for each slot so Vercel logs show exactly what's happening
    persons.forEach(person => {
      const isFree = freePersons.some(p => p.id === person.id);
      let status;
      if (!isPersonScheduledForSlot(person, slot.start, slot.end)) {
        status = 'not_working';
      } else if (woPersonIds.has(person.id)) {
        status = 'wo_day';
      } else if ((bookings || []).some(b =>
        b.support_person_id === person.id &&
        normalizeTime(b.slot_start) < slot.end &&
        normalizeTime(b.slot_end) > slot.start
      )) {
        status = 'booked';
      } else if (gcalBusy[person.email] && gcalBusy[person.email].some(busy =>
        busy.start < slot.end && busy.end > slot.start
      )) {
        status = 'gcal_busy';
      } else {
        status = isFree ? 'free' : 'unknown';
      }
      console.log('[SLOTS] Slot', slot.start, '-', slot.end, 'status for', person.name, ':', status);
    });

    // Hide slots where no person's schedule covers this time (e.g. after Kajal's 8pm cutoff)
    const anyScheduled = persons.some(p => isPersonScheduledForSlot(p, slot.start, slot.end));

    const base = {
      date: dateStr,
      start: slot.start,
      end: slot.end,
      available: freePersons.length > 0,
      freeCount: freePersons.length,
      allNotWorking: !anyScheduled,
    };

    // Single-person mode: include personStatus so frontend can show grey for not_working
    if (personId) {
      const person = persons[0];
      let personStatus = 'not_working';
      if (person && isPersonInWorkingHours(person, slot.start, slot.end)) {
        personStatus = freePersons.length > 0 ? 'free' : 'busy';
      }
      return { ...base, personStatus };
    }

    return base;
  });
}

module.exports = {
  generateDaySlots,
  getDaySlotsWithAvailability,
  getFreePersonsForSlot,
  isPersonScheduledForSlot,
  isPersonInWorkingHours,
  isPersonOnBreak,
  toUTCISO,
  toIST_ISO,
  timeToMinutes,
  normalizeTime,
};
