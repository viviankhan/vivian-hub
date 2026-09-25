#!/usr/bin/env python3
"""Narrate every paper in Supabase that needs audio.  See PAPERS.md.

    SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  python3 worker.py check
    SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  python3 worker.py run

`check` only counts the queue (and tells a GitHub Action whether to bother
installing the voice). `run` renders each queued paper with voice.py, uploads
the MP4 to the private `paper-audio` bucket and writes the cues, the sentence
split (`lines`) and the duration back to the row.

A paper is queued when it has never been narrated (audio_path is null) or when
something read aloud changed after it was (needs_narration). Standard library
only, so it runs anywhere Python and voice.py's own dependencies do.
"""
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
MAX_ATTEMPTS = 3
TIME_BUDGET = float(os.environ.get("NARRATE_TIME_BUDGET", 40 * 60))  # seconds


def call(method, path, body=None, headers=None, raw=None):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    h.update(headers or {})
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            text = r.read().decode() or "null"
            return json.loads(text) if "json" in r.headers.get("Content-Type", "") else text
    except urllib.error.HTTPError as e:
        raise RuntimeError("%s %s -> %d %s" % (method, path.split("?")[0], e.code, e.read().decode()[:400]))


def queue(limit=50):
    q = urllib.parse.urlencode({
        "select": "id,user_id,title,authors,sections,terms,audio_path,updated_at,narration_attempts",
        "or": "(audio_path.is.null,needs_narration.is.true)",
        "narration_attempts": "lt.%d" % MAX_ATTEMPTS,
        "order": "created_at.asc",
        "limit": str(limit),
    })
    return call("GET", "/rest/v1/papers?" + q) or []


def patch(paper_id, fields, only_if_updated_at=None):
    f = {"id": "eq." + paper_id}
    if only_if_updated_at:
        f["updated_at"] = "eq." + only_if_updated_at
    rows = call("PATCH", "/rest/v1/papers?" + urllib.parse.urlencode(f), fields,
                {"Prefer": "return=representation"})
    return bool(rows)


def remove_object(path):
    try:
        call("DELETE", "/storage/v1/object/paper-audio/" + urllib.parse.quote(path))
    except Exception as e:
        print("  (could not remove old audio %s: %s)" % (path, e))


def narrate(p):
    tmp = tempfile.mkdtemp()
    src, mp4, out = (os.path.join(tmp, n) for n in ("paper.json", "audio.mp4", "out.json"))
    json.dump({"title": p["title"], "authors": p["authors"], "sections": p["sections"] or []},
              open(src, "w"), ensure_ascii=False)
    subprocess.run([sys.executable, os.path.join(HERE, "voice.py"), src, mp4, out], check=True)
    done = json.load(open(out))

    # A fresh object name every time: if the row is edited while this render
    # runs, the audio it is still playing must not be overwritten by audio whose
    # cues we then decline to save.
    path = "%s/%s-%d.mp4" % (p["user_id"], p["id"], int(time.time()))
    call("POST", "/storage/v1/object/paper-audio/" + urllib.parse.quote(path),
         headers={"Content-Type": "audio/mp4", "x-upsert": "true", "Cache-Control": "31536000"},
         raw=open(mp4, "rb").read())

    saved = patch(p["id"], {
        "sections": done["sections"], "cues": done["cues"], "dur": done["dur"],
        "audio_path": path, "needs_narration": False,
        "narration_error": None, "narration_attempts": 0,
    }, only_if_updated_at=p["updated_at"])
    if not saved:
        # Edited (or deleted) mid-render. Leave it queued; the next run picks
        # up the new text.
        remove_object(path)
        print("  changed while rendering; left queued")
        return
    if p.get("audio_path"):
        remove_object(p["audio_path"])
    print("  done: %.0fs of audio, %d cues" % (done["dur"], len(done["cues"])))


def main():
    if not URL or not KEY:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    todo = queue()
    if cmd == "check":
        print("%d paper(s) waiting for narration" % len(todo))
        gh = os.environ.get("GITHUB_OUTPUT")
        if gh:
            open(gh, "a").write("work=%s\n" % ("true" if todo else "false"))
        return
    started = time.time()
    failures = 0
    for p in todo:
        if time.time() - started > TIME_BUDGET:
            print("Time budget spent; the rest wait for the next run.")
            break
        print("Narrating: %s" % (p["title"] or p["id"]))
        try:
            narrate(p)
        except Exception as e:
            failures += 1
            msg = str(e)[:500]
            print("  failed: " + msg)
            try:
                patch(p["id"], {"narration_error": msg,
                                "narration_attempts": (p.get("narration_attempts") or 0) + 1})
            except Exception as e2:
                print("  (could not record the failure: %s)" % e2)
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
