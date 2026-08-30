# Bed & Breakfast tracker + receipt scanning

The **B&B** tab is a work-and-expense log built for tax records:

- **Hours** — log time worked, by whom, on what activity, and what got done
  (plus optional miles driven).
- **Expenses** — log money spent: who was paid, how much, what for, when (plus
  optional miles and a receipt photo).
- **People** — add yourself and anyone you pay, so hours and payments are
  attributed per person.
- **Summary** — donut charts of hours by activity, hours by person, spending by
  category, and spending by payee, over any time frame you pick.
- **Download report** — an itemized PDF for any period. You choose which sections
  and columns appear (hours, miles, money, who, what, when, receipt photos), then
  your browser's **Save as PDF** writes the file.

All of it is private to your account (see `ACCOUNTS.md`) and works offline —
everything except the AI receipt scanner, which needs the steps below.

## Receipt scanning (optional AI)

On the **Expenses** form, **📷 Scan a receipt** lets you photograph or upload a
receipt; it's read automatically and the vendor, date, amount, category and a
short description are filled in for you to review. A small copy of the photo is
kept on the expense so it can appear in your PDF.

It uses the **same free Google Gemini setup** as the "paste an event" assistant —
if you've already done `AI_SETUP.md`, you only need to deploy one more function:

```bash
supabase functions deploy parse-receipt
```

That's it — the `GEMINI_API_KEY` secret you already set is reused. If you haven't
set up Gemini yet, follow `AI_SETUP.md` first (get a free key, set the secret),
then run the deploy above.

### Without the AI

If Gemini isn't set up, the scan button still lets you **attach** a receipt
photo — you just type the details in yourself. Nothing about the tracker
requires the AI; it only saves you typing.

## Notes

- **Privacy:** when you scan, the downscaled photo is sent to Google Gemini to be
  read, and structured fields come back. Nothing is saved to your records until
  you review the draft and tap **Save expense**.
- **Cost:** free within Gemini's free tier.
- **Images:** photos are downscaled in your browser before being stored or sent,
  so a big phone photo doesn't bloat your data or the request.
