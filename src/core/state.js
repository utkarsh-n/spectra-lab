// Settings model shared by every instrument: three superposable sources, the medium, display and feedback.
import { defaultSource, wienPeak } from "./wave.js";
import { LOG_MIN, LOG_MAX, frequency } from "./spectrum.js";
import { C } from "./constants.js";

export const INSTRUMENTS = [
  { key: "scope", name: "Wave scope", detail: "E ⊥ B ⊥ propagation" },
  { key: "tuner", name: "Spectrum tuner", detail: "One dial, fifteen decades" },
  { key: "bench", name: "Matter bench", detail: "Same beam, different matter" },
  { key: "decompose", name: "Decompose", detail: "Take the wave apart" },
  { key: "lab", name: "Spectroscopy lab", detail: "Sweep and read" },
];
export const SOURCE_NAMES = ["A", "B", "C"];
export const SOURCE_KINDS = [
  { key: "plane", name: "Plane wave", note: "One frequency with flat wave fronts, the simplest case." },
  { key: "pulse", name: "Pulse", note: "A short burst. Making it shorter needs a wider spread of frequencies." },
  { key: "thermal", name: "Thermal", note: "A hot object's glow: many frequencies with random phases, following Planck's law." },
];

export function defaults() {
  return {
    sources: [
      defaultSource({ lambda: 550e-9 }),
      defaultSource({ enabled: false, lambda: 450e-9 }),
      defaultSource({ enabled: false, lambda: 650e-9 }),
    ],
    active: 0,
    link: false,
    medium: "vacuum",
    speed: 1, // κ: display cycles per second for source A at 1×
    instrument: "scope",
    scope: { showE: true, showB: true, showS: true, yaw: 64, pitch: 18, zoom: 1 },
    decompose: { tab: "polarization", polarizer: 30, probeMode: "both", a0: 1.5 },
    bench: { arrangement: "side", lambda0: 120e-9, focus: "water" },
    lab: { sample: "co2", mode: "ir", sweep: 0.46, sweeping: false },
    feedback: { sound: false, haptics: true, strength: 0.7 },
    playing: true,
  };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Apply a change to the active source. With Link on, the same relative change applies to every
// enabled source, so chords keep their shape: wavelengths and fields scale, angles shift.
export function editSource(state, key, value) {
  const src = state.sources[state.active];
  const targets = state.link ? state.sources.filter((s) => s.enabled || s === src) : [src];
  const ratio = key === "lambda" || key === "E0" || key === "temperature" ? value / src[key] : null;
  const shift = key === "theta" || key === "delta" || key === "phi" ? value - src[key] : null;
  for (const s of targets) {
    if (s === src || (ratio == null && shift == null)) s[key] = value;
    else if (ratio != null) s[key] = s[key] * ratio;
    else s[key] = s[key] + shift;
    sanitize(s);
  }
  return state;
}

export function sanitize(s) {
  s.lambda = Math.pow(10, clamp(Math.log10(s.lambda), LOG_MIN, LOG_MAX));
  s.E0 = clamp(s.E0, 1e-6, 1e16);
  s.theta = clamp(s.theta, -90, 90);
  s.delta = ((((s.delta + 180) % 360) + 360) % 360) - 180;
  s.phi = ((s.phi % 360) + 360) % 360;
  s.cycles = clamp(s.cycles, 1, 12);
  s.temperature = clamp(s.temperature, 1, 1e8);
  if (s.kind === "thermal") s.lambda = wienPeak(s.temperature);
  return s;
}

// Display mapping. Real light is far too fast to watch, so every source is slowed by the same factor:
// source A (or the first enabled source) runs at `speed` cycles per second on screen.
export function timeScale(state) {
  const ref = state.sources.find((s) => s.enabled) ?? state.sources[0];
  return state.speed / frequency(ref.lambda); // seconds of real time per second on screen
}
export const slowMotion = (state) => 1 / timeScale(state); // how many times slower than reality

export function enabledSources(state) {
  return state.sources.filter((s) => s.enabled);
}

export function serialize(state) {
  return JSON.stringify(state);
}
export function deserialize(text) {
  const base = defaults();
  try {
    const s = JSON.parse(text);
    if (!s || !Array.isArray(s.sources) || s.sources.length !== 3) return base;
    return {
      ...base, ...s,
      sources: s.sources.map((x, i) => sanitize({ ...base.sources[i], ...x })),
      scope: { ...base.scope, ...s.scope },
      decompose: { ...base.decompose, ...s.decompose },
      bench: { ...base.bench, ...s.bench },
      lab: { ...base.lab, ...s.lab, sweeping: false },
      feedback: { ...base.feedback, ...s.feedback },
      active: clamp(s.active | 0, 0, 2),
    };
  } catch {
    return base;
  }
}

export const lambdaFromFrequency = (f) => C / f;
