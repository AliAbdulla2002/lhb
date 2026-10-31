# Cleans and polishes the owner's phone recording (voice/raw.wav, 48 kHz mono) into
# public/vo/voice.wav for the reel. Numpy only:
#   1. spectral noise reduction, using the quietest moments as the noise profile
#   2. EQ: cut rumble and boxiness, add warmth and presence ("radio" voice)
#   3. a soft gate that lowers breaths and room noise between words
#   4. compression and a peak limiter for an even, loud level
import os, wave
import numpy as np

root = os.path.join(os.path.dirname(__file__), "..")
src = os.path.join(root, "voice", "raw.wav")
dst = os.path.join(root, "public", "vo", "voice.wav")

with wave.open(src) as w:
    sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768

N, H = 2048, 512
win = np.hanning(N)
pad = np.concatenate([np.zeros(N), x, np.zeros(N)])
frames = np.lib.stride_tricks.sliding_window_view(pad, N)[::H] * win
S = np.fft.rfft(frames, axis=1)
mag = np.abs(S)
freqs = np.fft.rfftfreq(N, 1 / sr)

# 1. Noise profile: the average spectrum of the quietest 8% of frames.
# Skip the zero padding at both ends, which would make the profile silent.
inner = np.arange(len(mag))
inner = (inner * H >= N) & (inner * H + N <= N + len(x))
energy = (mag**2).sum(axis=1)
quiet = inner & (energy <= np.percentile(energy[inner], 8))
noise = mag[quiet].mean(axis=0)
# Wiener-style gain with over-subtraction, smoothed over time to avoid "musical" noise.
snr = np.maximum(mag**2 / (noise**2 * 2.0 + 1e-12) - 1, 0)
gain = snr / (snr + 1)
gain = np.maximum(gain, 0.08)  # keep a little floor so the voice doesn't sound underwater
k = 3
gain = np.apply_along_axis(lambda g: np.convolve(g, np.ones(k) / k, "same"), 0, gain)

# 2. EQ curve in dB, applied in the same pass.
def bell(f0, db, q):
    return db / (1 + ((freqs - f0) / (f0 / q)) ** 2)
eq_db = (
    np.where(freqs < 70, -24, 0) * np.clip((70 - freqs) / 30, 0, 1)  # rumble
    + bell(140, 2.5, 1.0)  # warmth / chest
    + bell(380, -3.0, 1.4)  # boxiness of a small room
    + bell(3200, 3.5, 1.2)  # presence / clarity
    + np.where(freqs > 9000, 2.0, 0) * np.clip((freqs - 9000) / 3000, 0, 1)  # air
    + bell(6800, -2.5, 3.0)  # tame harsh "s"
)
S *= gain * 10 ** (eq_db / 20)

y = np.zeros(len(pad))
norm = np.zeros(len(pad))
out_frames = np.fft.irfft(S, n=N, axis=1) * win
for i, f in enumerate(out_frames):
    y[i * H : i * H + N] += f
    norm[i * H : i * H + N] += win**2
y = (y / np.maximum(norm, 1e-8))[N : N + len(x)]

# 3 + 4. Envelope follower drives a 2.5:1 compressor (above -20 dB) and a soft gate.
lvl = np.abs(y)
att, rel = np.exp(-1 / (0.004 * sr)), np.exp(-1 / (0.15 * sr))
env = np.empty_like(lvl)
e = 0.0
for i, v in enumerate(lvl):
    e = att * e + (1 - att) * v if v > e else rel * e + (1 - rel) * v
    env[i] = e
db = 20 * np.log10(env + 1e-9)
y *= 10 ** (-np.maximum(db + 20, 0) * (1 - 1 / 2.5) / 20)

# Make-up gain to -16 dB RMS on speech, then the gate works on the final level: anything
# more than 24 dB under the speech (breaths, room tone) is pulled down by up to 18 dB.
speech = db > -40
makeup = 10 ** (-16 / 20) / np.sqrt(np.mean(y[speech] ** 2))
y *= makeup
final_db = db + 20 * np.log10(makeup)
y *= 10 ** (np.where(final_db < -40, -18 * np.clip((-40 - final_db) / 8, 0, 1), 0.0) / 20)
ceil = 10 ** (-1 / 20)
y = np.tanh(y / ceil) * ceil

def stats(a):
    h = int(0.05 * sr)
    r = np.array([np.sqrt(np.mean(a[i : i + h] ** 2)) for i in range(0, len(a) - h, h)])
    d = 20 * np.log10(r + 1e-9)
    return round(np.percentile(d, 8), 1), round(np.percentile(d, 90), 1)

print("before: noise %s dB, speech %s dB" % stats(x))
print("after:  noise %s dB, speech %s dB" % stats(y))
os.makedirs(os.path.dirname(dst), exist_ok=True)
with wave.open(dst, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((y * 32767).astype("<i2").tobytes())
print("wrote", os.path.relpath(dst, root), round(len(y) / sr, 2), "s")
