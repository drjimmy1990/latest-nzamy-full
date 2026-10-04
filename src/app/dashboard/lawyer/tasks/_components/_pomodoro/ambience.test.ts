import test from "node:test";
import assert from "node:assert/strict";
import {
  seededRandom, rms, renderNoise, COLORED_NOISE_RMS, nextGap, poissonTimes, planEvents, SCHEDULE_SLACK,
  addTransient, renderTransientLayer, BIRD_SYLLABLES, renderSyllable, planPhrase,
  swellShape, swellWave, rectifyCurve, CHANNEL_RECIPES,
} from "./ambience.ts";
import { NOISE_CONFIG } from "./types.ts";

const SR = 8000; // small rate keeps the tests fast; nothing below depends on it

function assertBounded(x: Float32Array, limit = 1) {
  for (let i = 0; i < x.length; i++) {
    assert.ok(Number.isFinite(x[i]), `sample ${i} is not finite`);
    assert.ok(Math.abs(x[i]) <= limit, `sample ${i} = ${x[i]} exceeds ${limit}`);
  }
}

function meanAbsStep(x: Float32Array) {
  let sum = 0;
  for (let i = 1; i < x.length; i++) sum += Math.abs(x[i] - x[i - 1]);
  return sum / (x.length - 1);
}

test("seededRandom: same seed → same stream, values in [0, 1)", () => {
  const a = seededRandom(42), b = seededRandom(42), c = seededRandom(43);
  const sa = Array.from({ length: 1000 }, a);
  assert.deepEqual(sa, Array.from({ length: 1000 }, b));
  assert.notDeepEqual(sa, Array.from({ length: 1000 }, c));
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

test("renderNoise: deterministic, bounded, right length, right loudness", () => {
  for (const color of ["white", "pink", "brown"] as const) {
    const x = renderNoise(color, SR, 3, seededRandom(1));
    assert.equal(x.length, 3 * SR);
    assertBounded(x);
    assert.deepEqual(x, renderNoise(color, SR, 3, seededRandom(1)));
    const target = color === "white" ? 1 / Math.sqrt(3) : COLORED_NOISE_RMS; // uniform [-1,1] → 1/√3
    assert.ok(Math.abs(rms(x) - target) < target * 0.1, `${color} rms ${rms(x)} vs ${target}`);
  }
});

test("renderNoise: brown is darker than pink is darker than white", () => {
  // Relative to its own RMS, a low-heavy signal moves less from sample to sample.
  const step = (c: "white" | "pink" | "brown") => {
    const x = renderNoise(c, SR, 3, seededRandom(2));
    return meanAbsStep(x) / rms(x);
  };
  assert.ok(step("brown") < step("pink"));
  assert.ok(step("pink") < step("white"));
});

test("renderNoise: pink/brown loop seam is an ordinary step, not a click", () => {
  for (const color of ["pink", "brown"] as const) {
    for (const seed of [3, 4, 5, 6]) {
      const x = renderNoise(color, SR, 2, seededRandom(seed));
      const seam = Math.abs(x[0] - x[x.length - 1]);
      assert.ok(seam < 5 * meanAbsStep(x), `${color}/${seed}: seam ${seam} vs typical ${meanAbsStep(x)}`);
    }
  }
});

test("nextGap / poissonTimes: positive gaps, sorted times in range, density near the rate", () => {
  const rand = seededRandom(7);
  for (let i = 0; i < 1000; i++) assert.ok(nextGap(10, rand, 0.2) >= 0.2);
  const times = poissonTimes(20, 500, seededRandom(8));
  assert.ok(times.every((t, i) => t >= 0 && t < 500 && (i === 0 || t > times[i - 1])));
  assert.ok(Math.abs(times.length - 20 * 500) < 20 * 500 * 0.05, `got ${times.length} events`);
});

test("planEvents: consecutive calls continue the stream without gaps or overlaps", () => {
  const rand = seededRandom(9);
  let cursor = 0;
  const all: number[] = [];
  for (let now = 0; now < 60; now += 0.25) {
    const plan = planEvents(cursor, now, 2, 0.5, 0.9, rand);
    for (const t of plan.times) assert.ok(t >= now && t < now + 2);
    all.push(...plan.times);
    cursor = plan.cursor;
  }
  for (let i = 1; i < all.length; i++) assert.ok(all[i] - all[i - 1] >= 0.9, "minGap respected across calls");
  assert.ok(all.length > 15 && all.length < 45, `~0.4/s over 60 s, got ${all.length}`);
});

test("planEvents: after a throttled timer it resumes from now — no burst of missed events", () => {
  const plan = planEvents(10, 300, 2, 5, 0.1, seededRandom(10)); // cursor 290 s behind
  assert.ok(plan.times.length > 0);
  assert.equal(plan.times[0], 300 + SCHEDULE_SLACK);
  assert.ok(plan.times.every(t => t >= 300));
  assert.ok(plan.times.length <= 2 / 0.1 + 1);
});

test("addTransient: an event near the end wraps into the start of the loop", () => {
  const buf = new Float32Array(SR);
  addTransient(buf, SR, "pop", buf.length - 5, 1, seededRandom(11));
  assert.ok(buf.subarray(0, 20).some(v => v !== 0), "tail written at the beginning");
  // a pop lasts at most 6 × 6 ms = 36 ms (288 samples here)
  assert.ok(buf.subarray(Math.ceil(0.036 * SR) + 1, buf.length - 5).every(v => v === 0), "nothing in the middle");
});

test("renderTransientLayer: bounded, audible, deterministic", () => {
  for (const name of ["rain", "heavy_rain", "fire"] as const) {
    const spec = CHANNEL_RECIPES[name].transients!;
    const x = renderTransientLayer(spec.events, SR, spec.layers[0], seededRandom(12));
    assert.equal(x.length, Math.round(spec.layers[0] * SR));
    assertBounded(x, 0.9999999);
    assert.ok(rms(x) > 0.001, `${name} layer is not silent`);
    assert.deepEqual(x, renderTransientLayer(spec.events, SR, spec.layers[0], seededRandom(12)));
  }
});

test("transient layers: lengths are not multiples of each other (combined loop never lines up soon)", () => {
  for (const recipe of Object.values(CHANNEL_RECIPES)) {
    if (!recipe.transients) continue;
    const [a, b] = recipe.transients.layers;
    const ratio = Math.max(a, b) / Math.min(a, b);
    assert.ok(Math.abs(ratio - Math.round(ratio)) > 0.1);
    assert.ok(Math.min(a, b) >= 5, "each loop is at least 5 s");
  }
});

test("renderSyllable: starts and ends silent (no clicks), peak 1", () => {
  for (const spec of BIRD_SYLLABLES) {
    const x = renderSyllable(spec, 44100);
    assert.equal(x.length, Math.round(spec.dur * 44100));
    assertBounded(x);
    assert.ok(Math.abs(x[0]) < 1e-3 && Math.abs(x[x.length - 1]) < 1e-3);
    assert.ok(Math.abs(Math.max(...x.map(Math.abs)) - 1) < 1e-6);
  }
});

test("planPhrase: notes never overlap, stay in range and follow the call's repeat count", () => {
  const rand = seededRandom(13);
  for (let i = 0; i < 500; i++) {
    const p = planPhrase(rand);
    const s = BIRD_SYLLABLES[p.variant];
    assert.ok(p.notes.length >= s.repeat[0] && p.notes.length <= s.repeat[1]);
    assert.ok(p.pan >= -1 && p.pan <= 1);
    p.notes.forEach((n, k) => {
      assert.ok(n.gain > 0 && n.gain <= 1);
      assert.ok(n.rate > 0.8 && n.rate < 1.2);
      if (k > 0) {
        const prev = p.notes[k - 1];
        assert.ok(n.offset - prev.offset >= s.dur / prev.rate, "previous syllable has finished");
      }
    });
  }
});

test("swellWave: asymmetric wave — slow build, crest at the rise point, browser-normalized range", () => {
  assert.equal(swellShape(0), 0);
  assert.ok(Math.abs(swellShape(0.62) - 1) < 1e-9);
  const w = swellWave();
  assert.equal(w.real[0], 0);
  assert.equal(w.imag[0], 0);
  assert.ok(Math.abs(w.max - 1) < 1e-9, "crest is the peak");
  assert.ok(w.min < 0 && w.min > -1);
  // Rebuild from the harmonics: the crest must sit near 62% of the cycle.
  let best = 0, bestP = 0;
  for (let n = 0; n < 1000; n++) {
    const p = n / 1000;
    let x = 0;
    for (let k = 1; k < w.real.length; k++) x += w.real[k] * Math.cos(2 * Math.PI * k * p) + w.imag[k] * Math.sin(2 * Math.PI * k * p);
    if (x > best) { best = x; bestP = p; }
  }
  assert.ok(Math.abs(bestP - 0.62) < 0.05, `crest at ${bestP}`);
});

test("rectifyCurve: silent on the negative half, monotonic, 1 at the top", () => {
  const c = rectifyCurve();
  assert.equal(c[0], 0);
  assert.equal(c[(c.length - 1) / 2], 0);
  assert.equal(c[c.length - 1], 1);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1]);
});

test("CHANNEL_RECIPES: every channel in the mixer has a recipe (ids unchanged)", () => {
  assert.deepEqual(Object.keys(CHANNEL_RECIPES).sort(), NOISE_CONFIG.map(c => c.key).sort());
});

test("CHANNEL_RECIPES: nature channels are never plain static noise", () => {
  for (const name of ["rain", "heavy_rain", "ocean", "wind", "fire", "birds"] as const) {
    const r = CHANNEL_RECIPES[name];
    const moves = r.beds.some(b => b.gainLfo || b.freqLfo || b.swell);
    assert.ok(moves || r.transients || r.birds, `${name} has motion or events`);
  }
});

test("CHANNEL_RECIPES: modulation can never drive a gain negative or a filter out of range", () => {
  const swellMin = swellWave().min; // most negative value the swell oscillator outputs
  for (const [name, r] of Object.entries(CHANNEL_RECIPES)) {
    for (const bed of r.beds) {
      const lfoGain = (bed.gainLfo ?? []).reduce((a, l) => a + l.depth, 0);
      const swellGain = bed.swell && !bed.swell.rectify ? bed.swell.gain * -swellMin : 0;
      assert.ok((bed.gainBase ?? 1) - lfoGain - swellGain >= 0, `${name}: gain floor`);

      const f = bed.filters[0];
      const lfoHz = (bed.freqLfo ?? []).reduce((a, l) => a + l.depth, 0);
      const swellHz = bed.swell?.hz ? bed.swell.hz * -swellMin : 0;
      assert.ok(f.hz - lfoHz - swellHz > 40, `${name}: filter floor`);
      assert.ok(f.hz + lfoHz + (bed.swell?.hz ?? 0) < 16000, `${name}: filter ceiling`);
      if (bed.swell) assert.ok(r.swell, `${name}: bed uses a swell the recipe defines`);
    }
    if (r.swell) assert.ok(r.swell.hz - r.swell.wobble.depth > 0, `${name}: swell rate stays positive`);
  }
});
