#!/usr/bin/env python3
"""Turn a paper walkthrough into one audio file plus sentence-level cues."""
import json, re, sys, wave, io, subprocess, os, tempfile

MODEL = os.environ.get("VOICE_MODEL", "/tmp/voices/en_GB-alba-medium.onnx")
GAP_SENT, GAP_PARA, GAP_HEAD = 0.28, 0.55, 0.65

GREEK = {"α":" alpha ","β":" beta ","γ":" gamma ","δ":" delta ","ε":" epsilon ",
         "ζ":" zeta ","κ":" kappa ","λ":" lambda ","σ":" sigma ","τ":" tau ",
         "χ":" chi ","ω":" omega ","μ":" micro","µ":" micro"}
SAYABLE = {"ELISA","FACS","CRISPR","SNP","PCR","RNA","DNA","PBS","FBS","NIH","MHC"}
ABBR = ["et al","Fig","Figs","fig","e.g","i.e","vs","cf","approx","ca","Dr","Prof",
        "No","vol","pp","Eq","Ref","etc","al","Suppl","Inc","Mr","Ms","Mrs","U.S"]

def split_sentences(text):
    """Must match nothing else — this is now the authoritative split."""
    t = text.strip()
    if not t:
        return []
    m = t
    for i, a in enumerate(ABBR):
        # Whole words only: a bare replace turned "fungal." and "real." into
        # "al." abbreviations and merged the next sentence into them.
        m = re.sub(r"(?<![A-Za-z])" + re.escape(a) + r"\.", a + "\x01%d\x01" % i, m)
    m = re.sub(r"(\d)\.(\d)", lambda x: x.group(1) + "\x02" + x.group(2), m)
    m = re.sub(r"\b([A-Z])\.(?=\s*[A-Z]\.)", lambda x: x.group(1) + "\x03", m)
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"\'“(])', m)
    if len(parts) == 1:
        parts = re.split(r"(?<=[.!?])\s+", m)
    out = []
    for s in parts:
        s = s.replace("\x02", ".").replace("\x03", ".")
        for i, a in enumerate(ABBR):
            s = s.replace(a + "\x01%d\x01" % i, a + ".")
        s = s.strip()
        if s:
            out.append(s)
    return out

def speakable(t):
    s = " " + t + " "
    for k, v in GREEK.items():
        s = s.replace(k, v)
    s = re.sub(r"\bmicro([LlgGmM])\b", r"micro\1", s)
    s = re.sub(r"°\s*C\b", " degrees Celsius", s)
    s = s.replace("°", " degrees ").replace("±", " plus or minus ")
    s = s.replace("×", " times ").replace("→", " leading to ")
    s = re.sub(r"[≈~]", " roughly ", s)
    s = s.replace("≤", " at most ").replace("≥", " at least ")
    s = re.sub(r"\s<\s", " less than ", s)
    s = re.sub(r"\s>\s", " greater than ", s)
    s = re.sub(r"\s=\s", " equals ", s).replace("%", " percent ")
    s = re.sub(r"\bet\s+al\.?", " and colleagues", s, flags=re.I)
    s = re.sub(r"\bvs\b\.?", " versus ", s, flags=re.I)
    s = re.sub(r"\be\.\s?g\.?", " for example", s, flags=re.I)
    s = re.sub(r"\bi\.\s?e\.?", " that is", s, flags=re.I)
    s = re.sub(r"\bFigs?\.?\s*(\d+)", r" figure \1", s, flags=re.I)
    s = re.sub(r"\bIL[-\s]?(\d+)", r" interleukin \1 ", s, flags=re.I)
    s = re.sub(r"\bIFN[-\s]?", " interferon ", s, flags=re.I)
    s = re.sub(r"\bTNF[-\s]?", " T N F ", s, flags=re.I)
    s = re.sub(r"\b(CD)\s?(\d+[a-z]?)\s*\+", r" C D \2 positive ", s, flags=re.I)
    s = re.sub(r"\b(CD)\s?(\d+[a-z]?)\s*[-−–]", r" C D \2 negative ", s, flags=re.I)
    s = re.sub(r"\b(CD)\s?(\d+[a-z]?)", r" C D \2 ", s, flags=re.I)
    s = re.sub(r"\b([A-Z]{2,6})\b",
               lambda m: m.group(1) if m.group(1) in SAYABLE else " ".join(m.group(1)), s)
    return re.sub(r"\s{2,}", " ", s).strip()

def say(text, tmpdir, n):
    out = os.path.join(tmpdir, "s%04d.wav" % n)
    p = subprocess.run(["python3", "-m", "piper", "--model", MODEL, "--output-file", out],
                       input=text.encode(), capture_output=True)
    if p.returncode != 0 or not os.path.exists(out):
        raise RuntimeError("piper failed: " + p.stderr.decode()[:400])
    return out

def read_wav(path):
    with wave.open(path, "rb") as w:
        return w.getparams(), w.readframes(w.getnframes())

def main(src, dest_audio, dest_json):
    paper = json.load(open(src))
    tmpdir = tempfile.mkdtemp()
    params = None
    frames = []
    cues = []
    t = 0.0
    n = 0

    def silence(sec):
        nonlocal t
        if params is None:
            return
        count = int(params.framerate * sec)
        frames.append(b"\x00" * (count * params.sampwidth * params.nchannels))
        t += sec

    for si, sec in enumerate(paper.get("sections", [])):
        head = (sec.get("heading") or "Section %d" % (si + 1)).strip()
        n += 1
        w = say(speakable(head) + ".", tmpdir, n)
        pr, data = read_wav(w)
        if params is None:
            params = pr
        cues.append({"s": si, "i": -1, "t": round(t, 3)})
        frames.append(data)
        t += len(data) / (pr.framerate * pr.sampwidth * pr.nchannels)
        silence(GAP_HEAD)

        lines = []
        para_sizes = []
        paras = [p.strip() for p in re.split(r"\n\s*\n", sec.get("body", "")) if p.strip()]
        for pi, para in enumerate(paras):
            sents = split_sentences(para)
            para_sizes.append(len(sents))
            for sent in sents:
                n += 1
                w = say(speakable(sent), tmpdir, n)
                pr, data = read_wav(w)
                cues.append({"s": si, "i": len(lines), "t": round(t, 3)})
                lines.append(sent)
                frames.append(data)
                t += len(data) / (pr.framerate * pr.sampwidth * pr.nchannels)
                silence(GAP_SENT)
            if pi < len(paras) - 1:
                silence(GAP_PARA - GAP_SENT)
        sec["lines"] = lines
        sec["paras"] = para_sizes   # lines per paragraph, so the app can lay them out

        fig = sec.get("figure")
        if fig and fig.get("caption"):
            n += 1
            w = say("Figure. " + speakable(fig["caption"]), tmpdir, n)
            pr, data = read_wav(w)
            cues.append({"s": si, "i": -2, "t": round(t, 3)})   # -2: the figure caption
            frames.append(data)
            t += len(data) / (pr.framerate * pr.sampwidth * pr.nchannels)
            silence(GAP_PARA)

    joined = os.path.join(tmpdir, "all.wav")
    with wave.open(joined, "wb") as w:
        w.setparams(params)
        w.writeframes(b"".join(frames))

    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", joined,
                    "-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart",
                    dest_audio], check=True)

    paper["cues"] = cues
    paper["dur"] = round(t, 2)
    json.dump(paper, open(dest_json, "w"), ensure_ascii=False)
    print("sentences:%d  duration:%.1fs  audio:%s (%.1f MB)"
          % (n, t, dest_audio, os.path.getsize(dest_audio) / 1e6))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
