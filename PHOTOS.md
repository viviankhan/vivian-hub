# Photos on the wellness trackers

You can attach photos to both wellness trackers:

- **The emotional tracker** — a mood moment. Tap the rail blob → the cloud
  bubble, pick a mood, then **"Say why, or add a photo"**. The same picker is on
  the full check-in form in the **Wellness** tab.
- **The physical / mental tracker** — a condition episode. Tap the rail blob →
  the lotus bubble, pick a condition, and add photos next to its description
  before **"Start tracking this"**. A condition flipped on from the Wellness
  tab's own chips never passes through that sheet, so it gets a photo strip
  under its pill in **"Active right now"** instead — photos added there go
  straight onto the span that's running.

Up to **4 photos** per moment or episode. Anything the phone can open works;
each image is downscaled to about 1000px on its long edge and re-encoded as a
JPEG (roughly 60–150KB) before it is stored.

**Where they show up.** A marker on the day rail carrying a picture gets a small
camera pip; tapping the marker opens it, where a photo can be viewed full-size or
removed. In the **Wellness** tab, a day's photos appear under its moments and
under "Condition photos" in the day sheet, and the camera pip on a journal cloud
now lights up for any day that has pictures on it — a treasure, a moment photo,
or a condition photo.

Everything works offline. A photo is readable on the device the moment it is
attached and uploads itself when the connection comes back, like every other
edit (see `OFFLINE.md`).

## How they're stored, and why it's done this way

Short version: **a photo is never written into the tracker's own data.**

The two trackers each live in a single synced `kv_store` row —
`wellness_checkins` and `wellness_episodes` — and those rows are rewritten **in
full** every time you log anything. If an image were inlined into one of them,
every later check-in would re-serialize and re-upload every photo you had ever
attached, and the offline outbox would carry a copy of the whole thing per queued
edit. The row would only ever get heavier, and syncing would get slower the more
you used the feature.

So instead:

- Each image is written to **its own row**, `wellness_photo_<id>`.
- The check-in or episode stores **only the id string** in a `photos` array.
- Attaching a photo writes one new row and **rewrites nothing that already
  exists**. The trackers' own rows stay exactly as small as they were before.
- Photos are read **lazily** — only when something actually renders one — and
  then cached for the rest of the session. Opening the app never pulls images.
- Removing a photo clears just that one row (it is set to `null`, which reads
  back exactly like a key that was never written). Nothing else is touched.

This needs **no schema migration, no new table, and no storage bucket** — the
rows go in the same `kv_store` everything else already uses, under the same
per-account row-level security (see `ACCOUNTS.md`). Entries logged before this
feature existed simply have no `photos` field and read back exactly as they
always did.

The implementation is `src/lib/photos.js` (the store), `src/components/
PhotoAttach.jsx` (the picker, the strip and the full-size viewer), and the
`wellness_photo_*` accessors in `src/lib/storage.js`.

`tests/photos.test.mjs` runs the whole path against an in-memory stand-in for the
database and asserts the property this design exists for: after attaching photos,
`wellness_checkins` and `wellness_episodes` still contain no image data and are
still only a few hundred bytes.

> Note: the **Treasures** feature in the Wellness tab (a keepsake photo pinned to
> a day) still stores its image inline in `wellness_treasures`. That is a
> separate, older blob and is left alone here — this change deliberately does not
> touch existing data.
