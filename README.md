# RosterSync — Complete Setup & Testing Guide

This guide is written so that anyone — with or without a technical background — can pull this project and have the full system running and testable within minutes. Follow every step in order.

---

## What is RosterSync?

RosterSync is a web application that automatically generates fair on-call rosters for medical departments. It has two types of users:

- **Admins (HODs / Department Leads)** — create departments, add doctors, generate and publish monthly rosters, approve or reject requests, and view fairness reports.
- **Doctors** — log in, view their roster, and submit requests (leave, unavailability, or preferred work days).

---

## Before You Start — Install Node.js

Node.js is the only thing you need to install. If you already have it, skip this section.

1. Open your browser and go to **https://nodejs.org**
2. Click the big **"LTS"** download button
3. Open the downloaded file and follow the installer (click Next all the way through)

**Check it worked:**
- On **Mac**: press `Command + Space`, type `Terminal`, press Enter
- On **Windows**: press the Windows key, type `cmd`, press Enter

In the window that opens, type:

```
node --version
```

Press Enter. You should see something like `v20.11.0`. If you do, you're ready.

---

## Step 1 — Open the Project Folder in Terminal

- On **Mac**: open Terminal, then type `cd ` (with a space after), drag the `rostersync` folder into the terminal window, and press Enter.
- On **Windows**: open Command Prompt, type `cd ` then type or paste the full path to the folder, e.g. `cd C:\Users\YourName\Documents\rostersync`

---

## Step 2 — Install Dependencies (One-Time Setup)

Run these commands in order. Wait for each to finish before running the next.

Install the **frontend**:

```
npm install
```

Install the **backend**:

```
cd backend
npm install
cd ..
```

You only need to do this once. Next time you can skip straight to Step 3.

---

## Step 3 — Start the Backend (Server)

Open a terminal window, go to the project folder, and run:

```
cd backend
npm run dev
```

After about 5 seconds you should see all six lines appear:

```
🔐 Auth Service running on port 4001
📅 Roster Service running on port 4002
📝 Request Service running on port 4003
👥 User Service running on port 4004
📊 Analytics Service running on port 4005
🚀 API Gateway running on port 4000
```

**Keep this window open.** The server stops if you close it.

---

## Step 4 — Start the Frontend (Website)

Open a **second** terminal window, go to the project folder, and run:

```
npm run dev
```

You should see:

```
  VITE ready in ... ms
  ➜  Local:   http://localhost:3000/
```

**Keep this window open too.**

---

## Step 5 — Open the App

Open your web browser (Chrome or Firefox recommended) and go to:

```
http://localhost:3000
```

You will see the RosterSync login screen.

---

## One-Command Start (Alternative to Steps 3 & 4)

If you prefer, you can start everything with a single command from the project root:

```
npm run dev:all
```

This starts both backend and frontend in the same terminal window. Wait until you see all 6 backend service lines plus the Vite line before opening the browser.

---

## Accounts Already in the Database

The database has existing test accounts from development. Passwords are stored as one-way encrypted hashes and **cannot be read back**, so the passwords for these accounts are not recoverable.

**We recommend creating fresh accounts** using the steps below. The existing accounts are listed here for reference:

| Name | Email | Role | Department |
|---|---|---|---|
| Dr. Test3 | test3@med.com | Admin | LEGACY |
| Dr Admin | admin@email.com | Admin | LEGACY |
| Dr Admin 2 | admin@admin.com | Admin | Livingstone Neuro |
| Dr. Test2 | test2@med.com | Doctor | LEGACY |
| Dr Reshad | reshad.amin101@gmail.com | Doctor | LEGACY |
| Dr Test 22 | reshad@test.com | Doctor | Livingstone Neuro |

**Active department codes:**

| Department | Join Code |
|---|---|
| Livingstone Neuro | `F3665JK3` |

---

## Creating Test Accounts (Recommended Starting Point)

### Create an Admin Account

1. On the login screen, click **Register**
2. Fill in:
   - **Name:** `Test Admin`
   - **Email:** `admin@test.com`
   - **Password:** `TestPass123`
   - **Role:** Admin
   - **Department Name:** `Cardiology Unit` *(any name you like)*
   - **Firm/Practice:** `City Hospital` *(optional)*
3. Click **Register**
4. You will be logged in and land on your dashboard
5. Your **department code** is shown on screen — write it down. Doctors need this to join your department. It looks like `A1B2C3D4`.

### Create Doctor Accounts

You need at least 3 doctors for the roster to be interesting. For each doctor:

1. Open a **Private / Incognito** browser window (so you can be logged in as two people at once)
2. Go to `http://localhost:3000`
3. Click **Register**
4. Fill in:
   - **Name:** e.g. `Dr Smith`
   - **Email:** e.g. `drsmith@test.com`
   - **Password:** `TestPass123`
   - **Role:** Doctor
   - **Firm:** `City Hospital`
5. Click **Register**
6. You'll be asked to join a department — enter your admin's department code
7. Click **Request to Join**
8. A message confirms the request was sent

Repeat for more doctors. Suggested test accounts:

| Name | Email | Password |
|---|---|---|
| Dr Smith | drsmith@test.com | TestPass123 |
| Dr Jones | drjones@test.com | TestPass123 |
| Dr Lee | drlee@test.com | TestPass123 |
| Dr Patel | drpatel@test.com | TestPass123 |

---

## Testing Every Feature

### Feature 1 — Approve Doctor Join Requests

**Who:** Admin

1. Log in as Admin (`admin@test.com` / `TestPass123`)
2. Go to the **Staff** or **Team** section
3. Find pending join requests from the doctors you registered
4. Click **Approve** for each
5. Doctors are now in your department and will appear in rosters

---

### Feature 2 — Generate a Roster

**Who:** Admin

1. Log in as Admin
2. Click the **Roster** or **Calendar** tab
3. Select the month and year (e.g. May 2026)
4. Click **Generate Roster**
5. The roster appears — one doctor assigned per day
6. Weekdays show 16-hour night shifts (4 PM → 8 AM)
7. Weekends show 24-hour shifts (8 AM → 8 AM)
8. South African public holidays are highlighted automatically

**What to check:**
- Every day has a doctor assigned
- No doctor appears on two consecutive days (unless department is critically short-staffed)
- No doctor has more than 2 shifts in any 7-day stretch

---

### Feature 3 — View the Fairness Report

**Who:** Admin and Doctors

After generating a roster, find the **Fairness Report** or **Analytics** section. You will see:

- Each doctor's **total hours**, **weekend shifts**, and **public holiday shifts** this month
- Any **warnings**, for example:
  - `Hour Discrepancy: 32h difference exceeds the fair limit`
  - `Weekend Imbalance: shifts not split equally`
  - `Unassigned Day: 2026-05-10 — all doctors are on approved leave. Manual assignment required.`
  - `Weekend Conflict on 2026-05-09: 2 doctors requested the same day off — admin review required.`

---

### Feature 4 — Submit a Leave Request (Doctor)

**Who:** Doctor

1. Log in as a Doctor (e.g. `drsmith@test.com` / `TestPass123`)
2. Click the **Requests** tab
3. Click **New Request**
4. Set **Type** to `Leave`
5. Pick a date in the upcoming month
6. Add an optional reason
7. Click **Submit**
8. Status shows as **Pending**

---

### Feature 5 — Submit an Unavailability Request (Doctor)

Same as Feature 4, but choose **Type: Unavailable**. This signals the doctor is technically available in emergencies but prefers not to work that day.

---

### Feature 6 — Submit a "Preferred Work" Request (Doctor)

This lets a doctor request to be assigned on a specific day (e.g. they want to be on-call before a planned post-call day off).

1. Log in as a Doctor
2. Click **Requests** → **New Request**
3. Set **Type** to `Preferred Work`
4. Pick a date
5. Click **Submit**
6. Once Admin approves it, the next roster generation gives this doctor guaranteed priority on that day (still subject to leave conflicts and rest rules)

---

### Feature 7 — Approve or Reject Requests (Admin)

**Who:** Admin

1. Log in as Admin
2. Click the **Requests** tab
3. All pending requests from all doctors are listed
4. Click **Approve** or **Reject** on each
5. Reasons submitted by doctors are visible only to Admin

**Test tip:** Approve a leave request from Dr Smith, then regenerate the roster — Dr Smith should not appear on that date.

---

### Feature 8 — Regenerate Roster After Approving Requests

1. After approving requests, go back to the **Roster** tab
2. Click **Generate Roster** again for the same month
3. The new roster will:
   - Skip doctors with approved leave on that day
   - Give top priority to doctors with approved Preferred Work requests
   - Trigger weekend conflict warnings if multiple doctors have leave on the same weekend day

---

### Feature 9 — Weekend Conflict Warning

**To test this:**
1. Log in as Dr Smith — submit a Leave request for a Saturday
2. Log in as Dr Jones — submit a Leave request for the **same Saturday**
3. Log in as Admin — approve both requests
4. Generate the roster
5. In the Fairness Report, you should see: `Weekend Conflict on YYYY-MM-DD: 2 doctors requested the same day off — admin review required.`
6. Admin can then contact the two doctors to resolve it

---

### Feature 10 — Manually Edit a Shift (Admin)

**Who:** Admin

1. On the Roster view, click on any assigned shift
2. Choose a different doctor from the list
3. Save — the shift is reassigned immediately

---

### Feature 11 — Publish a Roster (Admin)

Publishing locks the roster as official and updates each doctor's long-term cumulative stats (hours, weekends, public holidays). These stats feed into the fairness algorithm for future months.

1. Admin: click **Publish** on the current month's roster
2. Status changes from **Draft** to **Final**
3. Each doctor's cumulative statistics are updated automatically

---

### Feature 12 — Adjust Fairness Settings (Admin)

Admin can change the thresholds that trigger fairness warnings, and configure scheduling rules.

1. Log in as Admin
2. Go to **Analytics** or **Settings**
3. You will see four settings:

| Setting | What it does | Default |
|---|---|---|
| **Hour Difference Limit** | How many hours apart two doctors can be before a warning fires | 24 |
| **Weekend Difference Limit** | How many extra weekends one doctor can have vs another before a warning | 1 |
| **Max Shifts per 7 Days** | Rolling weekly cap per doctor — raise this if the department is short-staffed | 2 |
| **Allow Consecutive Shifts** | When ON, back-to-back shifts are allowed freely (for very short-staffed situations). Default is OFF. | OFF |

4. Change any value, save, and regenerate the roster to see the effect

---

### Feature 13 — Set a New Doctor's Workload Start Mode (Admin)

When a new doctor joins, Admin can decide how quickly they reach full workload.

1. Log in as Admin
2. Go to **Staff** → find the new doctor → click **Edit**
3. Set **Workload Start**:
   - **NEXT_MONTH** (default) — reduced load in the first 2 months; the doctor won't be overloaded just because they have fewer historical hours
   - **IMMEDIATE** — treated exactly the same as experienced doctors from day one
4. Save and regenerate the roster

---

### Feature 14 — New Doctor Integration (Automatic)

When a doctor's `Workload Start Mode` is `NEXT_MONTH`, the algorithm automatically:
- Detects that they have fewer than 2 months of history
- Sets their "effective cumulative hours" to approximately 80% of what a veteran would have
- This prevents the new doctor from being assigned every shift just because their total is zero

This is automatic and requires no admin action beyond leaving the default setting.

---

### Feature 15 — Sync Cumulative Stats (Admin)

If the database has published rosters from before cumulative tracking was added, this button recalculates all stats from scratch.

1. Log in as Admin
2. Find the **Sync Cumulative** or **Recalculate Stats** button (in roster or settings area)
3. Click it — all doctors' cumulative hours, weekends, and holiday hours are recomputed from all published rosters

---

### Feature 16 — Multi-Department Support

A user can belong to multiple departments. Admins manage only their own department.

**To test:**
1. Create a second Admin account with a different email and department name
2. Note the second department's code
3. Log in as a Doctor account
4. Go to the department switcher (dropdown at top of screen)
5. Enter the second department's code and request to join
6. The second Admin approves
7. The doctor can now switch between departments using the dropdown

---

## Port Reference

| Service | Port | Purpose |
|---|---|---|
| Frontend (browser) | 3000 | The UI you open in your browser |
| API Gateway | 4000 | Receives all requests and routes them |
| Auth Service | 4001 | Login, register, department management |
| Roster Service | 4002 | Generate, edit, publish rosters |
| Request Service | 4003 | Leave, swap, preferred work requests |
| User Service | 4004 | Doctor profiles and workload settings |
| Analytics Service | 4005 | Fairness reports and settings |

---

## URLs & API (read this if login or “Past rosters” fails)

- **Always call the gateway from the browser:** `http://localhost:4000` (path prefix `/api/...`). The gateway forwards to the microservices.
- **Never set `VITE_API_URL` to ports 4001–4005.** Those services only implement **part** of `/api`. For example, `/api/rosters/archive` is implemented on the roster service but is only reachable in normal setups via the gateway; pointing the SPA at `http://localhost:4001` produces confusing HTML errors.
- **Recommended local dev:** leave **`VITE_API_URL` unset** (or empty) in the project root `.env`. Then `npm run dev` proxies **`/api` → `http://127.0.0.1:4000`**, so the UI keeps working even when Vite picks port **3001–3005** because ports **3000–3002** are busy.
- Override proxy target if needed: **`VITE_GATEWAY_PROXY_TARGET=http://127.0.0.1:4000`** (see root `.env.example`).
- **Docker:** `docker-compose.yml` builds the SPA with **`VITE_API_URL=http://localhost:4000`** by default (matches the published gateway port). The frontend image’s **`nginx/spa.conf`** also defines an **`/api/`** upstream to **`backend:4000`** for setups where you want same-origin API routing behind one hostname.

---

## Environment Configuration

Backend secrets and ports live in **`backend/.env`** (copy from **`backend/.env.example`**). You need at least **`DATABASE_URL`** (PostgreSQL) and **`JWT_SECRET`**.

If **`CORS_ORIGIN`** is unset, development allows common **`http://localhost:<port>`** origins automatically. In production, set it to your real site URL(s), comma-separated.

See **`backend/.env.example`** and the root **`.env.example`** for full variable lists.

---

## Database

The app uses **PostgreSQL**. Set **`DATABASE_URL`** in **`backend/.env`** (see **`backend/.env.example`**). Tables are created automatically on first connection.

To wipe data in development, drop and recreate the database (or remove the Docker volume if you use Compose), then restart the backend and register accounts again.

An older **`backend/data/rostersync.db`** path may still appear in legacy docs; it is not used by the current Postgres backend.

---

## Troubleshooting

**Blank page or "Cannot connect"**
- Make sure both terminal windows are still open and running
- Make sure the backend shows all 6 service lines
- Try refreshing the browser

**"Port already in use" error**
- Another program is on the same port
- Restart your computer and try again

**Login says "Invalid credentials" on existing accounts**
- The password for that development account is not known
- Click **Register** and create a new account instead

**Roster generates but only shows a few days**
- You need at least 2 approved doctors in the department
- Go to Staff, check all doctors are approved (not pending)

**Backend crashes immediately after `npm run dev`**
- Make sure you ran `npm install` inside the `backend/` folder specifically
- Make sure you are inside the `backend/` folder when running `npm run dev`

**CORS error in browser**
- Prefer leaving **`CORS_ORIGIN` unset** in dev (defaults include several localhost ports), or set a comma-separated list that matches your Vite URL (e.g. `http://localhost:3003`).
- Or leave **`VITE_API_URL` unset** so Vite proxies **`/api`** to the gateway (same-origin, no CORS).

---

## Stopping the App

In each terminal window, press:

```
Ctrl + C
```

This safely shuts down the servers.

---

## File Structure

```
rostersync/
├── backend/
│   ├── data/
│   │   └── rostersync.db          ← All data lives here
│   ├── services/
│   │   ├── auth-service.ts        ← Login, register, departments
│   │   ├── roster-service.ts      ← Roster generation & publishing
│   │   ├── request-service.ts     ← Leave/swap/preferred-work requests
│   │   ├── user-service.ts        ← Doctor management
│   │   ├── analytics-service.ts   ← Fairness reports & settings
│   │   └── gateway.ts             ← API router
│   ├── shared/
│   │   ├── rosterEngine.ts        ← The fairness algorithm
│   │   ├── types.ts               ← Data types
│   │   ├── database.ts            ← Database setup & migrations
│   │   └── publicHolidays.ts      ← SA public holidays
│   └── .env                       ← Backend configuration
├── src/
│   ├── api/client.ts              ← Frontend API calls
│   └── components/                ← UI components
├── App.tsx                        ← Main frontend application
├── types.ts                       ← Shared types (frontend copy)
├── rosterEngine.ts                ← Algorithm (frontend copy)
└── README.md                      ← This guide
```
