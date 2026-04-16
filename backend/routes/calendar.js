const express = require('express');
const { DateTime } = require('luxon');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

const router = express.Router();
const TIMEZONE = 'Asia/Kolkata';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getCalendarClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const key = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
  return google.calendar({ version: 'v3', auth });
}

// GET /api/calendar/day?date=YYYY-MM-DD
// Returns: { date, persons, personEvents }
//   persons: [{ id, name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end }]
//   personEvents: [{ personId, personName, events: [{ title, start, end }] }]
router.get('/day', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Missing or invalid date parameter (YYYY-MM-DD)' });
    }

    const supabase = getSupabase();
    const { data: persons, error: personsError } = await supabase
      .from('support_persons')
      .select('id, name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end')
      .eq('is_active', true)
      .order('name');
    if (personsError) throw personsError;

    // IST-offset ISO strings for Google Calendar (not UTC) to keep day boundaries correct
    const timeMin = DateTime.fromISO(`${date}T00:00:00`, { zone: TIMEZONE }).toISO();
    const timeMax = DateTime.fromISO(`${date}T23:59:59`, { zone: TIMEZONE }).toISO();

    let calendar;
    try {
      calendar = getCalendarClient();
    } catch (e) {
      console.error('Calendar client init error:', e.message);
      return res.json({
        date,
        persons: persons || [],
        personEvents: (persons || []).map(p => ({ personId: p.id, personName: p.name, events: [] })),
      });
    }

    const personEvents = await Promise.all(
      (persons || []).map(async (person) => {
        if (!person.email) {
          return { personId: person.id, personName: person.name, events: [] };
        }
        try {
          const response = await calendar.events.list({
            calendarId: person.email,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: TIMEZONE,
            // Bust Google-side caching with a unique requestId
            requestId: `flabs-${date}-${person.id}-${Date.now()}`,
          });
          const events = (response.data.items || [])
            .filter(e => e.start?.dateTime) // skip all-day events
            .map(e => {
              const start = DateTime.fromISO(e.start.dateTime).setZone(TIMEZONE).toFormat('HH:mm');
              const end   = DateTime.fromISO(e.end.dateTime).setZone(TIMEZONE).toFormat('HH:mm');
              return { title: e.summary || '(No title)', start, end };
            });
          return { personId: person.id, personName: person.name, events };
        } catch (err) {
          console.error(`GCal events.list error for ${person.email}:`, err.message);
          return { personId: person.id, personName: person.name, events: [] };
        }
      })
    );

    res.json({ date, persons: persons || [], personEvents });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
