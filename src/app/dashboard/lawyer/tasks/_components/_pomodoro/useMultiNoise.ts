"use client";
// ─── Pomodoro Pro — Multi-Channel Audio Engine ───────────────────────────────
//
// Builds each channel's Web Audio graph from its recipe in `./ambience.ts`
// (which also explains the sound design). Per channel:
//
//   beds ─ filters ─ motion gain (LFOs / swell) ─ trim ─┐
//   transient loops ─ trim ─ stereo pan ───────────────┼─ bus (volume) ─ master
//   bird phrases (one-shots) ─ gain ─ stereo pan ──────┘
//
// The bus gain is the only thing the volume slider touches; all movement
// lives on the inner gains, so a slider change never fights an LFO.
//
// Cleanup: every looping source and LFO oscillator is listed in
// `sources`, every pending bird note in `oneShots`, and the only JS timer
// (birds) in `timer`. `disposeChannel` stops all three — on channel off (with
// a short fade) and on all-off / unmount (then the context is closed too).

import { useRef, useCallback, useEffect } from "react";
import type { ActiveNoise, NoiseChannel } from "./types";
import {
  CHANNEL_RECIPES, BIRD_SYLLABLES,
  renderNoise, renderTransientLayer, renderSyllable,
  planEvents, planPhrase, swellWave, rectifyCurve,
  type ChannelRecipe, type LfoSpec, type NoiseColor,
} from "./ambience";

const VOLUME_SCALE  = 0.5;  // slider 0–1 → bus gain (unchanged from the old engine)
const FADE_IN       = 0.15; // s, time constant when a channel starts
const VOLUME_GLIDE  = 0.05; // s, time constant for slider moves
const FADE_OUT      = 0.25; // s, when a single channel is switched off
const NOISE_SECONDS = 6;
const LAYER_PAN     = 0.45; // the two transient loops sit left/right of centre
const BIRD_TICK_MS  = 250;
const BIRD_HORIZON  = 2;    // s — outlasts the 1 s timer clamp of hidden tabs

// ─── Rendered audio cache ─────────────────────────────────────────────────────
// Rendering is pure (see ambience.ts) and an AudioBuffer may be shared by any
// number of contexts, so each buffer is made once per page per sample rate
// and reused across stop/start and tab switches. Bounded: ~10 MB with every
// channel used, nothing for channels never played.

const buffers = new Map<string, AudioBuffer>();

function cachedBuffer(ctx: BaseAudioContext, key: string, render: () => Float32Array<ArrayBuffer>): AudioBuffer {
  const id = `${key}@${ctx.sampleRate}`;
  let buf = buffers.get(id);
  if (!buf) {
    const data = render();
    buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.getChannelData(0).set(data);
    buffers.set(id, buf);
  }
  return buf;
}

const noiseBuffer = (ctx: BaseAudioContext, color: NoiseColor) =>
  cachedBuffer(ctx, `noise/${color}`, () => renderNoise(color, ctx.sampleRate, NOISE_SECONDS, Math.random));

/** Stereo placement; plain pass-through where StereoPannerNode is missing. */
function panner(ctx: BaseAudioContext, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner !== "function") return ctx.createGain();
  const node = ctx.createStereoPanner();
  node.pan.value = pan;
  return node;
}

/** Catches peaks when several channels at full volume sum past 0 dBFS. The
 *  0.8 pre-gain offsets the compressor's built-in make-up gain (~+2 dB). */
function createMaster(ctx: AudioContext): AudioNode {
  const pre = ctx.createGain();
  pre.gain.value = 0.8;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  pre.connect(limiter).connect(ctx.destination);
  return pre;
}

// ─── Per-channel graph ────────────────────────────────────────────────────────

interface ChannelGraph {
  bus:      GainNode;
  sources:  AudioScheduledSourceNode[];    // loops + LFOs: run until disposed
  oneShots: Set<AudioBufferSourceNode>;    // bird notes not yet finished
  timer:    ReturnType<typeof setInterval> | null;
}

function buildChannel(ctx: AudioContext, out: AudioNode, channel: NoiseChannel): ChannelGraph {
  const recipe = CHANNEL_RECIPES[channel];
  const bus = ctx.createGain();
  bus.gain.value = 0; // apply() fades it in
  bus.connect(out);
  const g: ChannelGraph = { bus, sources: [], oneShots: new Set(), timer: null };
  const t0 = ctx.currentTime;

  const modulate = (param: AudioParam, lfos: readonly LfoSpec[] = []) => {
    for (const { hz, depth } of lfos) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      osc.connect(amount).connect(param);
      osc.start(t0);
      g.sources.push(osc);
    }
  };

  let swell: OscillatorNode | null = null;
  if (recipe.swell) {
    const wave = swellWave();
    swell = ctx.createOscillator();
    swell.setPeriodicWave(ctx.createPeriodicWave(wave.real, wave.imag));
    swell.frequency.value = recipe.swell.hz;
    modulate(swell.frequency, [recipe.swell.wobble]);
    swell.start(t0);
    g.sources.push(swell);
  }

  for (const bed of recipe.beds) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, bed.color);
    src.loop = true;
    const filters = bed.filters.map(spec => {
      const f = ctx.createBiquadFilter();
      f.type = spec.type;
      f.frequency.value = spec.hz;
      if (spec.q !== undefined) f.Q.value = spec.q;
      if (spec.gainDb !== undefined) f.gain.value = spec.gainDb;
      return f;
    });
    const motion = ctx.createGain();
    motion.gain.value = bed.gainBase ?? 1;
    const trim = ctx.createGain();
    trim.gain.value = bed.level;
    let chain: AudioNode = src;
    for (const node of [...filters, motion, trim, bus]) chain = chain.connect(node);

    modulate(motion.gain, bed.gainLfo);
    if (filters[0]) modulate(filters[0].frequency, bed.freqLfo);
    if (swell && bed.swell) {
      let drive: AudioNode = swell;
      if (bed.swell.rectify) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = rectifyCurve();
        drive = swell.connect(shaper);
      }
      const depth = ctx.createGain();
      depth.gain.value = bed.swell.gain;
      drive.connect(depth).connect(motion.gain);
      if (bed.swell.hz && filters[0]) {
        const sweep = ctx.createGain();
        sweep.gain.value = bed.swell.hz;
        swell.connect(sweep).connect(filters[0].frequency);
      }
    }
    src.start(t0, Math.random() * NOISE_SECONDS); // channels sharing a buffer start apart
    g.sources.push(src);
  }

  if (recipe.transients) {
    const { layers, level, events } = recipe.transients;
    layers.forEach((seconds, i) => {
      const src = ctx.createBufferSource();
      src.buffer = cachedBuffer(ctx, `${channel}/${i}`, () => renderTransientLayer(events, ctx.sampleRate, seconds, Math.random));
      src.loop = true;
      const trim = ctx.createGain();
      trim.gain.value = level;
      src.connect(trim).connect(panner(ctx, i === 0 ? -LAYER_PAN : LAYER_PAN)).connect(bus);
      src.start(t0, Math.random() * seconds);
      g.sources.push(src);
    });
  }

  if (recipe.birds) startBirds(ctx, g, recipe.birds);
  return g;
}

/** Live bird phrases: a lookahead scheduler on one interval, owned by `g`. */
function startBirds(ctx: AudioContext, g: ChannelGraph, spec: NonNullable<ChannelRecipe["birds"]>) {
  const calls = BIRD_SYLLABLES.map((s, i) => cachedBuffer(ctx, `bird/${i}`, () => renderSyllable(s, ctx.sampleRate)));
  let cursor = ctx.currentTime + 0.5 + Math.random() * 1.5;

  const tick = () => {
    const plan = planEvents(cursor, ctx.currentTime, BIRD_HORIZON, spec.phraseRate, spec.minGap, Math.random);
    cursor = plan.cursor;
    for (const at of plan.times) {
      const phrase = planPhrase(Math.random);
      for (const note of phrase.notes) {
        const src = ctx.createBufferSource();
        src.buffer = calls[phrase.variant];
        src.playbackRate.value = note.rate;
        const gain = ctx.createGain();
        gain.gain.value = note.gain * spec.level;
        const pan = panner(ctx, phrase.pan);
        src.connect(gain).connect(pan).connect(g.bus);
        src.onended = () => {
          g.oneShots.delete(src);
          gain.disconnect();
          pan.disconnect();
        };
        g.oneShots.add(src);
        src.start(at + note.offset);
      }
    }
  };
  tick();
  g.timer = setInterval(tick, BIRD_TICK_MS);
}

/** Stops everything the channel owns. With `fade`, ramps the bus to silence
 *  first and disconnects once the sources have actually ended. */
function disposeChannel(ctx: AudioContext, g: ChannelGraph, fade: number) {
  if (g.timer !== null) clearInterval(g.timer);
  g.timer = null;
  const now = ctx.currentTime;
  const end = now + fade;
  const level = g.bus.gain;
  level.cancelScheduledValues(now);
  level.setValueAtTime(level.value, now);
  level.linearRampToValueAtTime(0, end);
  for (const src of [...g.sources, ...g.oneShots]) {
    try { src.stop(end); } catch { /* already stopped */ }
  }
  g.oneShots.clear();
  if (fade > 0 && g.sources[0]) g.sources[0].onended = () => g.bus.disconnect();
  else g.bus.disconnect();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMultiNoise() {
  const ctxRef      = useRef<AudioContext | null>(null);
  const masterRef   = useRef<AudioNode | null>(null);
  const channelsRef = useRef<Map<NoiseChannel, ChannelGraph>>(new Map());

  const ensureCtx = useCallback((): AudioContext => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      ctxRef.current = ctx;
      masterRef.current = createMaster(ctx);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }, []);

  const stopAll = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) channelsRef.current.forEach(g => disposeChannel(ctx, g, 0));
    channelsRef.current.clear();
    ctx?.close().catch(() => {});
    ctxRef.current = null;
    masterRef.current = null;
  }, []);

  /** Apply the desired noise state — adds/removes/adjusts channels */
  const apply = useCallback((noises: ActiveNoise[]) => {
    if (noises.length === 0) { stopAll(); return; }

    const ctx      = ensureCtx();
    const master   = masterRef.current!;
    const channels = channelsRef.current;
    const wanted   = new Set(noises.map(n => n.channel));

    channels.forEach((g, ch) => {
      if (!wanted.has(ch)) {
        disposeChannel(ctx, g, FADE_OUT);
        channels.delete(ch);
      }
    });

    for (const { channel, volume } of noises) {
      const target = Math.max(0, Math.min(1, volume)) * VOLUME_SCALE;
      const existing = channels.get(channel);
      const g = existing ?? buildChannel(ctx, master, channel);
      if (!existing) channels.set(channel, g);
      g.bus.gain.setTargetAtTime(target, ctx.currentTime, existing ? VOLUME_GLIDE : FADE_IN);
    }
  }, [ensureCtx, stopAll]);

  /** Call from a click handler before turning a channel on: Safari only lets
   *  an AudioContext start inside the user gesture itself, and the effect
   *  that calls `apply` runs after it. */
  const unlock = useCallback(() => { ensureCtx(); }, [ensureCtx]);

  // Unmount (or leaving the timer tab): stop every source and timer, close the context
  useEffect(() => () => { stopAll(); }, [stopAll]);

  return { apply, stopAll, unlock };
}
