# Builds src/captions.json from the Whisper transcript (voice/transcript.json): the script's
# own wording (scripts/vo-lines.json) with each word's start time taken from the
# recording, so on-screen words appear exactly as they are spoken.
import json, os, re

root = os.path.join(os.path.dirname(__file__), "..")
lines = json.load(open(os.path.join(root, "scripts", "vo-lines.json"), encoding="utf-8"))
segs = json.load(open(os.path.join(root, "voice", "transcript.json"), encoding="utf-8"))
heard = [w for s in segs for w in s["words"]]

# Whisper split or merged a few words differently from the script; these fix the count.
# "ونطلع" was heard twice across a segment boundary; "لانتظار" is "لا انتظار".
fixed = []
for i, w in enumerate(heard):
    t = w["w"].strip()
    if t == "ونطلع" and fixed and fixed[-1]["w"].strip() == "ونطلع":
        continue
    if t == "لانتظار":
        mid = (w["s"] + w["e"]) / 2
        fixed += [{"w": "لا", "s": w["s"], "e": mid}, {"w": "انتظار", "s": mid, "e": w["e"]}]
        continue
    fixed.append(w)

out, k = [], 0
for text in lines:
    words = text.split()
    chunk = fixed[k : k + len(words)]
    if len(chunk) != len(words):
        raise SystemExit(f"ran out of heard words at: {text}")
    k += len(words)
    out.append({
        "text": text,
        "start": round(chunk[0]["s"], 2),
        "end": round(chunk[-1]["e"], 2),
        "words": [{"t": w, "s": round(c["s"], 2)} for w, c in zip(words, chunk)],
    })
if k != len(fixed):
    print("warning: unused heard words:", " ".join(w["w"] for w in fixed[k:]))
json.dump(out, open(os.path.join(root, "src", "captions.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for l in out:
    print(f'{l["start"]:6.2f}-{l["end"]:6.2f}  {l["text"]}')
