const express = require('express');
const { DateTime } = require('luxon');
const { createClient } = require('@supabase/supabase-js');
const { getDaySlotsWithAvailability, timeToMinutes, normalizeTime, toIST_ISO } = require('../services/slotLogic');
const gcalService = require('../services/googleCalendar');

const router = express.Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Validate date string
function isValidDate(dateStr) {
  const dt = DateTime.fromISO(dateStr, { zone: 'Asia/Kolkata' });
  return dt.isValid;
}

// Cache-aside: check slot_cache, return cached value if fresh, else fetch and store
async function getCachedSlots(supabase, cacheKey, fetchFn) {
  const now = new Date().toISOString();

  // Non-blocking cleanup of expired entries (fire-and-forget)
  supabase.from('slot_cache').delete().lt('expires_at', now).then(() => {}).catch(() => {});

  const { data: cached } = await supabase
    .from('slot_cache')
    .select('payload')
    .eq('cache_key', cacheKey)
    .gt('expires_at', now)
    .maybeSingle();

  if (cached) return cached.payload;

  const fresh = await fetchFn();

  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  supabase
    .from('slot_cache')
    .upsert({ cache_key: cacheKey, payload: fresh, expires_at: expiresAt }, { onConflict: 'cache_key' })
    .then(() => {}).catch(() => {});

  return fresh;
}

// GET /api/slots?date=YYYY-MM-DD[&personId=uuid]
router.get('/', async (req, res, next) => {
  try {
    const { date, personId } = req.query;
    if (!date || !isValidDate(date)) {
      return res.status(400).json({ error: 'Invalid or missing date parameter (YYYY-MM-DD)' });
    }

    const supabase = getSupabase();
    const cacheKey = personId ? `slots:${date}:${personId}` : `slots:${date}`;
    const slots = await getCachedSlots(supabase, cacheKey, () =>
      getDaySlotsWithAvailability(date, supabase, gcalService, personId || null)
    );
    res.json({ date, slots });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots/week?start=YYYY-MM-DD[&personId=uuid]
router.get('/week', async (req, res, next) => {
  try {
    const { start, personId } = req.query;
    if (!start || !isValidDate(start)) {
      return res.status(400).json({ error: 'Invalid or missing start parameter (YYYY-MM-DD)' });
    }

    const supabase = getSupabase();
    const startDT = DateTime.fromISO(start, { zone: 'Asia/Kolkata' });

    // Fetch 7 days
    const weekData = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const dateStr = startDT.plus({ days: i }).toISODate();
        return getDaySlotsWithAvailability(dateStr, supabase, gcalService, personId || null).then(slots => ({
          date: dateStr,
          slots,
        }));
      })
    );

    res.json({ start, week: weekData });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots/detail?date=YYYY-MM-DD&start=HH:MM&end=HH:MM[&personId=uuid]
// Returns each active support person's status for that specific slot
router.get('/detail', async (req, res, next) => {
  try {
    const { date, start, end, personId } = req.query;
    if (!date || !isValidDate(date) || !start || !end) {
      return res.status(400).json({ error: 'date, start, and end are required' });
    }

    const supabase = getSupabase();

    // Active support persons (optionally filtered to one person)
    let { data: allPersons, error: personsError } = await supabase
      .from('support_persons')
      .select('*')
      .eq('is_active', true);
    if (personsError) throw personsError;
    const persons = personId
      ? (allPersons || []).filter(p => p.id === personId)
      : (allPersons || []);

    // WO days for this date
    const { data: woDays, error: woError } = await supabase
      .from('wo_days')
      .select('support_person_id')
      .eq('date', date);
    if (woError) throw woError;
    const woPersonIds = new Set((woDays || []).map(w => w.support_person_id));

    // Bookings for this date
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('date', date);
    if (bookingsError) throw bookingsError;

    // Google Calendar freebusy — always fresh, use IST ISO strings
    let gcalBusy = {};
    if (persons && persons.length > 0) {
      try {
        const dayStartIST = toIST_ISO(date, '00:00');
        const dayEndIST   = toIST_ISO(date, '23:59');
        gcalBusy = await gcalService.getFreeBusy(persons, dayStartIST, dayEndIST);
      } catch (err) {
        console.error('Google Calendar freebusy error:', err.message);
      }
    }

    const slotStartMin = timeToMinutes(start);
    const slotEndMin   = timeToMinutes(end);

    // Deduplicate persons by id (guards against duplicate rows in DB)
    const seenIds = new Set();
    const uniquePersons = (persons || []).filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    const result = uniquePersons.map(person => {
      const workStart = timeToMinutes(person.work_start);
      const workEnd   = timeToMinutes(person.work_end);

      // Outside working hours
      if (slotStartMin < workStart || slotEndMin > workEnd) {
        return { name: person.name, status: 'not_working', reason: 'outside working hours' };
      }

      // On WO day
      if (woPersonIds.has(person.id)) {
        return { name: person.name, status: 'busy', reason: 'day off' };
      }

      // On lunch break
      if (person.lunch_start && person.lunch_end) {
        const lunchStart = timeToMinutes(person.lunch_start);
        const lunchEnd   = timeToMinutes(person.lunch_end);
        if (slotStartMin < lunchEnd && slotEndMin > lunchStart) {
          return { name: person.name, status: 'busy', reason: 'lunch break' };
        }
      }

      // On tea break
      if (person.tea_start && person.tea_end) {
        const teaStart = timeToMinutes(person.tea_start);
        const teaEnd   = timeToMinutes(person.tea_end);
        if (slotStartMin < teaEnd && slotEndMin > teaStart) {
          return { name: person.name, status: 'busy', reason: 'tea break' };
        }
      }

      // Has an existing booking overlapping this slot
      const hasBooking = (bookings || []).some(b =>
        b.support_person_id === person.id &&
        normalizeTime(b.slot_start) < end &&
        normalizeTime(b.slot_end) > start
      );
      if (hasBooking) {
        return { name: person.name, status: 'busy', reason: 'existing booking' };
      }

      // Busy on Google Calendar
      if (gcalBusy && gcalBusy[person.email]) {
        const isBusy = gcalBusy[person.email].some(
          busy => busy.start < end && busy.end > start
        );
        if (isBusy) {
          return { name: person.name, status: 'busy', reason: 'calendar event' };
        }
      }

      return { name: person.name, status: 'free' };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
