# FLABS Demo Booking Calendar

An internal Calendly-style booking system for 30 sales people (SPs) to book demos with a 4-person support team. The system checks real-time availability via Google Calendar, prevents double-bookings, and auto-assigns support people via round-robin.

---

## Architecture

| Layer | Tech | Purpose |
|---|---|---|
| Frontend | React + Tailwind (Vercel) | SP booking page + Admin panel |
| Backend | Node.js + Express (Vercel) | API, slot logic, GCal integration |
| Database | Supabase (Postgres) | Bookings, support persons, WO days |
| Calendar | Google Calendar API (Service Account) | Availability check + event creation |

---

## Support Team Schedule (default)

| Name | Hours | Lunch | Tea Break |
|---|---|---|---|
| Tannu Sharma | 10am–6pm | 1–2pm | 4:30–5:30pm |
| Milky Gupta | 10am–6pm | 1–2pm | 4:30–5:30pm |
| Kajal Kaushik | 10am–6pm | 1–2pm | 4:30–5:30pm |
| Kajal Gupta | 12pm–8pm | 4–5pm | none |

---

## Slot Rules

- 30-minute slots, 10am–8pm IST, no buffer between slots
- 10am–12pm: only Tannu, Milky, Kajal Kaushik are checked
- 12pm–6pm: all 4 are checked
- 6pm–8pm: only Kajal Gupta is checked (naturally from work hours)
- Green = at least 1 person free; Red = all busy/on break/on WO
- Assignment: round-robin (person with fewest total bookings)

---

## Local Setup

### Prerequisites
- Node.js 18+
- A Supabase project with the tables below
- A Google Cloud project with Calendar API enabled and a Service Account

### 1. Clone & install

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Supabase — create tables

Run this SQL in your Supabase SQL editor:

```sql
create table support_persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  work_start time not null,
  work_end time not null,
  lunch_start time,
  lunch_end time,
  tea_start time,
  tea_end time,
  is_active boolean default true
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  support_person_id uuid references support_persons(id),
  date date not null,
  slot_start time not null,
  slot_end time not null,
  booked_by text,
  google_event_id text,
  created_at timestamptz default now()
);

create table wo_days (
  id uuid primary key default gen_random_uuid(),
  support_person_id uuid references support_persons(id),
  date date not null,
  unique(support_person_id, date)
);
```

Then seed the support team:

```sql
insert into support_persons (name, email, work_start, work_end, lunch_start, lunch_end, tea_start, tea_end) values
  ('Tannu Sharma',  'tannusharma6923@gmail.com', '10:00', '18:00', '13:00', '14:00', '16:30', '17:30'),
  ('Milky Gupta',   'milkyflabs@gmail.com',     '10:00', '18:00', '13:00', '14:00', '16:30', '17:30'),
  ('Kajal Kaushik', 'kajalkaushik9546@gmail.com','10:00', '18:00', '13:00', '14:00', '16:30', '17:30'),
  ('Kajal Gupta',   'project.kajal2015@gmail.com','12:00', '20:00', '16:00', '17:00', null, null);
```

### 3. Google Calendar — Service Account setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Google Calendar API**
3. Go to **IAM & Admin → Service Accounts** → Create service account
4. Create a JSON key for the service account → download it
5. In Google Calendar, share each support person's calendar with the service account email (give "Make changes to events" permission)

### 4. Backend environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # paste full JSON on one line
ADMIN_USERNAME=admin
ADMIN_PASSWORD=flabs2024
JWT_SECRET=flabssecret123
PORT=3001
FRONTEND_URL=http://localhost:5173
```

To minify the service account JSON to one line:
```bash
cat service-account-key.json | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)))"
```

### 5. Frontend environment variables

Copy `frontend/.env.example` to `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001
```

> **Leave `VITE_API_URL` empty (or omit the line) for local dev** — when empty the frontend uses relative `/api/*` URLs which are caught by the Vite dev proxy and forwarded to `localhost:3001`.

### 6. Run locally

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

- SP Booking Page: http://localhost:5173
- Admin Panel: http://localhost:5173/admin (login: `admin` / `flabs2024`)

---

## DEPLOYMENT — VERCEL ONLY

Both backend and frontend deploy to Vercel as separate projects from the same GitHub repo.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/flabs-booking.git
git push -u origin main
```

### Step 2 — Deploy Backend on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import your GitHub repo
2. Set **Root Directory** to `backend`
3. Framework preset: **Other** (Vercel auto-detects Node.js via `vercel.json`)
4. Add these environment variables:

| Key | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service role key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | full service account JSON (minified, one line) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | `flabs2024` |
| `JWT_SECRET` | `flabssecret123` (or any secret string) |
| `FRONTEND_URL` | *(leave blank for now — fill in after Step 3)* |

5. Click **Deploy**
6. Copy the deployed backend URL, e.g. `https://flabs-booking-backend.vercel.app`

### Step 3 — Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import the **same** GitHub repo
2. Set **Root Directory** to `frontend`
3. Framework preset: **Vite**
4. Add this environment variable:

| Key | Value |
|---|---|
| `VITE_API_URL` | backend Vercel URL from Step 2, e.g. `https://flabs-booking-backend.vercel.app` |

5. Click **Deploy**
6. Copy the deployed frontend URL, e.g. `https://flabs-booking.vercel.app`

### Step 4 — Wire CORS: set FRONTEND_URL on Backend

1. Go back to your **backend** Vercel project → **Settings → Environment Variables**
2. Add:

| Key | Value |
|---|---|
| `FRONTEND_URL` | frontend Vercel URL from Step 3, e.g. `https://flabs-booking.vercel.app` |

3. Go to **Deployments** → click the three dots on the latest deployment → **Redeploy**

### Done

| URL | What it is |
|---|---|
| `https://your-frontend.vercel.app` | SP booking page (share this with all 30 SPs) |
| `https://your-frontend.vercel.app/admin` | Admin panel (Tanuj only) |
| `https://your-backend.vercel.app/health` | Backend health check |

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/slots?date=YYYY-MM-DD | None | Day slots with green/red status |
| GET | /api/slots/week?start=YYYY-MM-DD | None | Full week view (7 days) |
| POST | /api/bookings | None | Book a slot |
| GET | /api/bookings | Admin JWT | List all bookings |
| DELETE | /api/bookings/:id | Admin JWT | Cancel booking + delete GCal event |
| PUT | /api/bookings/:id | Admin JWT | Reschedule booking |
| GET | /api/support-persons | None | List support team |
| POST | /api/support-persons | Admin JWT | Add support person |
| PUT | /api/support-persons/:id | Admin JWT | Edit support person |
| DELETE | /api/support-persons/:id | Admin JWT | Delete support person |
| GET | /api/wo-days | Admin JWT | List WO/absent days |
| POST | /api/wo-days | Admin JWT | Mark absent day |
| DELETE | /api/wo-days/:id | Admin JWT | Remove absent day |
| POST | /api/admin/login | None | Admin login → returns JWT |
| GET | /health | None | Health check |

---

## Admin Credentials

```
Username: admin
Password: flabs2024
```

Controlled via `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.
