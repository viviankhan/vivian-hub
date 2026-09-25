# Papers — listen to scientific papers

The **Papers** tab is a shelf of papers, each broken into short sections and
narrated by a pre-rendered voice (Piper, `en_GB-alba-medium`). The sentence
being read is highlighted, your place is remembered, and playback carries on
with the phone locked, with the paper's title and working buttons on the lock
screen and on AirPods.

It lives in Bloom rather than in a Claude artifact for one reason: artifacts
run inside an iframe, and iOS suspends embedded media when the screen locks.
Bloom is served top-level from GitHub Pages, so it doesn't have that problem.
Nothing here may depend on an embedded context.

**Alba's narration is always pre-rendered.** `speechSynthesis` was the
prototype's first approach and failed three ways: poor, device-dependent voices,
utterances stopping when Chrome garbage-collected them, and silence on iOS in
embedded contexts. So the real narration is rendered ahead of time, and nothing
about it depends on the phone's speech engine.

**The quick voice** is the one exception, and only a stopgap. While a paper is
waiting for Alba, the player offers the phone's own voice so you can start
listening straight away (`src/lib/quickVoice.js`). It works around the known
failures as far as they can be:

- It speaks one short unit at a time (a heading, a sentence from `lines`, or a
  paragraph when the narrator hasn't split the text yet). The utterance being
  spoken is held in a live reference so it isn't garbage-collected, and a
  watchdog moves on if `onend` never fires.
- It asks for a screen wake lock, so the phone doesn't lock mid-read.
- It uses the same pronunciation rewrite as the narrator (`speakable()`, ported
  to `src/lib/paperText.js`; the tests check the two agree).
- It picks the best English voice on the device (British, on-device and
  "Enhanced/Premium" voices first), and you can choose another.

It has no lock-screen controls and stops if you lock the phone or switch apps.
When Alba's version lands (the reader checks every 30 seconds), a **Switch to
Alba** button continues from the start of the section you're on. Quick-voice
progress is saved by section, and Alba starts there.

---

## One-time setup

### 1. Database and storage

In Supabase → **SQL editor**, run **`supabase_papers.sql`**. It creates the
`papers` and `paper_progress` tables and the private `paper-audio` and
`paper-figures` buckets, all owner-only. Safe to re-run.

### 2. PDF → walkthrough

This uses the same Gemini key as the ✨ assistant (see `AI_SETUP.md`):

```bash
supabase functions deploy paper-walkthrough
```

### 3. The narrator (GitHub Action)

`.github/workflows/narrate.yml` renders audio for any paper that needs it.
It runs every 15 minutes, commits nothing, and writes straight to Supabase.

In GitHub → **Settings → Secrets and variables → Actions**, add:

| Name | Value |
|------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key |

(`VITE_SUPABASE_URL` is already there for the deploy.) The service-role key
bypasses row-level security. That's why it lives only in this secret and
never in the app.

Scheduled workflows only run from the default branch, so this starts working
once it is merged to `main`. You can also run it by hand from the **Actions**
tab (**Narrate papers → Run workflow**). GitHub pauses schedules in a repo
with no activity for 60 days. If that happens, re-enable it from the same page.

### 4. Optional: narrate right away

Without this, a new paper waits for the next 15-minute sweep. With it, adding a
paper wakes the Action immediately, so the audio arrives in about 2 minutes.

1. Create a fine-grained GitHub token: github.com → Settings → Developer
   settings → Fine-grained tokens → **Generate**. Repository access: only
   `vivian-hub`. Permissions: **Contents: Read and write**, which is what
   `repository_dispatch` requires.
2. Then:

```bash
supabase secrets set GH_DISPATCH_TOKEN=github_pat_...
supabase secrets set GH_REPO=viviankhan/vivian-hub
supabase functions deploy narrate-now
```

The function only accepts calls from a signed-in Bloom user.

### 5. Import the prototype's papers

**Papers → Add paper → Import a papers file**, and choose `papers.json`. The
prototype's "How this library works" explainer is left unticked by default,
because it describes the artifact (browser voices, "send it in chat"), not
Bloom. Imported papers arrive as text, and the narrator gives them audio on
its next run.

---

## Acceptance test (on an actual iPhone)

This is the test that matters, and it can only be done on the phone:

1. Open Bloom in Safari (or from the Home Screen icon), go to **Papers**, open
   a narrated paper and press play.
2. Lock the screen. The audio must keep going.
3. The lock screen shows the paper's title, "Forconi et al." and "Read by
   Alba". Play/pause works, and so do the skip buttons.
4. Unlock. The highlight is on the sentence being read.

Try it both in a Safari tab and from the Home Screen app, since iOS treats
them separately.

iOS shows one pair of lock-screen skip buttons, not both: either ±seconds or
previous/next (which move between sections here). Every handler is registered,
so both sets work, and whichever pair iOS leaves off the lock screen is on the
player bar in the app. AirPods' next/previous gestures move between sections.

---

## Adding papers

**Add paper → Choose a PDF.** The whole PDF goes to Gemini, which reads the
pages as images as well as text, so it sees the figures. It writes 6 to 9
spoken sections of 90 to 170 words, with no citations or markdown and
paraphrased throughout, plus 4 to 8 glossary terms. For sections whose point
lives in a figure, it also names the page and a box around the figure. The app
crops those out of the PDF itself (pdf.js), and you review everything before
saving: edit headings and metadata, adjust or redo a crop, swap in your own
screenshot, rewrite a caption, or drop a figure.

The PDF limit is about 14 MB (Gemini's inline limit).

**Add paper → Paste text.** For anything you want read to you word for word,
such as notes, an article or a protocol. Paste it or open a `.txt` file. Nothing
is rewritten and no AI is involved: blank lines separate paragraphs, short lines
standing alone (like "Methods") become sections, and text without headings is
split into parts of about 170 words. A first line directly above the first
heading is used as the title. It's narrated like any paper, and you can attach
figures afterwards.

**Figures on an existing paper:** in the reader, each section has
**+ Attach a figure** or **Edit figure**. Captions are read aloud after the
section. Changing one queues a fresh narration, and the current audio keeps
playing until the new one lands.

---

## How it fits together

```
PDF ──► paper-walkthrough (Gemini) ──► review in Bloom ──► papers row (text)
                                                              │
               narrate-now ──► GitHub Action ◄── every 15 min ┘
                                   │
          voice.py: lines[] + cues[] + MP4/AAC ──► paper-audio bucket + row
```

### Data

`papers`: `title, authors, journal, year, doi, sections, terms, cues, dur,
audio_path`, plus `needs_narration`, `narration_error`, `narration_attempts`
and `section_count` for the queue and the library list.

Each section is `{ heading, body, lines, paras, figure: { path, caption } | null }`.

`cues` is a flat, time-ordered list of `{ s, i, t }`: section index, index
into that section's `lines` (`-1` = heading, `-2` = figure caption), and the
start time in seconds.

### The sentence split lives in one place

The narrator (`scripts/narrate/voice.py`) splits sentences while it renders,
and stores the exact list it used in `lines`. The app renders `lines` and never
splits text itself (`src/lib/paperText.js`). An earlier version split in both
JS and Python, and the highlight drifted wherever they disagreed (abbreviations,
decimals). To find the current sentence, the app binary-searches for the last
cue with `t <= currentTime`.

`paras` (lines per paragraph) is written alongside `lines` so the reader can
lay them out in paragraphs. Papers narrated before it existed are matched back
to the body's paragraphs, and the lines themselves are still used verbatim.

### Player

A real `<audio controls>` in the DOM, never `new Audio()`, because mobile
browsers treat a native element far more permissively. Media Session provides
the lock-screen metadata and the play, pause, seek ±, previous/next section
and seek-to handlers. `setPositionState` is called on loadedmetadata, play,
pause, seeked and ratechange, and guarded against a zero or non-finite
duration. On Safari 17+, `navigator.audioSession.type = 'playback'` stops the
silent switch from muting it.

The player stays mounted when you switch Bloom tabs. A small pill appears while
it plays, so you can use the rest of Bloom mid-paper.

Progress is written to `paper_progress` at most every 4 seconds while playing,
and also on pause, on a section change and when the page is hidden. It's also
mirrored to localStorage, so a dropped connection never loses your place.
Speed is `audio.playbackRate`, so the voice itself is unchanged.

### The narrator

`scripts/narrate/worker.py` (standard library only) fetches papers where
`audio_path is null or needs_narration`, runs `voice.py` on each, uploads the
MP4 to `paper-audio/<user>/<paper>-<time>.mp4`, and writes `sections` (now
with `lines`), `cues`, `dur` and `audio_path` back. It only saves if the row's
`updated_at` hasn't changed since it started, so an edit made mid-render is
never overwritten with audio of the old text; the paper just stays queued. Alba never gives
up on a paper: after 3 quick retries, a failing paper is retried every 6 hours,
for good. Only its first failure turns a run red, so a stubborn paper doesn't
send you a failure email every 15 minutes. If a paper has been waiting over 40
minutes, the reader says Alba is running late and offers **Try now**. That
wakes the narrator, or, if the wake-up function isn't set up, links to the
**Run workflow** button on GitHub.

`voice.py` is your script, with three small changes:

- **Sentence-split fix.** Abbreviations now match whole words only. Before,
  the `al` abbreviation meant for "et al." also matched the end of "fungal."
  and "real.", which silently merged the following sentence into it. Two
  sentences in the CLL paper were affected.
- **"vs."** is now spoken as "versus" without a stray full stop (it was
  producing "versus . interferon", with a pause mid-sentence).
- It records `paras` and a cue (`i: -2`) for figure captions, and reads the
  voice path from `VOICE_MODEL` if set.

`speakable()`, the gaps (0.28 / 0.55 / 0.65 s), the voice and the encoding
(`-c:a aac -b:a 80k -movflags +faststart`) are unchanged. AAC in MP4, not
Opus, because older iOS Safari handles Opus unreliably.

### Narrating by hand

```bash
pip install -r scripts/narrate/requirements.txt       # piper-tts; also needs ffmpeg
python3 -m piper.download_voices en_GB-alba-medium --data-dir /tmp/voices

# One file, no Supabase:
python3 scripts/narrate/voice.py paper.json out.mp4 out.json

# Or work through the Supabase queue, same as the Action:
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
  python3 scripts/narrate/worker.py run
```

About 6× faster than real time: an 8-minute paper takes about 80 seconds,
plus a minute or so of setup in the Action.
