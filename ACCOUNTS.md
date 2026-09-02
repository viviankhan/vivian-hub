# Accounts — private space per person

Bloom can run as a multi-account app: each person signs in with their own email
and password and gets a completely private planner, plus their own **Bed &
Breakfast** work/expense records. Nobody sees anyone else's data.

This is optional and only turns on when Supabase is configured. In local
(no-Supabase) mode Bloom stays single-space and just opens — no login.

## What you get

- A sign-in / create-account / reset-password screen (`src/components/Auth.jsx`).
- Every database row is stamped with the owner and locked down with row-level
  security, so an account only ever reads and writes its **own** rows.
- A **Settings → Account** panel showing who's signed in, with a Sign out button.

## Turn it on (one time)

You need a Supabase project already wired up (see `SETUP.md`).

### 1. Enable email accounts in Supabase

In your project dashboard: **Authentication → Providers → Email** — make sure
Email is enabled. If you'd rather skip the confirmation email (handy for a
family setup), turn **Confirm email** off there; then a new account can sign in
immediately after signing up. With it on, Bloom shows "check your email to
confirm" after sign-up.

### 2. Run the migration

Open **SQL editor** in Supabase and run **`supabase_auth_migration.sql`**. It:

- adds a `user_id` to every table (defaulting to the signed-in account),
- makes the shared `kv_store` and `categories` keyed per account, and
- tightens every table's security policy to "only your own rows".

It's safe to re-run.

### 3. Claim your existing data

Everything created **before** accounts existed has no owner, so once the
stricter rules are live it would be hidden. To keep it:

1. Open the app (it now shows a login screen) and **create your account** with
   the email you want to own the old data.
2. In `supabase_auth_migration.sql`, set `claim_email` (near the top of STEP 3)
   to that same email.
3. Run the file again. Every ownerless row becomes yours.

If this is a brand-new project with nothing to keep, skip this — leave
`claim_email` as-is and it simply matches nothing.

### 4. Everyone else just signs up

Anyone else (e.g. your mom) opens the app and taps **Create an account**. They
start with a clean, private space of their own.

## Notes

- **Same browser, two people:** appearance/theme is remembered per device, so
  signing in as someone else may briefly show the previous look before their own
  settings load. Their actual data (tasks, hours, expenses) is always private.
- **Background push / reminders** stay per-device, not per-account — they're tied
  to the browser that granted notification permission.
- **Order of operations:** the login screen appears as soon as this version is
  deployed with Supabase configured. **Run the migration around the same time
  you deploy.** If you deploy *without* running it, people can still sign up, but
  because the old "allow all" policies are still in place everyone would share
  one data pool until you run the migration — after which each account is
  correctly walled off (and your original data belongs to whoever you claimed it
  with in step 3). Nothing is ever deleted; running the migration late just
  fixes the scoping.
