// Parity vectors for the Swift port of src/core (and the display-space helpers in src/ui/fieldview.js).
//
//   node tests/parity/generate.mjs            # writes tests/parity/vectors.json
//   node tests/parity/generate.mjs --check    # regenerates in memory and fails if vectors.json differs
//
// Deterministic: a seeded LCG (the same Math.imul form the core uses) picks every random input, and
// nothing time- or machine-dependent is written, so the file is byte-identical across runs.
//
// Encoding rules (the Swift decoder must follow them):
//   - Every number is written with JSON.stringify's shortest round-trip form; parse it as Double.
//   - Non-finite numbers are written as the strings "Infinity", "-Infinity" and "NaN"
//     (JSON has no literal for them). Negative zero is written as 0.
//   - A JS `null` (e.g. logLog outside its table) stays `null`; decode it as Double?.
//   - Each category is { "about": string, "cases": [ ... ] } and every case in a category has the
//     same fields, so each maps onto one Decodable struct.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as K from "../../src/core/constants.js";
import * as S from "../../src/core/spectrum.js";
import * as W from "../../src/core/wave.js";
import * as M from "../../src/core/matter.js";
import * as SP from "../../src/core/specimens.js";
import * as SA from "../../src/core/samples.js";
import * as ST from "../../src/core/state.js";
import * as PR from "../../src/core/presets.js";
import { XCOM } from "../../src/data/xcom.js";
import { WATER_ABSORPTION } from "../../src/data/water.js";
import * as FV from "../../src/ui/fieldview.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const OUT = join(here, "vectors.json");

// ---------- deterministic randomness ----------
const SEED = 20261003;
let seed = SEED;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const uniform = (lo, hi) => lo + (hi - lo) * rand();
const logUniform = (lo, hi) => 10 ** uniform(Math.log10(lo), Math.log10(hi));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const lambdaAnywhere = () => 10 ** uniform(S.LOG_MIN, S.LOG_MAX);

// ---------- encoding ----------
function clean(v) {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "NaN";
    if (v === Infinity) return "Infinity";
    if (v === -Infinity) return "-Infinity";
    return Object.is(v, -0) ? 0 : v;
  }
  if (v === undefined) return null;
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(clean);
  if (typeof v === "function") return undefined;
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "function") continue;
    o[k] = clean(x);
  }
  return o;
}
const clone = (x) => structuredClone(x);
const cat = {};
const add = (name, about, cases) => { cat[name] = { about, cases }; };

// Wavelength grids shared by several categories.
const BOUNDARY_LAMBDAS = [
  1e-13, 1.2398e-12, 1e-11, 20.7e-12, 1.239841984e-9, M.XCOM_LAMBDA_MAX * (1 + 1e-12), 1.2398419843320026e-9,
  5e-9, 1e-8, 1e-8 * (1 - 1e-12), 100e-9, 123.98419843320026e-9, 150e-9, 175e-9, 180e-9, 200e-9, 254e-9, 260e-9,
  280e-9, 300e-9, 315e-9, 399.99e-9, 400e-9, 450e-9, 495e-9, 520e-9, 550e-9, 570e-9, 590e-9, 600e-9, 620e-9,
  656.47e-9, 700e-9, 800e-9, 1.1e-6, 1.4e-6, 1.94e-6, 2.5e-6, 3e-6, 3.7e-6, 5e-6, 5.0001e-6, 8e-6, 9.3e-6, 15e-6,
  1e-3, 3e-3, 1e-2, 3e-2, 0.1224, 0.12236, 1, 3, 10, 100, 1000,
];

// ===================================================================================== constants
add("constants", "Every exported constant in core/constants.js, spectrum.js and matter.js.",
  Object.entries({
    ...K, LOG_MIN: S.LOG_MIN, LOG_MAX: S.LOG_MAX,
    XCOM_MIN_EV: M.XCOM_MIN_EV, XCOM_MAX_EV: M.XCOM_MAX_EV, XCOM_LAMBDA_MAX: M.XCOM_LAMBDA_MAX,
    ZINC_ne: M.ZINC.ne, ZINC_wp: M.ZINC.wp, ZINC_gamma: M.ZINC.gamma, ZINC_plasmaEV: M.ZINC.plasmaEV,
    FV_MAX_RATIO: FV.MAX_RATIO,
  }).map(([name, value]) => ({ name, value })));

// ===================================================================================== static tables
add("tables", "Static lists the Swift port embeds verbatim (bands, detents, size comparisons, metadata).", [{
  bands: S.BANDS, detents: S.DETENTS, sizeComparisons: S.SIZE_COMPARISONS, workFunctions: M.WORK_FUNCTIONS,
  series: SA.SERIES, instruments: ST.INSTRUMENTS, sourceNames: ST.SOURCE_NAMES, sourceKinds: ST.SOURCE_KINDS,
  media: Object.entries(M.MEDIA).map(([key, m]) => ({ key, name: m.name })),
  specimens: SP.SPECIMENS.map((s) => ({ key: s.key, name: s.name, sub: s.sub })),
  samples: SA.SAMPLES.map((s) => ({
    key: s.key, name: s.name, modes: s.modes, source: s.source, axis: s.axis,
    notes: s.modes.map((m) => s.note(m)),
  })),
  presets: PR.PRESETS.map((p) => ({ key: p.key, name: p.name, detail: p.detail, note: p.note })),
  defaults: ST.defaults(),
  defaultSource: W.defaultSource(),
}]);

add("dataTables", "Full reference tables, for a row-by-row check of the Swift-embedded copies.", [{
  xcom: Object.fromEntries(Object.entries(XCOM).map(([k, v]) => [k, { name: v.name, density: v.density, source: v.source, rows: v.rows }])),
  waterAbsorption: WATER_ABSORPTION,
}]);

// ===================================================================================== conversions
{
  const cases = [];
  const lambdas = [...BOUNDARY_LAMBDAS];
  for (let i = 0; i < 300; i++) lambdas.push(lambdaAnywhere());
  for (const lambda of lambdas) {
    const f = S.frequency(lambda), ev = S.photonEV(lambda), nu = S.wavenumber(lambda);
    const lg = Math.log10(lambda) + uniform(-2, 2);
    cases.push({
      lambda, frequency: f, wavelength: S.wavelength(f), photonEV: ev, wavelengthFromEV: S.wavelengthFromEV(ev),
      kcalPerMol: S.kcalPerMol(ev), kjPerMol: S.kjPerMol(ev), wavenumber: nu, fromWavenumber: S.fromWavenumber(nu),
      log: lg, clampLog: S.clampLog(lg),
    });
  }
  add("conversions", "frequency, wavelength, photonEV, wavelengthFromEV, kcalPerMol, kjPerMol, wavenumber, fromWavenumber, clampLog.", cases);
}

// ===================================================================================== bands & describe
{
  const cases = [];
  const lambdas = [0, Infinity, ...BOUNDARY_LAMBDAS];
  for (const b of S.BANDS) if (b.lo > 0) lambdas.push(b.lo, b.lo * (1 - 1e-12), b.lo * (1 + 1e-12));
  for (let i = 0; i < 200; i++) lambdas.push(lambdaAnywhere());
  for (const lambda of lambdas) cases.push({ lambda, band: S.bandAt(lambda).key, sub: S.subBandAt(lambda), ion: S.ionizationClass(lambda).key });
  add("bandAt", "bandAt(λ).key, subBandAt(λ), ionizationClass(λ).key, including exact band edges and ±1e-12 relative.", cases);
}
{
  const cases = [];
  const lambdas = [...BOUNDARY_LAMBDAS];
  for (let i = 0; i < 200; i++) lambdas.push(lambdaAnywhere());
  for (let i = 0; i < 40; i++) lambdas.push(uniform(380e-9, 780e-9));
  for (const lambda of lambdas) {
    const d = S.describe(lambda);
    cases.push({
      lambda, f: d.f, ev: d.ev, band: d.band.key, sub: d.sub, ion: d.ion.key, ionLabel: d.ion.label, color: d.color,
      text: d.text,
    });
  }
  add("describe", "describe(λ): numbers, band, sub-band, ionization class, display colour and every readout string.", cases);
}
{
  const cases = [];
  for (let nm = 370; nm <= 790; nm += 1) cases.push({ nm, rgb: S.spectralRGB(nm) });
  for (let i = 0; i < 80; i++) { const nm = uniform(360, 800); cases.push({ nm, rgb: S.spectralRGB(nm) }); }
  add("spectralRGB", "spectralRGB(nm) linear 0..1 triplets (Bruton piecewise fit), every nm 370–790 plus random.", cases);
}
{
  const cases = [];
  const lambdas = [...BOUNDARY_LAMBDAS];
  for (let i = 0; i < 160; i++) lambdas.push(uniform(380e-9, 720e-9));
  for (let i = 0; i < 40; i++) lambdas.push(lambdaAnywhere());
  for (const lambda of lambdas) cases.push({ lambda, color: S.displayColor(lambda), hue: S.hueName(lambda * 1e9) });
  add("displayColor", "displayColor(λ) hex string and hueName(nm).", cases);
}
{
  const cases = [];
  const xs = [0, 1, -1, 0.5, 1.125, 2.5, 10.25, 100.5, 0.000123, 1.23e-7, 9.995, 99.95, 999.5, 0.0995, 1e-5, 12345.678, -42.42, 1e21];
  for (let i = 0; i < 120; i++) xs.push((rand() < 0.15 ? -1 : 1) * 10 ** uniform(-9, 9));
  for (const x of xs) {
    cases.push({
      x, sig3: S.sig3(x), sci: S.sci(x), sciUnit: S.sci(x, "Hz"),
      length: S.formatLength(Math.abs(x)), frequency: S.formatFrequency(Math.abs(x) * 1e10), energy: S.formatEnergy(Math.abs(x)),
      kcal: S.formatKcal(Math.abs(x)),
    });
  }
  add("format", "sig3, sci, formatLength, formatFrequency, formatEnergy, formatKcal. Includes exact binary ties (1.125, 2.5, 10.25, 100.5) where JS toFixed rounds away from zero but printf rounds to even.", cases);
}
{
  const cases = [];
  const pairs = [[Math.log10(800e-9), Math.log10(500e-9)], [Math.log10(500e-9), Math.log10(500e-9)], [S.LOG_MIN, S.LOG_MAX], [S.LOG_MAX, S.LOG_MIN], [-7, Math.log10(400e-9)]];
  for (const d of S.DETENTS) pairs.push([d.log, d.log - 0.1], [d.log - 0.1, d.log]);
  for (let i = 0; i < 60; i++) pairs.push([uniform(S.LOG_MIN, S.LOG_MAX), uniform(S.LOG_MIN, S.LOG_MAX)]);
  for (const [from, to] of pairs) cases.push({ from, to, crossed: S.crossedDetents(from, to).map((d) => d.label) });
  add("crossedDetents", "crossedDetents(fromLog, toLog) → labels, half-open (lo, hi].", cases);
}
{
  const cases = [];
  for (let i = 0; i < 80; i++) { const lambda = lambdaAnywhere(); cases.push({ lambda, ...S.nearestComparison(lambda) }); }
  add("nearestComparison", "nearestComparison(λ) → size, label, ratio, decades.", cases);
}

// ===================================================================================== wave
const randomSource = (o = {}) => W.defaultSource({
  lambda: lambdaAnywhere(), E0: logUniform(1e-6, 1e16), theta: uniform(-90, 90), delta: uniform(-180, 180), phi: uniform(0, 360),
  cycles: uniform(1, 12), temperature: logUniform(1, 1e8), ...o,
});
{
  const cases = [];
  for (let i = 0; i < 150; i++) {
    const src = randomSource(), q = uniform(-20, 20), z = uniform(-3, 3), t = uniform(-1e-12, 1e-12) * src.lambda / 1e-6, n = pick([1, uniform(1, 2.5)]);
    cases.push({ theta: src.theta, delta: src.delta, phi: src.phi, lambda: src.lambda, q, z, t, n, jones: W.jones(src), fields: W.fieldsAtPhase(src, q), phase: W.phaseAt(src, z, t, n) });
  }
  add("jonesFields", "jones(src), fieldsAtPhase(src, q), phaseAt(src, z, t, n).", cases);
}
{
  const cases = [];
  const specials = [[30, 0], [45, 90], [45, -90], [45, 40], [0, 0], [90, 0], [-90, 0], [0, 90], [45, 180], [45, -180], [60, 90], [-45, 90], [10, 1e-12]];
  for (const [theta, delta] of specials) cases.push({ theta, delta, ...W.ellipse(W.defaultSource({ theta, delta })) });
  for (let i = 0; i < 200; i++) { const theta = uniform(-90, 90), delta = uniform(-180, 180); cases.push({ theta, delta, ...W.ellipse(W.defaultSource({ theta, delta })) }); }
  add("ellipse", "ellipse(src): orientation (deg), chi (deg), kind, sense (null when linear).", cases);
}
{
  const cases = [];
  for (let i = 0; i < 300; i++) {
    const theta = uniform(-90, 90), delta = pick([0, 90, -90, uniform(-180, 180)]), alpha = uniform(-180, 180);
    cases.push({ theta, delta, alpha, T: W.polarizerTransmission(W.defaultSource({ theta, delta }), alpha) });
  }
  add("polarizer", "polarizerTransmission(src, alphaDeg).", cases);
}
{
  const cases = [];
  for (let i = 0; i < 200; i++) {
    const E0 = logUniform(1e-6, 1e16), lambda = lambdaAnywhere(), n = pick([1, uniform(1, 2.5)]), reflect = rand() < 0.5;
    cases.push({
      E0, lambda, n, reflect, intensity: W.intensity(E0, n), intensityVacuum: W.intensity(E0), peakB: W.peakB(E0, n),
      radiationPressure: W.radiationPressure(E0, n, reflect), photonFlux: W.photonFlux(E0, lambda, n),
    });
  }
  add("intensity", "intensity, peakB, radiationPressure, photonFlux.", cases);
}
{
  const cases = [];
  const Ts = [2.725, 310, 5772, 1, 1e8];
  for (let i = 0; i < 25; i++) Ts.push(logUniform(1, 1e8));
  for (const T of Ts) {
    const peak = W.wienPeak(T);
    for (let j = 0; j < 10; j++) {
      const lambda = peak * 10 ** uniform(-3, 3);
      cases.push({ T, lambda, wienPeak: peak, planck: W.planckLambda(lambda, T) });
    }
    cases.push({ T, lambda: peak, wienPeak: peak, planck: W.planckLambda(peak, T) });
  }
  add("planck", "planckLambda(λ, T) incl. the x > 700 cutoff to 0, and wienPeak(T).", cases);
}
{
  const cases = [];
  const sources = [
    W.defaultSource(), W.defaultSource({ phi: 123 }),
    W.defaultSource({ kind: "pulse", cycles: 3 }), W.defaultSource({ kind: "pulse", cycles: 1, lambda: 800e-9, phi: 45 }),
    W.defaultSource({ kind: "pulse", cycles: 12, lambda: 0.03 }),
    W.defaultSource({ kind: "thermal", temperature: 310, lambda: W.wienPeak(310) }),
    W.defaultSource({ kind: "thermal", temperature: 2.725, lambda: W.wienPeak(2.725) }),
    W.defaultSource({ kind: "thermal", temperature: 5772, lambda: W.wienPeak(5772) }),
  ];
  for (let i = 0; i < 6; i++) sources.push(randomSource({ kind: pick(["pulse", "thermal"]) }));
  for (const src of sources) for (const count of [2, 3, 15, 41]) {
    cases.push({ kind: src.kind, lambda: src.lambda, cycles: src.cycles, temperature: src.temperature, phi: src.phi, count, components: W.components(src, count) });
  }
  add("components", "components(src, count) for plane, pulse and thermal sources (count < 3 clamps to 3). Thermal phases come from the in-function LCG seeded 12345.", cases);
}
{
  const cases = [];
  for (let i = 0; i < 80; i++) {
    const src = W.defaultSource({ kind: "pulse", cycles: uniform(1, 12) }), q = uniform(-200, 200);
    cases.push({ cycles: src.cycles, q, envelope: W.pulseEnvelope(src, q), bandwidth: W.pulseBandwidth(src) });
  }
  add("pulse", "pulseEnvelope(src, q) and pulseBandwidth(src).", cases);
}
{
  const cases = [];
  for (let i = 0; i < 100; i++) {
    const E0 = logUniform(1e-3, 1e16), lambda = logUniform(1e-9, 10), a = logUniform(1e-3, 20);
    cases.push({ E0, lambda, a, a0: W.a0(E0, lambda), fieldForA0: W.fieldForA0(a, lambda), quiver: W.quiverAmplitude(E0, lambda), drift: W.driftSpeed(a) });
  }
  add("laser", "a0, fieldForA0, quiverAmplitude, driftSpeed.", cases);
}
{
  const cases = [];
  const combos = [
    [0, 0, 0.1, "both", 1, 4000], [0, 0, 1, "both", 2, 720], [0, 0, 2, "both", 3, 900], [0, 0, 5, "both", 1, 4000],
    [45, 90, 1.5, "both", 3, 900], [30, 40, 2, "both", 2, 720], [90, 0, 1.5, "electric", 3, 900], [45, 90, 2, "electric", 1, 400],
    [0, 0, 2, "magnetic", 1, 400], [-60, -120, 0.7, "both", 2, 500], [10, 170, 3, "electric", 2, 720], [75, 15, 0.3, "both", 3, 900],
  ];
  for (const [theta, delta, a, mode, cycles, steps] of combos) {
    const pts = W.electronTrajectory(W.defaultSource({ theta, delta }), a, mode, cycles, steps);
    const idx = new Set([0, 1, pts.length - 1]);
    for (let k = 0; k <= 24; k++) idx.add(Math.round((k / 24) * (pts.length - 1)));
    const samples = [...idx].sort((x, y) => x - y).map((i) => ({ i, ...pts[i] }));
    cases.push({ theta, delta, a, mode, cycles, steps, count: pts.length, samples });
  }
  add("electronTrajectory", "electronTrajectory(src, a0, mode, cycles, steps): point count and ~27 sampled points (eta, t, x, y, z, ux, uy, uz, gamma) each. Errors accumulate over the integration; compare with a looser tolerance.", cases);
}

// ===================================================================================== matter
{
  const cases = [];
  for (let i = 0; i < 200; i++) {
    const omega0 = logUniform(1e6, 1e18), omega = omega0 * 10 ** uniform(-3, 3), gamma = omega0 * logUniform(1e-3, 2);
    cases.push({ omega, omega0, gamma, ...M.oscillatorResponse(omega, omega0, gamma) });
  }
  for (const g of [0.01, 0.1, 1]) for (const w of [1e-4, 0.5, 1, 2, 1e3]) cases.push({ omega: w, omega0: 1, gamma: g, ...M.oscillatorResponse(w, 1, g) });
  add("oscillatorResponse", "oscillatorResponse(ω, ω0, γ) → amplitude, lag (deg), power.", cases);
}
{
  const cases = [];
  for (let i = 0; i < 120; i++) {
    const n = 1 + Math.floor(rand() * 3), w0b = logUniform(1e12, 1e17);
    const oscillators = Array.from({ length: n }, () => ({ w0: w0b * logUniform(0.3, 3), wp: w0b * logUniform(0.05, 2), gamma: w0b * logUniform(1e-3, 0.5) }));
    const omega = w0b * 10 ** uniform(-2, 2);
    cases.push({ omega, oscillators, eps: M.lorentzEpsilon(omega, oscillators) });
  }
  cases.push({ omega: 0.5, oscillators: [{ w0: 1, wp: 1, gamma: 0 }], eps: M.lorentzEpsilon(0.5, [{ w0: 1, wp: 1, gamma: 0 }]) });
  add("lorentzEpsilon", "lorentzEpsilon(ω, [{w0, wp, gamma}]) → {re, im}.", cases);
}
{
  const cases = [];
  for (let i = 0; i < 120; i++) {
    const useZinc = rand() < 0.5, lambda = lambdaAnywhere(), omega = (2 * Math.PI * K.C) / lambda;
    const wp = useZinc ? M.ZINC.wp : logUniform(1e13, 1e17), gamma = useZinc ? M.ZINC.gamma : logUniform(1e11, 1e15);
    const eps = M.drudeEpsilon(omega, wp, gamma);
    cases.push({ lambda, omega, wp, gamma, eps, index: M.indexFromEpsilon(eps) });
  }
  add("drude", "drudeEpsilon(ω, ωp, γ) and indexFromEpsilon of the result (ZINC parameters and random metals).", cases);
}
{
  const cases = [];
  const zs = [[1, 0], [-1, 0], [0, 1], [0, -1], [4, 0], [-4, 0], [0, 0], [3, 4], [3, -4], [-3, 4], [-3, -4]];
  for (let i = 0; i < 60; i++) zs.push([uniform(-1e3, 1e3), uniform(-1e3, 1e3)]);
  for (const [re, im] of zs) {
    const lambda = lambdaAnywhere(), r = M.csqrt({ re, im }), ix = M.indexFromEpsilon({ re, im });
    cases.push({ re, im, sqrt: r, n: ix.n, k: ix.k, lambda, absorption: M.absorptionFromK(ix.k, lambda), reflectance: M.normalReflectance(ix.n, ix.k) });
  }
  add("complexIndex", "csqrt, indexFromEpsilon, absorptionFromK(k, λ), normalReflectance(n, k).", cases);
}
{
  const cases = [];
  for (let i = 0; i < 80; i++) {
    const R = pick([0, uniform(0, 0.1), uniform(0, 1), 0.99]), alpha = pick([0, logUniform(1e-6, 1e6)]), d = pick([0.1, 0.3, 1, uniform(0, 5)]);
    cases.push({ R, alpha, thickness: d, ...M.slab(R, alpha, d) });
  }
  add("slab", "slab(R, α 1/cm, thickness cm) → T, R, A (A clamped ≥ 0).", cases);
}
{
  const cases = [];
  const rows = [[100e-9, 4e5], [200e-9, 100], [400e-9, 0.004], [2e-6, 0.004], [9e-6, 5000], [1e3, 1e-6]];
  for (let i = 0; i < 60; i++) {
    const lambda = pick([logUniform(1e-8, 1e4), rows[Math.floor(rand() * rows.length)][0]]);
    const la = logUniform(1e-9, 1e-7), lb = logUniform(1e-9, 1e-7), va = logUniform(1e-3, 1e5), vb = logUniform(1e-3, 1e5);
    cases.push({ lambda, anchors: M.anchors(rows, lambda), bridge: { la, va, lb, vb, value: M.bridge(lambda, la, va, lb, vb) } });
  }
  add("anchorsBridge", "anchors(rows, λ) with a fixed 6-row table [[100e-9,4e5],[200e-9,100],[400e-9,0.004],[2e-6,0.004],[9e-6,5000],[1e3,1e-6]] (clamped outside) and bridge(λ, λa, va, λb, vb) (extrapolates).", cases);
}
{
  const cases = [];
  const rows = [[1, 10], [2, 5], [2, 50], [4, 20], [8, 1]];
  for (const x of [0.5, 1, 1.5, 2 * (1 - 1e-15), 2, 2 * (1 + 1e-15), 3, 4, 6, 8, 8.000001, NaN]) cases.push({ x, value: M.logLog(rows, x) });
  add("logLog", "logLog on the synthetic table [[1,10],[2,5],[2,50],[4,20],[8,1]]: edge at x = 2 takes the upper value, null outside or for NaN.", cases);
}
{
  const cases = [];
  const lambdas = [...BOUNDARY_LAMBDAS, 589e-9, 587.56e-9, 486.13e-9, 656.27e-9, 589.3e-9, 0.21e-6, 0.225e-6, 0.3e-6, 0.3e-3, 0.299e-3, 2.5000001e-6, 1.0999e-6, 1.1001e-6, 199e-9, 201e-9];
  for (let i = 0; i < 140; i++) lambdas.push(lambdaAnywhere());
  for (let i = 0; i < 60; i++) lambdas.push(logUniform(150e-9, 5e-6));
  for (const lambda of lambdas) {
    const row = { lambda };
    for (const [key, m] of Object.entries(M.MEDIA)) row[key] = m.index(lambda);
    cases.push(row);
  }
  add("media", "MEDIA[key].index(λ) → {n, k, valid} for vacuum, air, water, glass, silica, diamond.", cases);
}
{
  const cases = [];
  for (const [material, mat] of Object.entries(XCOM)) {
    const evs = [];
    for (const [e] of mat.rows) evs.push(e * 1e6, e * 1e6 * (1 - 1e-12), e * 1e6 * (1 + 1e-12));
    for (let i = 1; i < mat.rows.length; i++) if (mat.rows[i][0] !== mat.rows[i - 1][0]) evs.push(Math.sqrt(mat.rows[i][0] * mat.rows[i - 1][0]) * 1e6);
    for (let i = 0; i < 40; i++) evs.push(logUniform(500, 3e7));
    evs.push(999.999, 1000, 2e7, 2.0000001e7, 1, 0, NaN);
    if (material === "lead") evs.push(88.0045e3, 88.0e3);
    for (const ev of evs) {
      const density = uniform(0.5, 12);
      cases.push({ material, ev, massAttenuation: M.massAttenuation(material, ev), linearAttenuation: M.linearAttenuation(material, ev), density, linearAttenuationDensity: M.linearAttenuation(material, ev, density) });
    }
  }
  add("xcom", "massAttenuation(material, eV) and linearAttenuation (default and custom density): every table energy, ±1e-12 around it, geometric midpoints, random energies and out-of-range values (null).", cases);
}
{
  const cases = [];
  const lambdas = [];
  for (const [nm] of WATER_ABSORPTION) lambdas.push(nm * 1e-9);
  for (let i = 1; i < WATER_ABSORPTION.length; i += 3) lambdas.push(Math.sqrt(WATER_ABSORPTION[i][0] * WATER_ABSORPTION[i - 1][0]) * 1e-9);
  for (let i = 0; i < 120; i++) lambdas.push(logUniform(5e-9, 20));
  lambdas.push(9.9999e-9, 10e-9, 10, 10.000001, 1e-3, 0.12236, NaN);
  for (const lambda of lambdas) cases.push({ lambda, alpha: M.waterAbsorption(lambda) });
  add("waterAbsorption", "waterAbsorption(λ) in 1/cm: every Segelstein point (λ = nm·1e-9, so table hits are not exact), every third midpoint, random and outside (null).", cases);
}

// ===================================================================================== specimens
const specimenLambdas = (() => {
  const out = [...BOUNDARY_LAMBDAS];
  for (let i = 0; i < 140; i++) out.push(lambdaAnywhere());
  out.push(K.C / 100e6, K.C / 200e6, K.C / 300e6, K.C / 500e6, K.C / 2.45e9, K.C / 5e9, S.wavelengthFromEV(60e3), 120e-9, 120e-9 * 1.15, 120e-9 / 1.15);
  return out;
})();
const pickResponse = (r) => {
  const x = r.response;
  return {
    kind: x.kind, text: x.text, amplitude: x.amplitude ?? null, lag: x.lag ?? null, power: x.power ?? null, where: x.where ?? null,
    value: x.value ?? null, heating: x.heating ?? null, eject: x.eject === undefined ? null : x.eject, resonance: x.resonance ?? null,
  };
};
{
  const cases = [];
  for (const lambda of specimenLambdas) {
    const src = W.defaultSource({ lambda, E0: pick([1000, 5000, logUniform(1e-3, 1e8)]) });
    const lambda0 = pick([120e-9, logUniform(1e-12, 1e3)]);
    for (const s of SP.SPECIMENS) {
      const r = s.evaluate(lambda, src, { lambda0 });
      cases.push({
        specimen: s.key, lambda, E0: src.E0, lambda0: s.key === "oscillator" ? lambda0 : null,
        T: r.T ?? null, R: r.R ?? null, A: r.A ?? null, alpha: r.alpha ?? null, absorbance: r.absorbance ?? null,
        boneT: r.boneT ?? null, contrast: r.contrast ?? null, source: r.source, response: pickResponse(r),
      });
    }
  }
  // Without a source (WATER's heating falls back to I = 0) and with OSCILLATOR's defaults.
  for (const lambda of [550e-9, K.C / 2.45e9, 120e-9]) for (const s of SP.SPECIMENS) {
    const r = s.evaluate(lambda);
    cases.push({ specimen: s.key, lambda, E0: null, lambda0: null, T: r.T ?? null, R: r.R ?? null, A: r.A ?? null, alpha: r.alpha ?? null, absorbance: r.absorbance ?? null, boneT: r.boneT ?? null, contrast: r.contrast ?? null, source: r.source, response: pickResponse(r) });
  }
  add("specimens", "SPECIMENS[i].evaluate(λ, defaultSource({lambda, E0}), {lambda0}) for all seven specimens at ~210 wavelengths. Absent fields are null. lambda0 applies to the oscillator only; E0 null means no source was passed.", cases);
}
{
  const cases = [];
  for (let i = 0; i < 200; i++) { const lambda = i < 150 ? lambdaAnywhere() : pick(BOUNDARY_LAMBDAS); cases.push({ lambda, ...SP.waterAlpha(lambda) }); }
  add("waterAlpha", "waterAlpha(λ) → {alpha 1/cm, source} stitched across XCOM, Segelstein and the bridge.", cases);
}
{
  const cases = [];
  for (let i = 0; i < 60; i++) {
    const lambda = i < 45 ? lambdaAnywhere() : pick(BOUNDARY_LAMBDAS), src = W.defaultSource({ lambda, E0: logUniform(1, 1e4) });
    cases.push({ lambda, E0: src.E0, series: SP.inSeries(lambda, src) });
  }
  add("inSeries", "inSeries(λ, src) → [{key, before, after}] across all seven specimens.", cases);
}
{
  const cases = [];
  for (let nm = 140; nm <= 420; nm += 2) cases.push({ lambda: nm * 1e-9, A: SP.dnaAbsorbance(nm * 1e-9) });
  for (let i = 0; i < 60; i++) { const lambda = logUniform(100e-9, 1e-5); cases.push({ lambda, A: SP.dnaAbsorbance(lambda) }); }
  add("dnaAbsorbance", "dnaAbsorbance(λ), two-Gaussian DNA band (no in-band gate; DNA.evaluate applies 150–400 nm).", cases);
}

// ===================================================================================== samples
{
  const cases = [];
  for (const s of SA.SAMPLES) for (const mode of s.modes) {
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const x = s.axis.kind === "lambda-log" ? s.axis.from * Math.pow(s.axis.to / s.axis.from, u) : s.axis.from + (s.axis.to - s.axis.from) * u;
      cases.push({ sample: s.key, mode, u, x, value: s.value(x, mode), toLambda: s.toLambda(x, mode) });
    }
  }
  const co2 = SA.SAMPLES.find((s) => s.key === "co2");
  for (const mode of co2.modes) for (const x of [1388.2, 1285.4, 667.4, 2349.1, 3716, 3609]) cases.push({ sample: "co2", mode, u: null, x, value: co2.value(x, mode), toLambda: co2.toLambda(x, mode) });
  add("samples", "SAMPLES[i].value(x, mode) and toLambda(x, mode) on the 201-point axis grid (u = i/200, geometric for lambda-log, linear otherwise) for every sample and mode, plus CO2 band centres (u null).", cases);
}
{
  const cases = [];
  for (const mode of ["emission", "absorption"]) cases.push({ mode, lines: SA.hydrogenLines(mode) });
  add("hydrogenLines", "hydrogenLines(mode): every line with lambda, series, n1, n2 and normalized strength.", cases);
}
{
  const cases = [];
  for (let n1 = 1; n1 <= 6; n1++) for (let n2 = n1 + 1; n2 <= n1 + 14; n2++) cases.push({ n1, n2, lambda: SA.hydrogenLine(n1, n2) });
  add("hydrogenLine", "hydrogenLine(n1, n2), reduced-mass Rydberg.", cases);
}
{
  const cases = [];
  for (const B0 of [1.41, 9.4, 1, 0]) for (const ppm of [0, 1.22, 2.61, 3.69, -0.3, 4.5]) cases.push({ B0, ppm, f: SA.larmor(B0, ppm) });
  for (let i = 0; i < 40; i++) { const B0 = uniform(0, 25), ppm = uniform(-5, 15); cases.push({ B0, ppm, f: SA.larmor(B0, ppm) }); }
  cases.push({ B0: 9.4, ppm: null, f: SA.larmor(9.4) });
  add("larmor", "larmor(B0 T, ppm) in Hz (ppm null = default 0).", cases);
}

// ===================================================================================== state & presets
const sourceFields = (s) => ({ enabled: s.enabled, kind: s.kind, lambda: s.lambda, E0: s.E0, theta: s.theta, delta: s.delta, phi: s.phi, cycles: s.cycles, temperature: s.temperature });
{
  const cases = [];
  const inputs = [
    W.defaultSource({ lambda: 1e9, E0: -5, delta: 270 }), W.defaultSource({ lambda: 0 }), W.defaultSource({ lambda: 1e-20 }),
    W.defaultSource({ delta: 180 }), W.defaultSource({ delta: -180 }), W.defaultSource({ delta: 540 }), W.defaultSource({ delta: -181 }),
    W.defaultSource({ phi: 360 }), W.defaultSource({ phi: -30 }), W.defaultSource({ phi: 725 }), W.defaultSource({ theta: 120, cycles: 0, temperature: 0 }),
    W.defaultSource({ theta: -91, cycles: 13, temperature: 1e9, E0: 1e20 }), W.defaultSource({ kind: "thermal", temperature: 310 }),
    W.defaultSource({ kind: "thermal", temperature: 0.5, lambda: 1 }), W.defaultSource({ kind: "thermal", temperature: 2e8 }),
  ];
  for (let i = 0; i < 60; i++) {
    inputs.push(W.defaultSource({
      enabled: rand() < 0.7, kind: pick(["plane", "pulse", "thermal"]), lambda: 10 ** uniform(-16, 6), E0: pick([uniform(-10, 10), 10 ** uniform(-9, 18)]),
      theta: uniform(-400, 400), delta: uniform(-1000, 1000), phi: uniform(-1000, 1000), cycles: uniform(-5, 30), temperature: pick([uniform(-10, 1), 10 ** uniform(-1, 10)]),
    }));
  }
  for (const input of inputs) cases.push({ input: sourceFields(input), output: sourceFields(ST.sanitize(clone(input))) });
  add("sanitize", "sanitize(source): lambda via 10^clamp(log10 λ), E0, theta and cycles clamps, delta wrapped to [-180, 180), phi to [0, 360), temperature clamp, thermal λ = Wien peak. NaN inputs deliberately excluded (see port plan).", cases);
}
{
  const cases = [];
  const keys = ["lambda", "E0", "temperature", "theta", "delta", "phi", "cycles", "kind", "enabled"];
  const valueFor = (key) => ({
    lambda: lambdaAnywhere(), E0: logUniform(1e-3, 1e10), temperature: logUniform(1, 1e7), theta: uniform(-120, 120), delta: uniform(-400, 400),
    phi: uniform(-400, 400), cycles: uniform(0, 14), kind: pick(["plane", "pulse", "thermal"]), enabled: rand() < 0.5,
  })[key];
  for (let i = 0; i < 80; i++) {
    const state = ST.defaults();
    state.sources = state.sources.map((s, j) => ST.sanitize({ ...randomSource({ kind: rand() < 0.8 ? "plane" : pick(["pulse", "thermal"]) }), enabled: j === 0 || rand() < 0.6 }));
    state.active = Math.floor(rand() * 3);
    state.link = rand() < 0.6;
    const key = i < 9 ? keys[i] : pick(keys), value = valueFor(key);
    const before = state.sources.map(sourceFields);
    ST.editSource(state, key, value);
    cases.push({ link: state.link, active: state.active, key, value, before, after: state.sources.map(sourceFields) });
  }
  // The suite's own chord case.
  {
    const s = ST.defaults(); s.sources[1].enabled = true; s.link = true;
    const before = s.sources.map(sourceFields);
    ST.editSource(s, "lambda", 1100e-9);
    cases.push({ link: true, active: 0, key: "lambda", value: 1100e-9, before, after: s.sources.map(sourceFields) });
  }
  add("editSource", "editSource(state, key, value): with link, ratio keys (lambda, E0, temperature) scale, shift keys (theta, delta, phi) add, other keys copy the value to every target; targets are enabled sources plus the active one; each target is sanitized.", cases);
}
{
  const cases = [];
  for (let i = 0; i < 40; i++) {
    const state = ST.defaults();
    state.sources = state.sources.map((s, j) => ST.sanitize({ ...randomSource(), enabled: rand() < 0.5 }));
    state.speed = pick([1, 0.25, uniform(0.05, 4)]);
    cases.push({ speed: state.speed, sources: state.sources.map(sourceFields), timeScale: ST.timeScale(state), slowMotion: ST.slowMotion(state), enabled: ST.enabledSources(state).map((s) => state.sources.indexOf(s)) });
  }
  add("timeScale", "timeScale(state), slowMotion(state), enabledSources(state) (indices). Reference is the first enabled source, else sources[0].", cases);
}
{
  const cases = [];
  const full = ST.serialize(ST.defaults());
  const partial = JSON.stringify({ sources: [{ lambda: 1e-3 }, { enabled: true, E0: 5, delta: 270 }, { kind: "thermal", temperature: 310 }], active: 2.7, lab: { sweeping: true, sample: "nmr" }, scope: { zoom: 2 } });
  const inputs = [
    "not json", "null", "{}", "[]", JSON.stringify({ sources: [{}, {}] }), full, partial,
    JSON.stringify({ sources: [{}, {}, {}], active: -1 }), JSON.stringify({ sources: [{}, {}, {}], active: "2" }),
    JSON.stringify({ sources: [{}, {}, {}], active: 7, medium: "water", instrument: "lab", speed: 3 }),
  ];
  for (const text of inputs) cases.push({ text, state: ST.deserialize(text) });
  add("deserialize", "deserialize(text) → full state (garbage falls back to defaults; sources sanitized; lab.sweeping forced false; active = clamp(active | 0, 0, 2)).", cases);
}
{
  const cases = [];
  const modified = ST.defaults();
  modified.link = true; modified.active = 2; modified.medium = "water"; modified.speed = 0.5;
  modified.sources[1].enabled = true; modified.sources[2].enabled = true;
  modified.decompose.polarizer = 77; modified.lab.sweeping = true; modified.bench.lambda0 = 300e-9;
  for (const base of [["defaults", ST.defaults()], ["modified", modified]]) {
    for (const p of [...PR.PRESETS.map((x) => x.key), "no-such-preset"]) {
      cases.push({ base: base[0], key: p, state: PR.applyPreset(clone(base[1]), p) });
    }
  }
  add("applyPreset", "applyPreset(state, key) for all 14 presets on defaults() and on a modified state (link on, active 2, water medium, lab sweeping), plus an unknown key (state returned unchanged).", cases);
}

// ===================================================================================== display layer (src/ui/fieldview.js)
{
  const cases = [];
  const states = [];
  const mk = (name, f) => { const s = ST.defaults(); f(s); states.push([name, s]); };
  mk("default", () => {});
  mk("prism", (s) => Object.assign(s, PR.applyPreset(s, "prism")));
  mk("thermal", (s) => Object.assign(s, PR.applyPreset(s, "thermal")));
  mk("circular", (s) => Object.assign(s, PR.applyPreset(s, "circular")));
  mk("pulse", (s) => { s.sources[0] = ST.sanitize(W.defaultSource({ kind: "pulse", cycles: 3, lambda: 800e-9 })); });
  mk("chord-water", (s) => { s.sources.forEach((x) => (x.enabled = true)); s.medium = "water"; });
  mk("oven-water", (s) => { s.sources[0] = ST.sanitize(W.defaultSource({ lambda: K.C / 2.45e9, E0: 5000 })); s.medium = "water"; });
  mk("far-ratio", (s) => { s.sources[1] = ST.sanitize(W.defaultSource({ lambda: 550e-9 * 30 })); s.sources[2] = ST.sanitize(W.defaultSource({ lambda: 550e-9 / 2 })); });
  mk("none-enabled", (s) => { s.sources.forEach((x) => (x.enabled = false)); });
  for (const [name, state] of states) {
    const ds = FV.displaySources(state);
    const summary = {
      ref: ds.ref.lambda, inMedium: ds.inMedium,
      list: ds.list.map((d) => ({ index: d.index, scale: d.scale, color: d.color, tag: d.tag, hidden: d.hidden, jones: d.jones, comps: d.comps })),
      hiddenNote: FV.hiddenNote(ds),
    };
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const z = uniform(-1.6, 1.6), t = uniform(0, 5), speed = pick([state.speed, uniform(0.1, 3)]);
      const only = i % 5 === 4 && ds.list.length ? ds.list[Math.floor(rand() * ds.list.length)].index : null;
      samples.push({ z, t, speed, only, ...FV.fieldAt(ds, z, t, speed, only) });
    }
    cases.push({ name, state: { sources: state.sources.map(sourceFields), medium: state.medium, speed: state.speed }, displaySources: summary, fieldAt: samples });
  }
  add("fieldview", "UI layer, not core: displaySources(state) and fieldAt(ds, z, t, speed, only) for nine states. z is in reference wavelengths, t is screen seconds; returns {ex, ey, n}.", cases);
}

// ===================================================================================== write
const sourceHash = (() => {
  const h = createHash("sha256");
  for (const dir of ["src/core", "src/data"]) for (const f of readdirSync(join(root, dir)).sort()) h.update(f).update(readFileSync(join(root, dir, f)));
  h.update("src/ui/fieldview.js").update(readFileSync(join(root, "src/ui/fieldview.js")));
  return h.digest("hex");
})();
const counts = Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, v.cases.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const doc = clean({
  meta: {
    generator: "tests/parity/generate.mjs",
    seed: SEED,
    rng: "seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; u = seed / 2^32",
    sourceSha256: sourceHash,
    sourceFiles: "sha256 over src/core/*, src/data/* (sorted, name then bytes) and src/ui/fieldview.js",
    encoding: "Numbers are JSON doubles; non-finite numbers are the strings Infinity, -Infinity, NaN; -0 is written as 0; JS null stays null.",
    tolerance: "Suggested (measured Swift vs V8 worst case is ~2 ulp per libm call): exact for strings, keys, booleans, counts, null-ness and pure + - * / sqrt results; relative 1e-12 for single-expression results; max(1e-10 relative, 1e-13 absolute) for chained results (specimens, media, samples, inSeries, fieldview); 1e-12 * max(1, a^2) absolute for electronTrajectory; skip ellipse.orientation when kind is circular (numerical noise).",
    counts, total,
  },
  ...cat,
});
const text = JSON.stringify(doc) + "\n";
if (process.argv.includes("--check")) {
  const existing = readFileSync(OUT, "utf8");
  if (existing !== text) { console.error("vectors.json is stale: run node tests/parity/generate.mjs"); process.exit(1); }
  console.log(`vectors.json is current (${total} cases)`);
} else {
  mkdirSync(here, { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}\n${(text.length / 1024).toFixed(0)} KiB, ${total} cases`);
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${n}`);
}
