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
# Keys pasted on a phone often pick up spaces or a line break; none belong.
URL = "".join(os.environ.get("SUPABASE_URL", "").split()).rstrip("/")
KEY = "".join(os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").split())
MAX_ATTEMPTS = 3            # quick retries (one per run) before backing off
RETRY_EVERY_HOURS = 6       # after that, keep trying on this rhythm, forever
TIME_BUDGET = float(os.environ.get("NARRATE_TIME_BUDGET", 40 * 60))  # seconds


def auth_headers(key):
    """Headers for Supabase's two kinds of secret key.

    The older service_role key is a JWT ("eyJ...") and goes in both headers.
    The newer secret key ("sb_secret_...") is not a JWT: it goes only in
    `apikey`, and sending it as a Bearer token gets "Invalid API key".
    """
    if key.startswith("eyJ"):
        return {"apikey": key, "Authorization": "Bearer " + key}
    return {"apikey": key}


def explain_key_problem():
    kind = ("only part of a key: the service_role key is about 200 characters with two dots, "
            "and copying on a phone often stops at the first dot. The sb_secret_ key has no dots "
            "and is easier to copy" if KEY.startswith("eyJ") and KEY.count(".") < 2
            else "a publishable key: it needs the SECRET one" if KEY.startswith("sb_publishable_")
            else "the anon key: it needs the service_role one" if '"role":"anon"' in _jwt_payload(KEY)
            else "not recognised by this Supabase project")
    return ("Supabase rejected SUPABASE_SERVICE_ROLE_KEY (%s, %d characters, starts %r). "
            "It looks like %s. In Supabase: Project Settings > API Keys > secret "
            "(or the Legacy tab > service_role). Paste it into the GitHub secret again."
            % (URL.split("//")[-1], len(KEY), KEY[:10], kind))


def _jwt_payload(key):
    try:
        import base64
        part = key.split(".")[1]
        return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)).decode().replace(" ", "")
    except Exception:
        return ""


def call(method, path, body=None, headers=None, raw=None):
    h = auth_headers(KEY)
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
        detail = e.read().decode()[:400]
        if e.code == 401 and "Invalid API key" in detail:
            raise SystemExit(explain_key_problem())
        raise RuntimeError("%s %s -> %d %s" % (method, path.split("?")[0], e.code, detail))


def in_retry_window(now=None):
    """True for the first run of every RETRY_EVERY_HOURS-hour block (UTC).

    Stateless backoff: a paper that has failed MAX_ATTEMPTS times is still
    retried, just only in these windows, so Alba never gives up on a paper.
    The schedule runs every 15 minutes, so each window catches one run.
    """
    t = time.gmtime(now if now is not None else time.time())
    return t.tm_hour % RETRY_EVERY_HOURS == 0 and t.tm_min < 15


def queue(limit=50):
    params = {
        "select": "id,user_id,title,authors,sections,terms,audio_path,updated_at,narration_attempts",
        "or": "(audio_path.is.null,needs_narration.is.true)",
        "order": "narration_attempts.asc,created_at.asc",
        "limit": str(limit),
    }
    if not in_retry_window():
        params["narration_attempts"] = "lt.%d" % MAX_ATTEMPTS
    return call("GET", "/rest/v1/papers?" + urllib.parse.urlencode(params)) or []


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
    new_failures = 0
    for p in todo:
        if time.time() - started > TIME_BUDGET:
            print("Time budget spent; the rest wait for the next run.")
            break
        print("Narrating: %s" % (p["title"] or p["id"]))
        try:
            narrate(p)
        except Exception as e:
            # Only a paper's first failure turns the run red (and emails you);
            # a paper already known to be failing just keeps being retried.
            if not p.get("narration_attempts"):
                new_failures += 1
            msg = str(e)[:500]
            print("  failed: " + msg)
            try:
                patch(p["id"], {"narration_error": msg,
                                "narration_attempts": (p.get("narration_attempts") or 0) + 1})
            except Exception as e2:
                print("  (could not record the failure: %s)" % e2)
    if new_failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
