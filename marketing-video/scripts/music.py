# Writes public/music.wav: an original bed made from synthesised sounds (no samples, no
# licensing). A maqsum darbuka groove, a low drone, an oud-like pluck melody in Hijaz, a
# whoosh on every cut, a car horn when "I'm here" is tapped, and a hit on the final card.
import json, os, wave
import numpy as np

root = os.path.join(os.path.dirname(__file__), "..")
tl = json.load(open(os.path.join(root, "src", "timeline.json")))
fps, scenes = tl["fps"], tl["scenes"]
starts = np.cumsum([0] + scenes[:-1]) / fps
total = sum(scenes) / fps
SR = 44100
n = int(total * SR) + SR
out = np.zeros((n, 2))
rng = np.random.default_rng(7)

def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= n:
        return
    sig = sig[: n - i]
    out[i : i + len(sig), 0] += sig * gain * (1 - max(pan, 0))
    out[i : i + len(sig), 1] += sig * gain * (1 + min(pan, 0))

def env(length, decay):
    t = np.arange(int(length * SR)) / SR
    return np.exp(-t / decay), t

def doum():
    e, t = env(0.45, 0.12)
    f = 70 + 60 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e

def tek():
    e, t = env(0.12, 0.025)
    noise = rng.standard_normal(len(t))
    noise = noise - np.convolve(noise, np.ones(4) / 4, "same")  # crude high-pass
    return (0.6 * noise + 0.5 * np.sin(2 * np.pi * 1100 * t)) * e

def pluck(freq, length=0.9):
    # Karplus-Strong string.
    period = int(SR / freq)
    buf = rng.uniform(-1, 1, period)
    res = np.empty(int(length * SR))
    for i in range(len(res)):
        res[i] = buf[i % period]
        buf[i % period] = 0.497 * (buf[i % period] + buf[(i + 1) % period])
    return res * np.exp(-np.arange(len(res)) / SR / 0.5)

def whoosh(length=0.55):
    t = np.arange(int(length * SR)) / SR
    noise = rng.standard_normal(len(t))
    k = 30
    smooth = np.convolve(noise, np.ones(k) / k, "same")
    shape = np.sin(np.pi * t / length) ** 2
    return (smooth * 3 + noise * 0.15) * shape

def horn():
    t = np.arange(int(0.22 * SR)) / SR
    sq = np.sign(np.sin(2 * np.pi * 415 * t)) + 0.8 * np.sign(np.sin(2 * np.pi * 520 * t))
    sq = np.convolve(sq, np.ones(12) / 12, "same")
    return sq * np.minimum(1, (0.22 - t) * 40) * np.minimum(1, t * 200)

def hit():
    e, t = env(1.6, 0.45)
    f = 55 + 80 * np.exp(-t / 0.05)
    return np.tanh(2.5 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * e

bpm = 100
eighth = 60 / bpm / 2
# Maqsum: D T . T D . T .
pattern = ["D", "T", None, "T", "D", None, "T", None]
end_groove = total - 0.3
t, k = 0.25, 0
while t < end_groove:
    s = pattern[k % 8]
    fade = min(1, t / 2.0)  # the groove builds in over the hook
    if s == "D":
        add(doum(), t, 0.55 * fade)
    elif s == "T":
        add(tek(), t, 0.22 * fade, pan=0.25)
    if k % 2 == 1 and t > 4:
        add(tek(), t + eighth / 2, 0.07, pan=-0.3)  # ghost notes once the hook is over
    t += eighth
    k += 1

# Hijaz on D: D Eb F# G A Bb C D
hijaz = [146.8, 155.6, 185.0, 196.0, 220.0, 233.1, 261.6, 293.7]
phrase = [0, 2, 3, 4, 3, 2, 1, 0, 4, 5, 4, 3, 2, 3, 2, 0]
t, i = 1.2, 0
while t < end_groove - 1:
    if i % 16 not in (7, 15):
        add(pluck(hijaz[phrase[i % 16]] * (2 if i % 32 >= 16 else 1)), t, 0.16, pan=-0.15)
    t += eighth * 2
    i += 1

# Drone: D an octave down, slowly breathing.
tt = np.arange(int(end_groove * SR)) / SR
drone = (np.sin(2 * np.pi * 73.4 * tt) + 0.4 * np.sin(2 * np.pi * 110.1 * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * tt / 6))
drone *= np.minimum(1, tt / 3) * np.minimum(1, (end_groove - tt) / 1.5)
add(drone, 0, 0.07)

for s in starts[1:]:
    add(whoosh(), s - 0.3, 0.18)
horn_scene, horn_frame = tl["hornAt"]
add(horn(), starts[horn_scene] + horn_frame / fps, 0.12)
add(horn(), starts[horn_scene] + horn_frame / fps + 0.28, 0.12)
add(hit(), starts[-1] + 0.1, 0.5)

# Fade out and normalise to a -3 dBFS peak; the video lowers it under the voice.
fade = int(2.0 * SR)
end = int(total * SR)
out[end - fade : end] *= np.linspace(1, 0, fade)[:, None]
out[end:] = 0
out = out[:end]
out *= 10 ** (-3 / 20) / np.max(np.abs(out))
with wave.open(os.path.join(root, "public", "music.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("music", round(total, 2), "s")
