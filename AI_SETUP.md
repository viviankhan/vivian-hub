# AI assistant — 2-minute setup

The ✨ button on **Today** opens an assistant: type an instruction — "make a
task for the dentist next Tue 3pm", "add the Aug 17 assignments to my Orgo
task's subtasks and check them off", "reschedule the lab to Friday" — and it
plans the changes against your current tasks, shows you the plan, and applies it
only after you tap **Apply**. It can create tasks, add/check subtasks on an
existing task, mark tasks complete, and reschedule.

It runs on **Google Gemini's free tier**. The AI key stays on the server (a
Supabase Edge Function), never in the app's public code. You just do this once.

## 1. Get a free Gemini API key

1. Go to **https://aistudio.google.com/apikey** (sign in with a Google account).
2. Click **Create API key**. Copy it.

The free tier is plenty for personal use (generous daily limit, no card needed).

## 2. Give the key to your Supabase project (as a secret)

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) once. From the
project folder:

```bash
supabase login                       # first time only
supabase link --project-ref fdvfpbhrojniiqqdnoii   # your project ref
supabase secrets set GEMINI_API_KEY=PASTE_YOUR_KEY_HERE
```

The secret lives only in Supabase — it is never committed and never shipped to
the browser.

## 3. Deploy the function

```bash
supabase functions deploy parse-event
```

That's it. Open the app, tap **✨** on Today, paste something, and tap
**"Read it into a task."**

## Notes

- **Cost:** free within Gemini's free tier. If you ever hit the rate limit, the
  app shows a friendly "try again in a moment" message.
- **Privacy:** the text you paste is sent to Google Gemini to be structured.
  Nothing is saved to your planner until you review the draft and tap Save.
- **Model:** `gemini-2.0-flash`. To change it, edit `MODEL` in
  `supabase/functions/parse-event/index.ts` and redeploy.
- **If the ✨ button does nothing / errors:** it means the function isn't
  deployed yet or the key isn't set — re-run steps 2 and 3. The button only
  appears when your Supabase URL is configured (`VITE_SUPABASE_URL`).
