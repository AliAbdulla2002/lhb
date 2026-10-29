# Decodes each voice-over mp3 to WAV and lifts it to a -1 dBFS peak, so the voice stays
# clear over the music on phone speakers.
import glob, os, subprocess, wave
import numpy as np

root = os.path.join(os.path.dirname(__file__), "..")
for mp3 in sorted(glob.glob(os.path.join(root, "public", "vo", "*.mp3"))):
    tmp = mp3[:-4] + ".raw.wav"
    subprocess.run(["npx.cmd" if os.name == "nt" else "npx", "remotion", "ffmpeg", "-loglevel", "error", "-y", "-i", mp3, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", tmp], check=True)
    with wave.open(tmp) as r:
        a = np.frombuffer(r.readframes(r.getnframes()), "<i2").astype(float) / 32768
    os.remove(tmp)
    a *= 10 ** (-1 / 20) / np.abs(a).max()
    with wave.open(mp3[:-4] + ".wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes((a * 32767).astype("<i2").tobytes())
    print(os.path.basename(mp3), "->", round(len(a) / 44100, 2), "s")
