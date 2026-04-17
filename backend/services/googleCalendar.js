const { google } = require('googleapis');
const { DateTime } = require('luxon');

const TIMEZONE = 'Asia/Kolkata';

function getAuthClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable not set');
  }

  let key;
  try {
    key = JSON.parse(keyJson);
  } catch (e) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON: not valid JSON');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });

  return auth;
}

function getCalendarClient() {
  const auth = getAuthClient();
  return google.calendar({ version: 'v3', auth });
}

// Returns busy periods per email for a given date using events.list per person.
// Falls back to all-day busy if a calendar is inaccessible (e.g. not shared with service account).
// busyMap[email] = [{ start: 'HH:MM', end: 'HH:MM' }, ...]  (in IST HH:MM)
async function getPersonsBusy(persons, dateStr) {
  const calendar = getCalendarClient();

  // IST-offset ISO strings to keep day boundaries correct
  const timeMin = DateTime.fromISO(`${dateStr}T00:00:00`, { zone: TIMEZONE }).toISO();
  const timeMax = DateTime.fromISO(`${dateStr}T23:59:59`, { zone: TIMEZONE }).toISO();

  const busyMap = {};

  await Promise.all(
    persons.map(async (person) => {
      if (!person.email) return;

      console.log('[SLOTS] Checking person:', person.name, person.email);
      try {
        const response = await calendar.events.list({
          calendarId: person.email,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          timeZone: TIMEZONE,
        });

        const events = (response.data.items || [])
          .map(e => {
            console.log('[GCAL] Event for', person.email, ':', e.summary,
              'type:', e.start?.dateTime ? 'timed' : 'all-day',
              'start:', e.start?.dateTime || e.start?.date
            );

            if (e.start?.dateTime) {
              // Timed event — convert to IST HH:MM
              const startIST = DateTime.fromISO(e.start.dateTime).setZone(TIMEZONE).toFormat('HH:mm');
              const endIST   = DateTime.fromISO(e.end.dateTime).setZone(TIMEZONE).toFormat('HH:mm');
              return { start: startIST, end: endIST };
            }

            if (e.start?.date) {
              // All-day event (start.date = 'YYYY-MM-DD') — blocks the entire day
              return { start: '00:00', end: '23:59' };
            }

            return null;
          })
          .filter(Boolean);

        console.log('[SLOTS] Events found:', events.length, 'for', person.email);
        busyMap[person.email] = events;
      } catch (err) {
        console.error('[SLOTS] Cannot access calendar for:', person.email, err.message);
        // Calendar not accessible — mark as busy all day so we never show as free
        busyMap[person.email] = [{ start: '00:00', end: '23:59' }];
      }
    })
  );

  return busyMap;
}

// Kept for any callers that still use the freebusy approach.
async function getFreeBusy(persons, timeMinIST, timeMaxIST) {
  const calendar = getCalendarClient();

  const emails = [...new Set(persons.map(p => p.email).filter(Boolean))];
  if (emails.length === 0) return {};

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinIST,
      timeMax: timeMaxIST,
      timeZone: TIMEZONE,
      items: emails.map(email => ({ id: email, calendarId: email })),
    },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'X-Request-Timestamp': String(Date.now()),
    },
  });

  const busyMap = {};
  const calendars = response.data.calendars || {};

  for (const email of emails) {
    const busyPeriods = (calendars[email]?.busy || []).map(period => {
      const startIST = DateTime.fromISO(period.start).setZone(TIMEZONE);
      const endIST = DateTime.fromISO(period.end).setZone(TIMEZONE);
      return {
        start: startIST.toFormat('HH:mm'),
        end: endIST.toFormat('HH:mm'),
      };
    });
    busyMap[email] = busyPeriods;
  }

  return busyMap;
}

// Create a Google Calendar event on a person's calendar
async function createEvent(person, dateStr, slotStart, slotEnd, title) {
  const calendar = getCalendarClient();

  const startDT = DateTime.fromISO(`${dateStr}T${slotStart}:00`, { zone: TIMEZONE });
  const endDT = DateTime.fromISO(`${dateStr}T${slotEnd}:00`, { zone: TIMEZONE });

  const response = await calendar.events.insert({
    calendarId: person.email,
    requestBody: {
      summary: title || 'FLABS Demo',
      description: 'Demo booked via FLABS Booking System',
      start: {
        dateTime: startDT.toISO(),
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDT.toISO(),
        timeZone: TIMEZONE,
      },
      attendees: [{ email: person.email }],
    },
  });

  return response.data.id;
}

// Delete a Google Calendar event
async function deleteEvent(calendarId, eventId) {
  if (!eventId) return;
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });
  } catch (err) {
    // Event may already be deleted; log but don't throw
    console.error(`Failed to delete event ${eventId} from ${calendarId}:`, err.message);
  }
}

// Update (patch) a Google Calendar event
async function updateEvent(person, eventId, dateStr, slotStart, slotEnd, title) {
  const calendar = getCalendarClient();

  const startDT = DateTime.fromISO(`${dateStr}T${slotStart}:00`, { zone: TIMEZONE });
  const endDT = DateTime.fromISO(`${dateStr}T${slotEnd}:00`, { zone: TIMEZONE });

  await calendar.events.patch({
    calendarId: person.email,
    eventId,
    requestBody: {
      summary: title || 'FLABS Demo',
      start: {
        dateTime: startDT.toISO(),
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDT.toISO(),
        timeZone: TIMEZONE,
      },
    },
  });
}

module.exports = { getPersonsBusy, getFreeBusy, createEvent, deleteEvent, updateEvent };
