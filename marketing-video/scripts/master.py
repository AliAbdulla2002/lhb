# Masters the rendered reel's audio for phone speakers: a gentle compressor and a soft
# limiter lift the level to about -15 dB RMS (close to what Instagram and TikTok play
# at), then the audio is put back on the untouched video. Usage: python scripts/master.py
import os, subprocess, wave
import numpy as np

root = os.path.join(os.path.dirname(__file__), "..")
src = os.path.join(root, "out", "lahab-reel.mp4")
raw = os.path.join(root, "out", "mix-raw.wav")
mastered = os.path.join(root, "out", "mix-master.wav")
final = os.path.join(root, "out", "lahab-reel-final.mp4")
npx = "npx.cmd" if os.name == "nt" else "npx"
ff = [npx, "remotion", "ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]

subprocess.run(ff + ["-i", src, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", raw], check=True)
with wave.open(raw) as w:
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, 2).astype(float) / 32768

# Envelope follower (5 ms attack, 120 ms release) driving a 3:1 compressor above -24 dB.
level = np.abs(a).max(axis=1)
att, rel = np.exp(-1 / (0.005 * sr)), np.exp(-1 / (0.12 * sr))
env = np.empty_like(level)
e = 0.0
for i, x in enumerate(level):
    e = att * e + (1 - att) * x if x > e else rel * e + (1 - rel) * x
    env[i] = e
db = 20 * np.log10(env + 1e-9)
over = np.maximum(db - (-24), 0)
gain_db = -over * (1 - 1 / 3)
a *= (10 ** (gain_db / 20))[:, None]

# Make-up gain towards -15 dB RMS, then a soft limiter keeps peaks under -1 dBFS.
rms = np.sqrt(np.mean(a**2))
a *= 10 ** (-15 / 20) / rms
ceiling = 10 ** (-1 / 20)
a = np.tanh(a / ceiling) * ceiling
print("rms dB", round(20 * np.log10(np.sqrt(np.mean(a**2))), 1), "peak dB", round(20 * np.log10(np.abs(a).max()), 1))

with wave.open(mastered, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((a * 32767).astype("<i2").tobytes())
subprocess.run(ff + ["-i", src, "-i", mastered, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final], check=True)
for f in (raw, mastered):
    os.remove(f)
print("wrote", os.path.relpath(final, root))
