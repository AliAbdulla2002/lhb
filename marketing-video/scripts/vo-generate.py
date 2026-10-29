# Generates public/vo/N.mp3 from scripts/vo-lines.json with edge-tts, then prints each
# line's length so src/timeline.json (scenes, voDur) can be kept in step.
# Usage: python scripts/vo-generate.py [path-to-edge-tts] [voice]
import json, os, subprocess, sys

root = os.path.join(os.path.dirname(__file__), "..")
tts = sys.argv[1] if len(sys.argv) > 1 else "edge-tts"
voice = sys.argv[2] if len(sys.argv) > 2 else "ar-KW-FahedNeural"
lines = json.load(open(os.path.join(root, "scripts", "vo-lines.json"), encoding="utf-8"))
npx = "npx.cmd" if os.name == "nt" else "npx"
for i, text in enumerate(lines, 1):
    mp3 = os.path.join(root, "public", "vo", f"{i}.mp3")
    subprocess.run([tts, "--voice", voice, "--rate=+4%", "--text", text, "--write-media", mp3], check=True)
    dur = subprocess.run([npx, "remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True, check=True).stdout.strip()
    print(i, round(float(dur), 2))
