"use client";
// ─── Pomodoro Pro — Multi-Channel Audio Engine ───────────────────────────────

import { useRef, useCallback, useEffect } from "react";
import type { ActiveNoise, NoiseChannel } from "./types";

// ─── Per-channel audio graph ──────────────────────────────────────────────────

interface ChannelGraph {
  src:  AudioBufferSourceNode;
  gain: GainNode;
}

function buildChannelGraph(
  ctx: AudioContext,
  channel: NoiseChannel
): ChannelGraph {
  const bufLen = ctx.sampleRate * 2;
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop   = true;

  const gain = ctx.createGain();

  // ── Channel-specific filter chain ──────────────────────────────────────────
  if (channel === "rain") {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 3000; f.Q.value = 0.5;
    src.connect(f); f.connect(gain);
  } else if (channel === "heavy_rain") {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2200; f.Q.value = 0.3;
    const f2 = ctx.createBiquadFilter();
    f2.type = "lowpass"; f2.frequency.value = 6000;
    src.connect(f); f.connect(f2); f2.connect(gain);
  } else if (channel === "train") {
    // Low rumble + rhythmic LFO
    const low = ctx.createBiquadFilter();
    low.type = "lowpass"; low.frequency.value = 300;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.5; // rumble rhythm ~2.5 Hz
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain);
    lfo.start();
    src.connect(low); low.connect(gain);
  } else if (channel === "cafe") {
    // Pink-ish noise: roll off highs
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 2000; f.Q.value = 0.8;
    const f2 = ctx.createBiquadFilter();
    f2.type = "peaking"; f2.frequency.value = 400; f2.gain.value = 4;
    src.connect(f); f.connect(f2); f2.connect(gain);
  } else if (channel === "ac") {
    // Broad low hum
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 120; f.Q.value = 0.3;
    src.connect(f); f.connect(gain);
  } else if (channel === "fire") {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 600;
    src.connect(f); f.connect(gain);
  } else if (channel === "ocean") {
    // Slow sweep filter simulating waves
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 800;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;
    lfo.connect(lfoGain); lfoGain.connect(f.frequency);
    lfo.start();
    src.connect(f); f.connect(gain);
  } else if (channel === "wind") {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 800; f.Q.value = 2;
    src.connect(f); f.connect(gain);
  } else if (channel === "birds") {
    // Bright, high-frequency chirp-like texture
    const f  = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 4500; f.Q.value = 1.5;
    const f2 = ctx.createBiquadFilter();
    f2.type = "peaking"; f2.frequency.value = 6000; f2.gain.value = 6;
    src.connect(f); f.connect(f2); f2.connect(gain);
  } else {
    src.connect(gain);
  }

  gain.connect(ctx.destination);
  src.start();
  return { src, gain };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMultiNoise() {
  const ctxRef      = useRef<AudioContext | null>(null);
  const channelsRef = useRef<Map<NoiseChannel, ChannelGraph>>(new Map());

  const ensureCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const stopChannel = useCallback((ch: NoiseChannel) => {
    const graph = channelsRef.current.get(ch);
    if (!graph) return;
    try { graph.src.stop(); } catch {}
    channelsRef.current.delete(ch);
  }, []);

  const stopAll = useCallback(() => {
    channelsRef.current.forEach((_, ch) => stopChannel(ch));
    ctxRef.current?.close();
    ctxRef.current = null;
  }, [stopChannel]);

  /** Apply the desired noise state — adds/removes/adjusts channels */
  const apply = useCallback((noises: ActiveNoise[]) => {
    if (noises.length === 0) { stopAll(); return; }

    const ctx     = ensureCtx();
    const desired = new Set(noises.map(n => n.channel));

    // Stop channels no longer wanted
    channelsRef.current.forEach((_, ch) => {
      if (!desired.has(ch)) stopChannel(ch);
    });

    // Start new channels / update volumes
    noises.forEach(({ channel, volume }) => {
      const clamped = Math.max(0, Math.min(1, volume));
      if (channelsRef.current.has(channel)) {
        // Just update gain
        const graph = channelsRef.current.get(channel)!;
        graph.gain.gain.setTargetAtTime(clamped * 0.5, ctx.currentTime, 0.05);
      } else {
        // Start new channel
        const graph = buildChannelGraph(ctx, channel);
        graph.gain.gain.value = clamped * 0.5;
        channelsRef.current.set(channel, graph);
      }
    });
  }, [ensureCtx, stopChannel, stopAll]);

  // Clean up on unmount
  useEffect(() => () => { stopAll(); }, [stopAll]);

  return { apply, stopAll };
}
