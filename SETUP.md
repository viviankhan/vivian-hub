# Vivian Hub — Setup Instructions

This is a one-time setup. After this, the app lives at a permanent URL,
your data never disappears, and Claude only needs to edit two small files
to update your schedule or flashcards.

---

## Step 1 — Put the code on GitHub

1. Go to **github.com** and sign in
2. Click **+** (top right) → **New repository**
3. Name it `vivian-hub`
4. Set to **Public** (required for free GitHub Pages)
5. Click **Create repository**
6. On the next page, click **uploading an existing file**
7. Drag and drop the entire `vivian-app` folder contents (everything inside it)
8. Click **Commit changes**

---

## Step 2 — Set up Supabase (free cloud database)

1. Go to **supabase.com** → **Start your project** → sign in with GitHub
2. Click **New project** → name it `vivian-hub` → pick any region → set a password → **Create**
3. Wait ~2 minutes for it to provision
4. In the left sidebar click **SQL Editor**
5. Paste the contents of `supabase_setup.sql` and click **Run**
6. In the left sidebar click **Project Settings** → **API**
7. Copy two values:
   - **Project URL** (looks like `https://abcdef.supabase.co`)
   - **anon public** key (long string under "Project API keys")

---

## Step 3 — Add secrets to GitHub

1. Go to your `vivian-hub` repo on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add these two:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | Your Project URL from Step 2 |
   | `VITE_SUPABASE_ANON_KEY` | Your anon key from Step 2 |

---

## Step 4 — Enable GitHub Pages

1. In your repo, go to **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Click **Save**

---

## Step 5 — Trigger the first deploy

1. Go to your repo → **Actions** tab
2. If a workflow is already running, wait for it to finish (green checkmark)
3. If nothing is running, go to any file → edit it → add a space → commit → this triggers the deploy

Your app will be live at:
```
https://YOUR-GITHUB-USERNAME.github.io/vivian-hub/
```

---

## Put Bloom on your phone (app + reminders)

Bloom is a PWA — it installs to your Home Screen and looks/opens like a real app,
and it can send you reminders before your commitments and events.

**iPhone (iOS 16.4 or newer):**
1. Open your Bloom URL in **Safari** (this must be Safari, not Chrome or an in-app browser).
2. Tap the **Share** button (square with an up-arrow) → **Add to Home Screen** → **Add**.
3. Open Bloom from its new Home Screen icon.
4. Tap **⚙️ Settings → Reminders → Turn on**, and allow notifications when asked.

**Android / desktop (Chrome):**
1. Open Bloom in **Chrome**.
2. Menu (**⋮**) → **Add to Home screen** / **Install app**.
3. Open it, then **⚙️ Settings → Reminders → Turn on**.

**What the reminders do:**
- A nudge **the day before** each commitment and event.
- A nudge **an hour before** anything with a set time.
- Untimed items are reminded around **9:00 AM**.

Reminders fire while Bloom is open, and "catch up" the moment you reopen it, so
nothing gets missed on the day.

**Note on fully-closed alerts:** because Bloom has no server of its own, reminders
are scheduled by the app itself. That covers the common case (you open Bloom at
least once a day), but it can't push an alert when the app has been closed for a
long time. Adding true background push would mean running a small push service
(e.g. a Supabase Edge Function on a schedule with Web Push / VAPID keys) that
stores your notification subscription and sends alerts server-side. That's a
larger, separate piece of work — ask Claude if you want it.

---

## How updates work going forward

**To update your schedule or add flashcards:**
Claude edits one of two files:
- `src/data/schedule.js` — for schedule, todos, calendar events
- `src/data/flashcards.js` — for study content

You download that one file, replace it in your repo (drag-drop on GitHub), and it auto-deploys in ~2 minutes.

**To report issues or request changes:**
Use the Notes tab in the app. Your notes are saved to Supabase and you can paste them to Claude at the start of a session.

---

## If something breaks

The app falls back to **localStorage** automatically if Supabase isn't connected. So even without Supabase set up, the app works — it just resets when you clear your browser cache.

To test locally before deploying:
1. Open Command Prompt (Windows) or Terminal
2. Navigate to the `vivian-app` folder: `cd path\to\vivian-app`
3. Run: `npm install` then `npm run dev`
4. Open `http://localhost:5173/vivian-hub/` in your browser
