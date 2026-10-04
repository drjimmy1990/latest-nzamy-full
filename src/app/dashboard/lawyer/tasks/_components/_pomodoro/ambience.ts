// ─── Pomodoro Pro — Natural ambience: the pure half ──────────────────────────
//
// Owner decision ق١٥٥: the noise mixer should sound like nature, not like
// plain white noise — and without shipping audio files (licensing + bundle
// size). Everything here is synthesized. This file holds the parts that need
// no browser: sample generation, event timing and the per-channel recipes.
// `useMultiNoise.ts` turns them into a Web Audio graph. Kept browser-free on
// purpose so `node --test` can load it (explicit `.ts` imports, erasable
// syntax only, no `window`/`AudioContext`).
//
// How a channel is put together (see `CHANNEL_RECIPES`):
//   - beds        looped noise (white/pink/brown) through filters; their gain
//                 and first filter's frequency can be moved by slow sine LFOs
//                 (wind gusts, fire flicker, rain intensity)
//   - swell       one shared slow, asymmetric oscillator (ocean waves): slow
//                 build, sharp crest, long retreat
//   - transients  droplets / crackles baked at random (Poisson) positions into
//                 two looped buffers of coprime-ish lengths, so the combined
//                 pattern never audibly repeats — and nothing needs a JS timer
//   - birds       short chirp phrases scheduled live (a baked bird phrase that
//                 repeats every few seconds would be noticed)

import type { NoiseChannel } from "./types.ts";

export type Rand = () => number;

/** Deterministic PRNG (mulberry32) — tests use it; the engine uses Math.random. */
export function seededRandom(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (range: readonly [number, number], rand: Rand) =>
  range[0] + (range[1] - range[0]) * rand();
const randInt = (range: readonly [number, number], rand: Rand) =>
  range[0] + Math.floor(rand() * (range[1] - range[0] + 1));

export function rms(x: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return x.length ? Math.sqrt(sum / x.length) : 0;
}

function normalizePeak(x: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak > 0) for (let i = 0; i < x.length; i++) x[i] /= peak;
  return x;
}

/** Coefficient for a one-pole lowpass at `hz`. */
const onePole = (hz: number, sampleRate: number) => 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);

// ─── Noise beds ───────────────────────────────────────────────────────────────

export type NoiseColor = "white" | "pink" | "brown";

/** Pink/brown are scaled to this RMS (peaks ≈ 4σ ≈ 1). White stays plain
 *  uniform [-1, 1] (RMS ≈ 0.577) — exactly what the old engine looped, so
 *  train / cafe / ac keep their old loudness. */
export const COLORED_NOISE_RMS = 0.25;
const SEAM_SECONDS = 0.05;
const WARMUP_SAMPLES = 4096;

/**
 * One loopable noise buffer. Pink (Paul Kellet's filter) and brown (leaky
 * integrator) are correlated sample-to-sample, so a hard loop point would
 * click every lap: their last `SEAM_SECONDS` are equal-power crossfaded into
 * the start, which makes sample[len-1] → sample[0] an ordinary step.
 */
export function renderNoise(color: NoiseColor, sampleRate: number, seconds: number, rand: Rand): Float32Array<ArrayBuffer> {
  const len = Math.round(seconds * sampleRate);
  if (color === "white") {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = rand() * 2 - 1;
    return out;
  }

  const fade = Math.min(len, Math.round(SEAM_SECONDS * sampleRate));
  const raw = new Float32Array(len + fade);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  const next = () => {
    const w = rand() * 2 - 1;
    if (color === "pink") {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      return b0 + b1 + b2 + w * 0.1848;
    }
    last = (last + 0.02 * w) / 1.02;
    return last;
  };
  for (let i = 0; i < WARMUP_SAMPLES; i++) next(); // let the filters settle
  for (let i = 0; i < raw.length; i++) raw[i] = next();

  const out = new Float32Array(len);
  out.set(raw.subarray(0, len));
  for (let i = 0; i < fade; i++) {
    const theta = (Math.PI / 2) * (i / fade);
    out[i] = raw[i] * Math.sin(theta) + raw[len + i] * Math.cos(theta);
  }
  const scale = COLORED_NOISE_RMS / (rms(out) || 1);
  for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i] * scale));
  return out;
}

// ─── Event timing ─────────────────────────────────────────────────────────────

/** Gap to the next event of a Poisson process (mean 1/rate), plus a floor. */
export function nextGap(rate: number, rand: Rand, minGap = 0): number {
  return minGap + -Math.log(1 - rand()) / rate;
}

/** Event times in [0, seconds), `rate` events per second on average. */
export function poissonTimes(rate: number, seconds: number, rand: Rand): number[] {
  const times: number[] = [];
  for (let t = nextGap(rate, rand); t < seconds; t += nextGap(rate, rand)) times.push(t);
  return times;
}

/** Live scheduling never lands in the past; after a stall it resumes here
 *  instead of firing everything it missed at once. */
export const SCHEDULE_SLACK = 0.05;

/**
 * Lookahead planning for a live event stream. `cursor` is the next event
 * time from the previous call; returns every event in [cursor, now+horizon)
 * and the new cursor. If the timer was throttled and `cursor` fell behind
 * `now`, it skips ahead (one event at `now + SCHEDULE_SLACK`, no burst).
 */
export function planEvents(
  cursor: number, now: number, horizon: number, rate: number, minGap: number, rand: Rand,
): { times: number[]; cursor: number } {
  const times: number[] = [];
  let t = Math.max(cursor, now + SCHEDULE_SLACK);
  while (t < now + horizon) {
    times.push(t);
    t += nextGap(rate, rand, minGap);
  }
  return { times, cursor: t };
}

// ─── Transients (baked into looped layers) ────────────────────────────────────

export type TransientKind = "tick" | "plink" | "crackle" | "pop";

export interface TransientSpec {
  kind:   TransientKind;
  rate:   number;                 // events per second, per layer
  gain:   [number, number];       // per-event peak range
  skew:   number;                 // gain = lo + (hi-lo)·u^skew → most events quiet
  burst?: [number, number];       // events per cluster (fire crackles come in bunches)
}

const BURST_SPREAD = 0.05; // seconds a cluster spreads over

/** A burst of noise decaying with time constant `tau`, band-limited by two
 *  one-pole filters. Peak-normalized to 1. */
function decayingNoise(
  sampleRate: number, tau: number, lowpassHz: number, highpassHz: number, rand: Rand,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.ceil(tau * 6 * sampleRate));
  const aLp = onePole(lowpassHz, sampleRate);
  const aHp = onePole(highpassHz, sampleRate);
  let lp = 0, slow = 0;
  for (let i = 0; i < out.length; i++) {
    const x = (rand() * 2 - 1) * Math.exp(-i / (tau * sampleRate));
    lp += (x - lp) * aLp;
    slow += (lp - slow) * aHp;
    out[i] = lp - slow; // lowpassed minus its slower self = band-pass
  }
  return normalizePeak(out);
}

/** A water drop into water: a decaying sine whose pitch rises (a bubble). */
function bubble(sampleRate: number, rand: Rand): Float32Array<ArrayBuffer> {
  const f0 = between([1400, 4000], rand);
  const tau = between([0.005, 0.017], rand);
  const rise = between([0.3, 1.1], rand);
  const length = tau * 5;
  const attack = 0.0006 * sampleRate;
  const out = new Float32Array(Math.ceil(length * sampleRate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    phase += (2 * Math.PI * f0 * (1 + (rise * t) / length)) / sampleRate;
    out[i] = Math.sin(phase) * Math.exp(-t / tau) * Math.min(1, i / attack);
  }
  return normalizePeak(out);
}

const TRANSIENT_SHAPES: Record<TransientKind, (sampleRate: number, rand: Rand) => Float32Array<ArrayBuffer>> = {
  // rain patter on leaves/ground: a 1–2 ms tick, bright but not harsh
  tick:    (sr, r) => decayingNoise(sr, between([0.0006, 0.0025], r), between([2500, 8000], r), 700, r),
  // a drop landing in a puddle
  plink:   bubble,
  // wood crackle: a sub-millisecond snap
  crackle: (sr, r) => decayingNoise(sr, between([0.0002, 0.0009], r), 9000, 1500, r),
  // a resin pocket popping: lower, thicker
  pop:     (sr, r) => decayingNoise(sr, between([0.002, 0.006], r), between([500, 1400], r), 80, r),
};

/** Adds one event at sample `at`, wrapping past the end (the buffer loops). */
export function addTransient(
  buf: Float32Array, sampleRate: number, kind: TransientKind, at: number, gain: number, rand: Rand,
): void {
  const shape = TRANSIENT_SHAPES[kind](sampleRate, rand);
  for (let i = 0; i < shape.length; i++) buf[(at + i) % buf.length] += shape[i] * gain;
}

/** One loopable layer of randomly placed events, soft-limited to |x| < 1. */
export function renderTransientLayer(
  events: readonly TransientSpec[], sampleRate: number, seconds: number, rand: Rand,
): Float32Array<ArrayBuffer> {
  const buf = new Float32Array(Math.round(seconds * sampleRate));
  for (const ev of events) {
    for (const t of poissonTimes(ev.rate, seconds, rand)) {
      const count = ev.burst ? randInt(ev.burst, rand) : 1;
      for (let k = 0; k < count; k++) {
        const at = t + (k === 0 ? 0 : rand() * BURST_SPREAD);
        const gain = ev.gain[0] + (ev.gain[1] - ev.gain[0]) * rand() ** ev.skew;
        addTransient(buf, sampleRate, ev.kind, Math.floor(at * sampleRate), gain, rand);
      }
    }
  }
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i]);
  return buf;
}

// ─── Birds (live phrases) ─────────────────────────────────────────────────────

export interface SyllableSpec {
  dur:      number;              // seconds at playbackRate 1
  hz:       number[];            // pitch path, evenly spaced over the syllable
  vibrato?: [number, number];    // [rate Hz, depth Hz]
  repeat:   [number, number];    // syllables per phrase
  gap:      [number, number];    // onset-to-onset, seconds
}

export const BIRD_SYLLABLES: readonly SyllableSpec[] = [
  { dur: 0.07, hz: [2600, 4300],       repeat: [2, 4], gap: [0.09, 0.14] }, // rising "tweet"
  { dur: 0.05, hz: [5200, 3100],       repeat: [3, 6], gap: [0.07, 0.11] }, // falling "tsip"
  { dur: 0.09, hz: [3000, 4600, 3300], repeat: [1, 3], gap: [0.14, 0.2]  }, // chevron
  { dur: 0.12, hz: [3700, 3900], vibrato: [42, 380], repeat: [1, 2], gap: [0.18, 0.26] }, // trill
  { dur: 0.18, hz: [2100, 2550],       repeat: [1, 2], gap: [0.3, 0.45]  }, // soft whistle
];

/** A sine following the pitch path under a Hann envelope (starts and ends
 *  at silence — no clicks), with a faint 2nd harmonic. Peak 1. */
export function renderSyllable(spec: SyllableSpec, sampleRate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(spec.dur * sampleRate));
  const segments = spec.hz.length - 1;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const u = i / (out.length - 1 || 1);
    const pos = Math.min(segments - 1e-9, u * segments);
    const seg = Math.floor(pos);
    let hz = spec.hz[seg] + (spec.hz[seg + 1] - spec.hz[seg]) * (pos - seg);
    if (spec.vibrato) hz += spec.vibrato[1] * Math.sin((2 * Math.PI * spec.vibrato[0] * i) / sampleRate);
    phase += (2 * Math.PI * hz) / sampleRate;
    out[i] = Math.sin(Math.PI * u) ** 2 * (Math.sin(phase) + 0.12 * Math.sin(2 * phase));
  }
  return normalizePeak(out);
}

export interface PhraseNote { offset: number; rate: number; gain: number }
export interface Phrase { variant: number; pan: number; notes: PhraseNote[] }

/** One bird's phrase: a single call type repeated a few times, at one pitch
 *  (± a little), from one place in the stereo field. */
export function planPhrase(rand: Rand, syllables: readonly SyllableSpec[] = BIRD_SYLLABLES): Phrase {
  const variant = Math.floor(rand() * syllables.length);
  const s = syllables[variant];
  const rate = between([0.88, 1.12], rand);
  const gain = between([0.4, 1], rand);
  const notes: PhraseNote[] = [];
  let offset = 0;
  for (let k = randInt(s.repeat, rand); k > 0; k--) {
    notes.push({ offset, rate: rate * between([0.975, 1.025], rand), gain: gain * between([0.8, 1], rand) });
    offset += between(s.gap, rand) / rate;
  }
  return { variant, pan: between([-0.7, 0.7], rand), notes };
}

// ─── Ocean swell ──────────────────────────────────────────────────────────────

/** Fraction of the cycle spent building up; the rest is crash + retreat. */
const SWELL_RISE = 0.62;
const SWELL_FALL_TAU = 0.11;
const SWELL_HARMONICS = 12;

/** One wave over phase p ∈ [0,1): smooth build to the crest, then a fast
 *  drop with a long tail. */
export function swellShape(p: number): number {
  return p < SWELL_RISE
    ? (1 - Math.cos((Math.PI * p) / SWELL_RISE)) / 2
    : Math.exp(-(p - SWELL_RISE) / SWELL_FALL_TAU);
}

/**
 * Fourier coefficients of `swellShape` for `createPeriodicWave`, plus the
 * range the oscillator will actually output: the browser drops the DC term
 * and normalizes the peak to 1, so [min, max] is what recipes must budget
 * for (see `swell` in `BedSpec`).
 */
export function swellWave(harmonics = SWELL_HARMONICS): { real: number[]; imag: number[]; min: number; max: number } {
  const N = 1024;
  const real = new Array<number>(harmonics + 1).fill(0);
  const imag = new Array<number>(harmonics + 1).fill(0);
  for (let k = 1; k <= harmonics; k++) {
    for (let n = 0; n < N; n++) {
      const s = swellShape(n / N);
      real[k] += (2 / N) * s * Math.cos((2 * Math.PI * k * n) / N);
      imag[k] += (2 / N) * s * Math.sin((2 * Math.PI * k * n) / N);
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (let n = 0; n < N; n++) {
    let x = 0;
    for (let k = 1; k <= harmonics; k++) {
      x += real[k] * Math.cos((2 * Math.PI * k * n) / N) + imag[k] * Math.sin((2 * Math.PI * k * n) / N);
    }
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  const peak = Math.max(Math.abs(lo), Math.abs(hi));
  return { real, imag, min: lo / peak, max: hi / peak };
}

/** WaveShaper curve: negative half → 0, positive half squared. Lets the foam
 *  layer follow only the crest of the swell. */
export function rectifyCurve(points = 257): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = x > 0 ? x * x : 0;
  }
  return curve;
}

// ─── Channel recipes ──────────────────────────────────────────────────────────

export interface FilterSpec {
  type:    "lowpass" | "highpass" | "bandpass" | "peaking";
  hz:      number;
  q?:      number;   // Web Audio semantics (dB for lowpass/highpass)
  gainDb?: number;   // peaking only
}

export interface LfoSpec { hz: number; depth: number }

export interface BedSpec {
  color:     NoiseColor;
  level:     number;           // trim after filters
  filters:   FilterSpec[];
  gainBase?: number;           // motion gain around which LFOs move (default 1)
  gainLfo?:  LfoSpec[];        // gusts / flicker / intensity
  freqLfo?:  LfoSpec[];        // moves filters[0].frequency (wind)
  swell?:    { gain: number; hz?: number; rectify?: boolean }; // driven by the recipe's swell
}

export interface ChannelRecipe {
  beds:        BedSpec[];
  swell?:      { hz: number; wobble: LfoSpec };   // wobble moves the swell rate → irregular waves
  transients?: { layers: [number, number]; level: number; events: TransientSpec[] };
  birds?:      { phraseRate: number; minGap: number; level: number };
}

// Levels were calibrated offline (a Web Audio biquad simulation with a rough
// A-weighting): at the same slider position rain / heavy rain / ocean / wind
// sit within ~3 dB of each other, 2–5 dB under the old white-noise rain
// (which was the loudest channel). Fire and birds are quieter in RMS on
// purpose — crackles and chirps carry them. Confirm by ear.
export const CHANNEL_RECIPES: Record<NoiseChannel, ChannelRecipe> = {
  rain: {
    beds: [{
      color: "pink", level: 1.1,
      filters: [{ type: "highpass", hz: 450 }, { type: "lowpass", hz: 5500 }],
      gainBase: 0.9, gainLfo: [{ hz: 0.05, depth: 0.08 }],
    }],
    transients: { layers: [5.3, 7.9], level: 1.25, events: [
      { kind: "tick",  rate: 50,  gain: [0.1, 1],    skew: 2.2 },
      { kind: "plink", rate: 0.8, gain: [0.15, 0.7], skew: 1.5 },
    ] },
  },
  heavy_rain: {
    beds: [
      { color: "white", level: 0.62,
        filters: [{ type: "lowpass", hz: 7000 }, { type: "highpass", hz: 180 }],
        gainBase: 0.85, gainLfo: [{ hz: 0.05, depth: 0.09 }, { hz: 0.031, depth: 0.06 }] },
      { color: "brown", level: 0.56, filters: [{ type: "lowpass", hz: 260 }] }, // drumming on roofs
    ],
    transients: { layers: [5.3, 7.9], level: 1.13, events: [
      { kind: "tick",  rate: 110, gain: [0.08, 1],   skew: 2 },
      { kind: "plink", rate: 2,   gain: [0.12, 0.6], skew: 1.5 },
    ] },
  },
  ocean: {
    swell: { hz: 0.085, wobble: { hz: 0.013, depth: 0.02 } }, // a wave every ~9.5–15 s
    beds: [
      { color: "pink", level: 1.1, filters: [{ type: "lowpass", hz: 750 }],
        gainBase: 0.6, gainLfo: [{ hz: 0.031, depth: 0.1 }], swell: { gain: 0.4, hz: 550 } },
      { color: "pink", level: 3.5, filters: [{ type: "bandpass", hz: 2400, q: 0.45 }],
        gainBase: 0, swell: { gain: 1, rectify: true } }, // foam on the crest
    ],
  },
  wind: {
    beds: [
      { color: "pink", level: 2.9, filters: [{ type: "bandpass", hz: 480, q: 0.7 }],
        gainBase: 0.62,
        gainLfo: [{ hz: 0.083, depth: 0.22 }, { hz: 0.047, depth: 0.15 }, { hz: 0.19, depth: 0.05 }],
        freqLfo: [{ hz: 0.11, depth: 170 }, { hz: 0.067, depth: 110 }, { hz: 0.029, depth: 70 }] },
      { color: "white", level: 1.6, filters: [{ type: "bandpass", hz: 1150, q: 9 }], // whistle
        gainBase: 0.5,
        gainLfo: [{ hz: 0.071, depth: 0.32 }, { hz: 0.043, depth: 0.18 }],
        freqLfo: [{ hz: 0.053, depth: 260 }, { hz: 0.089, depth: 130 }] },
    ],
  },
  fire: {
    beds: [
      { color: "brown", level: 0.7, filters: [{ type: "lowpass", hz: 380 }],
        gainBase: 0.75, gainLfo: [{ hz: 0.31, depth: 0.12 }, { hz: 0.87, depth: 0.08 }, { hz: 1.73, depth: 0.05 }] },
      { color: "pink", level: 0.6, filters: [{ type: "bandpass", hz: 3000, q: 0.7 }],
        gainBase: 0.6, gainLfo: [{ hz: 0.23, depth: 0.25 }, { hz: 0.61, depth: 0.15 }] },
    ],
    transients: { layers: [9.7, 14.3], level: 1.9, events: [
      { kind: "crackle", rate: 3.2,  gain: [0.08, 0.9], skew: 2.6, burst: [1, 5] },
      { kind: "pop",     rate: 0.25, gain: [0.25, 0.7], skew: 1.5 },
    ] },
  },
  birds: {
    beds: [{
      color: "pink", level: 0.7,
      filters: [{ type: "highpass", hz: 250 }, { type: "lowpass", hz: 2200 }], // breeze in leaves
      gainBase: 0.65, gainLfo: [{ hz: 0.13, depth: 0.2 }, { hz: 0.071, depth: 0.15 }],
    }],
    birds: { phraseRate: 0.32, minGap: 0.9, level: 0.5 },
  },
  // Not nature — unchanged from the old engine (same filters, same loudness);
  // only the train's rhythm now moves its own gain instead of the volume.
  train: { beds: [{ color: "white", level: 1, filters: [{ type: "lowpass", hz: 300 }],
    gainBase: 1, gainLfo: [{ hz: 2.5, depth: 0.43 }] }] },
  cafe:  { beds: [{ color: "white", level: 1,
    filters: [{ type: "lowpass", hz: 2000, q: 0.8 }, { type: "peaking", hz: 400, gainDb: 4 }] }] },
  ac:    { beds: [{ color: "white", level: 1, filters: [{ type: "bandpass", hz: 120, q: 0.3 }] }] },
};
