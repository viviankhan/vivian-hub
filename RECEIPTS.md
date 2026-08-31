# Insights trackers + receipt scanning

The **Insights** tab is a home for **trackers** — folders you create for anything
worth keeping records on (a bed & breakfast, a rental, freelance work, mileage…).

Each tracker holds **fields you define yourself**, so one entry can carry
whatever you want at once — money coming in, money going out, hours, a number
like miles, a category, a person, a receipt photo. From that, every tracker gives
you:

- **A summary** of money **in vs out → net (what's left over)**, plus **hours**,
  and — if you set a budget — **how much money and time you have left**.
- A few **plain-English highlights** and clean **donut charts** (no generic bar
  breakdowns).
- **Export** to a **PDF** or an **editable CSV**, picking exactly which columns
  appear.

The tab's **Overview** rolls every tracker up into one money-and-time summary, and
"Export all" gives a combined PDF/CSV across all of them.

New trackers start from a **template** (Standard, Bed & Breakfast, Mileage,
Freelance, or Blank) — just a starting set of fields you can change any time in
the tracker's **Setup** tab, where you also set budgets.

All of it is private to your account (see `ACCOUNTS.md`) and works offline —
everything except the AI receipt scanner, which needs the steps below.

## Receipt scanning (optional AI)

If a tracker has a **Receipt** field, its entry form shows **📷 Scan a receipt**:
photograph or upload a receipt and it's read automatically, filling in the amount
(into a *money out* field), a category, a description, and the date, for you to
review. A small copy of the photo is kept on the entry so it can appear in your
PDF.

It uses the **same free Google Gemini setup** as the "paste an event" assistant —
if you've already done `AI_SETUP.md`, you only need to deploy one more function:

```bash
supabase functions deploy parse-receipt
```

The `GEMINI_API_KEY` secret you already set is reused. If you haven't set up
Gemini yet, follow `AI_SETUP.md` first, then run the deploy above.

### Without the AI

If Gemini isn't set up, the Receipt field still lets you **attach** a photo — you
just type the details yourself. Nothing about the trackers requires the AI; it
only saves you typing.

## Notes

- **Privacy:** when you scan, the downscaled photo is sent to Google Gemini to be
  read, and structured fields come back. Nothing is saved until you review the
  draft and tap **Save entry**.
- **Cost:** free within Gemini's free tier.
- **Images:** photos are downscaled in your browser before being stored or sent,
  so a big phone photo doesn't bloat your data or the request.
