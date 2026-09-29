"""voice.py's speakable() against the shared cases (see tests/paperText.test.mjs,
which checks the quick voice's JavaScript twin against the same file)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts", "narrate"))
from voice import speakable

bad = [c for c in json.load(open(os.path.join(HERE, "speakable_cases.json"), encoding="utf-8")) if speakable(c["in"]) != c["out"]]
for c in bad:
    print("  x %r\n    want %s\n    got  %s" % (c["in"], c["out"], speakable(c["in"])))
print("speakable (voice.py): %s" % ("%d failed" % len(bad) if bad else "all cases pass"))
sys.exit(1 if bad else 0)
