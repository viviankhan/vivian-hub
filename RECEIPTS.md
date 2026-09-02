# Insights trackers + receipt scanning

The **Insights** tab is a home for **trackers** — folders you create for anything
worth keeping records on (a bed & breakfast, a rental, freelance work, mileage…).

Each tracker is **category-first**: you keep a list of **categories** (each marked
income or expense — Bookings, Supplies, Repairs, Payroll…), and every entry starts
by picking one, which decides whether its amount counts as money in or out. On the
same entry you can also add **your own time** (talking to / managing a contractor),
the contractor's **work started → finished** dates (it shows the turnaround, e.g.
"took 5 days"), **miles**, a **note**, and an uploaded **bill/receipt** (auto-read
by AI). From that, every tracker gives you:

- **An honest financial picture** — a cascade of Revenue → Expenses → **Profit**
  → Mileage deduction → Taxable → Tax set-aside → **Yours to keep**. Only the
  lines that apply show. A `Mileage` field turns miles into a tax deduction
  (miles × an editable rate), and a tax-set-aside % keeps profit from being
  mistaken for take-home. All of this lives in the tracker's **Setup → Finances**
  (with sensible defaults) so day-to-day entry stays simple.
- **Fixed monthly costs** (rent, insurance) you define once and add each month in
  one tap.
- **A summary** of money **in vs out → net (what's left over)**, plus **hours**,
  and — if you set a budget — **how much money and time you have left**.
- A few **plain-English highlights**, a **net-by-month** trend, and **ranked bars**
  by category (no pie charts).
- **Export** to a **PDF** or an **editable CSV**, picking exactly which columns
  appear.

The tab's **Overview** rolls every tracker up into one money-and-time summary, and
"Export all" gives a combined PDF/CSV across all of them.

New trackers start from a **template** (Bed & Breakfast, Rental, Freelance,
Mileage, or Blank) — a starting set of categories you can change any time in
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
