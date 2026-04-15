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

// Returns busy periods per email for a given UTC time range
// gcalBusy[email] = [{ start: 'HH:MM', end: 'HH:MM' }, ...]  (in IST HH:MM)
async function getFreeBusy(persons, timeMinUTC, timeMaxUTC) {
  const calendar = getCalendarClient();

  const emails = [...new Set(persons.map(p => p.email).filter(Boolean))];
  if (emails.length === 0) return {};

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinUTC,
      timeMax: timeMaxUTC,
      timeZone: TIMEZONE,
      items: emails.map(email => ({ id: email })),
    },
  });

  const busyMap = {};
  const calendars = response.data.calendars || {};

  for (const email of emails) {
    const busyPeriods = (calendars[email]?.busy || []).map(period => {
      // Convert UTC ISO to IST HH:MM for comparison
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

module.exports = { getFreeBusy, createEvent, deleteEvent, updateEvent };
