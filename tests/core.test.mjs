import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as K from "../src/core/constants.js";
import * as S from "../src/core/spectrum.js";
import * as W from "../src/core/wave.js";
import * as M from "../src/core/matter.js";
import * as SP from "../src/core/specimens.js";
import { SAMPLES, hydrogenLine, larmor } from "../src/core/samples.js";
import * as ST from "../src/core/state.js";
import { PRESETS, applyPreset } from "../src/core/presets.js";
import { XCOM } from "../src/data/xcom.js";

const ref = JSON.parse(readFileSync(new URL("./fixtures/reference.json", import.meta.url), "utf8"));
const near = (a, b, eps, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b} (±${eps})`);
const inRange = (v, [lo, hi], msg = "") => assert.ok(v >= lo && v <= hi, `${msg} ${v} not in [${lo}, ${hi}]`);
let seed = 4242;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test("constants and unit conversions", () => {
  near(K.HC_EV_M * 1e9, ref.energy.hc_eV_nm, 1e-4);
  near(K.EV_TO_KCAL_PER_MOL, ref.energy.eV_to_kcal_per_mol, 1e-3);
  near(K.EV_TO_KJ_PER_MOL, ref.energy.eV_to_kJ_per_mol, 1e-3);
  for (let i = 0; i < 2000; i++) {
    const l = 10 ** (S.LOG_MIN + rand() * (S.LOG_MAX - S.LOG_MIN));
    near(S.wavelength(S.frequency(l)) / l, 1, 1e-12);
    near(S.wavelengthFromEV(S.photonEV(l)) / l, 1, 1e-12);
    near(S.fromWavenumber(S.wavenumber(l)) / l, 1, 1e-12);
  }
  near(S.photonEV(550e-9), 2.2543, 1e-4);
  near(S.wavelengthFromEV(K.IONIZING_EV) * 1e9, 123.98, 0.01);
});

test("bands, detents and formatting", () => {
  assert.equal(S.bandAt(550e-9).key, "visible");
  assert.equal(S.bandAt(399.9e-9).key, "uv");
  assert.equal(S.bandAt(700e-9).key, "ir");
  assert.equal(S.bandAt(0.5).key, "microwave");
  assert.equal(S.bandAt(3).key, "radio");
  assert.equal(S.bandAt(5e-12).key, "gamma");
  assert.equal(S.ionizationClass(100e-9).key, "ionizing");
  assert.equal(S.ionizationClass(254e-9).key, "bond");
  assert.equal(S.ionizationClass(550e-9).key, "none");
  assert.equal(S.crossedDetents(Math.log10(800e-9), Math.log10(500e-9)).length, 1);
  assert.equal(S.crossedDetents(Math.log10(500e-9), Math.log10(500e-9)).length, 0);
  assert.equal(S.formatLength(550e-9), "550 nm");
  assert.equal(S.formatLength(0.12236), "12.2 cm");
  assert.equal(S.formatFrequency(545.1e12), "545 THz");
  assert.equal(S.formatEnergy(60000), "60.0 keV");
  assert.match(S.displayColor(550e-9), /^#[0-9a-f]{6}$/);
  assert.equal(S.nearestComparison(1.2e-2).label, "a bee");
});

test("hydrogen lines match NIST vacuum wavelengths", () => {
  const h = ref.hydrogen_vacuum_nm;
  near(hydrogenLine(1, 2) * 1e9, h.lyman_alpha, 0.005, "Lyα");
  near(hydrogenLine(2, 3) * 1e9, h.h_alpha, 0.02, "Hα");
  near(hydrogenLine(2, 4) * 1e9, h.h_beta, 0.01, "Hβ");
  near(hydrogenLine(2, 5) * 1e9, h.h_gamma, 0.01, "Hγ");
  near(hydrogenLine(2, 6) * 1e9, h.h_delta, 0.01, "Hδ");
  const abs = SAMPLES.find((s) => s.key === "hydrogen").lines("absorption");
  assert.ok(abs.length > 0 && abs.every((l) => l.series === "Lyman"));
});

test("refractive indices match catalogue values", () => {
  const r = ref.refractive_index;
  near(M.MEDIA.glass.index(587.56e-9).n, r.bk7_d_587_56, 1e-4, "BK7 d");
  near(M.MEDIA.glass.index(486.13e-9).n, r.bk7_F_486_13, 1e-4, "BK7 F");
  near(M.MEDIA.glass.index(656.27e-9).n, r.bk7_C_656_27, 1e-4, "BK7 C");
  near(M.MEDIA.silica.index(587.56e-9).n, r.silica_d_587_56, 1e-4, "silica");
  near(M.MEDIA.diamond.index(589.3e-9).n, r.diamond_589_3, 1e-3, "diamond");
  near(M.MEDIA.water.index(589e-9).n, r.water_589, 1e-3, "water");
  assert.equal(M.MEDIA.glass.index(5e-6).valid, false);
});

test("NIST attenuation interpolation reproduces table points and edges", () => {
  for (const [key, mat] of Object.entries(XCOM)) {
    for (let i = 0; i < mat.rows.length; i++) {
      const [e, mu] = mat.rows[i];
      const isLowerEdgeRow = i + 1 < mat.rows.length && mat.rows[i + 1][0] === e;
      if (isLowerEdgeRow) continue; // at an edge the upper value applies
      near(M.massAttenuation(key, e * 1e6) / mu, 1, 1e-9, `${key} @ ${e} MeV`);
    }
    for (let i = 1; i < mat.rows.length; i++) {
      const [e0, m0] = mat.rows[i - 1], [e1, m1] = mat.rows[i];
      if (e1 === e0) continue;
      const v = M.massAttenuation(key, Math.sqrt(e0 * e1) * 1e6);
      inRange(v, [Math.min(m0, m1) * (1 - 1e-12), Math.max(m0, m1) * (1 + 1e-12)], key);
    }
  }
  assert.ok(M.massAttenuation("lead", 88.0045e3) > 4 * M.massAttenuation("lead", 88.0e3), "lead K edge");
  assert.equal(M.massAttenuation("water", 1), null);
});

test("water absorption across the spectrum", () => {
  const w = ref.water_absorption_per_cm;
  near(M.waterAbsorption(550e-9), w["550nm"], 1e-9);
  near(M.waterAbsorption(10e-6), w["10um"], 1e-6);
  inRange(1 / M.waterAbsorption(299792458 / 2.45e9), w.penetration_2_45GHz_cm, "2.45 GHz depth");
  const debye = M.MEDIA.water.index(299792458 / 2.45e9);
  inRange(1 / M.absorptionFromK(debye.k, 299792458 / 2.45e9), w.penetration_2_45GHz_cm, "Debye depth");
});

test("Lorentz oscillator: in step below, quarter cycle on, opposite above", () => {
  const w0 = 1, g = 0.1;
  near(M.oscillatorResponse(1e-4, w0, g).lag, 0, 0.01);
  near(M.oscillatorResponse(1, w0, g).lag, 90, 1e-9);
  near(M.oscillatorResponse(1e3, w0, g).lag, 180, 0.01);
  near(M.oscillatorResponse(1, w0, g).power, 1, 1e-12);
  const eps = M.lorentzEpsilon(0.5, [{ w0: 1, wp: 1, gamma: 0 }]);
  near(eps.re, 1 + 1 / 0.75, 1e-12);
});

test("polarization: Malus, circular light and ellipse classification", () => {
  for (let i = 0; i < 500; i++) {
    const theta = rand() * 180 - 90, alpha = rand() * 180;
    const src = W.defaultSource({ theta, delta: 0 });
    near(W.polarizerTransmission(src, alpha), Math.cos(((alpha - theta) * Math.PI) / 180) ** 2, 1e-12);
    const circ = W.defaultSource({ theta: 45, delta: 90 });
    near(W.polarizerTransmission(circ, alpha), 0.5, 1e-12);
  }
  assert.equal(W.ellipse(W.defaultSource({ theta: 30, delta: 0 })).kind, "linear");
  near(W.ellipse(W.defaultSource({ theta: 30, delta: 0 })).orientation, 30, 1e-9);
  assert.equal(W.ellipse(W.defaultSource({ theta: 45, delta: 90 })).kind, "circular");
  assert.equal(W.ellipse(W.defaultSource({ theta: 45, delta: 40 })).kind, "elliptical");
  near(W.peakB(1000), 1000 / K.C, 1e-18);
  near(W.intensity(1000), 1327.2, 0.1);
});

test("free electron in a plane wave follows the exact solution", () => {
  const src = W.defaultSource({ theta: 0, delta: 0 });
  for (const a of [0.1, 1, 2, 5]) {
    const pts = W.electronTrajectory(src, a, "both", 1, 4000);
    for (const p of pts.filter((_, i) => i % 97 === 0)) {
      near(p.x, a * (1 - Math.cos(p.eta)), 1e-5 * Math.max(1, a), "x");
      near(p.z, ((a * a) / 4) * (p.eta - Math.sin(2 * p.eta) / 2), 1e-5 * Math.max(1, a * a), "z");
      near(p.gamma - p.uz, 1, 1e-12, "light-front invariant");
    }
    const end = pts[pts.length - 1];
    near(end.z / end.t, W.driftSpeed(a), 1e-6, "drift");
  }
  const e = W.electronTrajectory(src, 2, "electric", 1, 400);
  assert.ok(e.every((p) => p.z === 0));
  const b = W.electronTrajectory(src, 2, "magnetic", 1, 400);
  assert.ok(b.every((p) => p.x === 0 && p.y === 0 && p.z === 0));
  near(W.a0(W.fieldForA0(2, 800e-9), 800e-9), 2, 1e-12);
});

test("Planck spectrum peaks where Wien says", () => {
  for (const T of [2.725, 310, 5772]) {
    let best = 0, bestL = 0;
    const peak = W.wienPeak(T);
    for (let i = 0; i <= 20000; i++) {
      const l = peak * Math.pow(10, -0.3 + (0.6 * i) / 20000);
      const v = W.planckLambda(l, T);
      if (v > best) { best = v; bestL = l; }
    }
    near(bestL / peak, 1, 2e-4, `T=${T}`);
  }
  near(W.wienPeak(310) * 1e6, ref.wien_peak_310K_um, 1e-3);
  const comps = W.components(W.defaultSource({ kind: "pulse", cycles: 3 }));
  near(comps.reduce((s, c) => s + c.amp, 0), 1, 1e-12);
});

test("specimens stay physical across all sixteen decades", () => {
  const src = W.defaultSource();
  for (let lg = S.LOG_MIN; lg <= S.LOG_MAX; lg += 0.005) {
    const l = 10 ** lg;
    for (const s of SP.SPECIMENS) {
      const r = s.evaluate(l, src);
      for (const k of ["T", "R", "A"]) if (k in r) inRange(r[k], [-1e-12, 1 + 1e-12], `${s.key}.${k} @ ${l}`);
      if ("T" in r && "R" in r && "A" in r) near(r.T + r.R + r.A, 1, 1e-9, s.key);
      assert.ok(r.source === "table" || r.source === "model");
      assert.ok(r.response.text.length > 10);
    }
  }
});

test("specimen anchors: DNA, zinc, glass, antenna, finger", () => {
  const d = ref.dna;
  const A260 = SP.dnaAbsorbance(260e-9);
  near(A260, d.a260, 0.02, "A260");
  inRange(A260 / SP.dnaAbsorbance(280e-9), d.ratio_280, "260/280");
  inRange(A260 / SP.dnaAbsorbance(230e-9), d.ratio_230, "260/230");
  assert.equal(SP.ZINC_PLATE.evaluate(650e-9).response.eject, null);
  near(SP.ZINC_PLATE.evaluate(254e-9).response.eject.keMax, S.photonEV(254e-9) - ref.zinc_work_function_eV, 1e-12);
  assert.ok(SP.ZINC_PLATE.evaluate(650e-9).R > 0.9, "metal mirror");
  inRange(SP.GLASS.evaluate(550e-9).T, [0.9, 0.93], "glass visible");
  assert.ok(SP.GLASS.evaluate(254e-9).T < 0.01, "glass UV-C");
  near(SP.ANTENNA.evaluate(299792458 / 100e6).response.value, 1, 1e-12);
  assert.ok(SP.ANTENNA.evaluate(299792458 / 300e6).response.value >= 0.5);
  assert.ok(SP.ANTENNA.evaluate(299792458 / 200e6).response.value < 0.2);
  const x = SP.HAND.evaluate(S.wavelengthFromEV(60e3));
  assert.equal(x.source, "table");
  assert.ok(x.contrast > 0.25, `bone contrast ${x.contrast}`);
  const heat = SP.WATER.evaluate(299792458 / 2.45e9, W.defaultSource({ E0: 5000 })).response.heating;
  inRange(heat, [10, 200], "oven heating K/min");
});

test("lab samples are finite and map to wavelengths", () => {
  near(larmor(9.4) / 1e6, ref.nmr.larmor_9_4T_MHz, 0.01);
  for (const s of SAMPLES) for (const mode of s.modes) {
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const x = s.axis.kind === "lambda-log" ? s.axis.from * Math.pow(s.axis.to / s.axis.from, u) : s.axis.from + (s.axis.to - s.axis.from) * u;
      assert.ok(Number.isFinite(s.value(x, mode)), `${s.key}/${mode}`);
      const l = s.toLambda(x, mode);
      assert.ok(l > 0 && Number.isFinite(l));
    }
  }
  const co2 = SAMPLES.find((s) => s.key === "co2");
  assert.ok(co2.value(1388.2, "ir") < 0.01, "symmetric stretch is IR-inactive");
  assert.ok(co2.value(1388.2, "raman") > 0.9, "but Raman-active");
});

test("state: link keeps chords, sanitize clamps, presets apply cleanly", () => {
  const s = ST.defaults();
  s.sources[1].enabled = true;
  s.link = true;
  ST.editSource(s, "lambda", 1100e-9);
  near(s.sources[1].lambda / s.sources[0].lambda, 450 / 550, 1e-12);
  ST.editSource(s, "theta", 30);
  near(s.sources[1].theta, 30, 1e-12);
  const bad = ST.sanitize(W.defaultSource({ lambda: 1e9, E0: -5, delta: 270 }));
  assert.equal(bad.lambda, 10 ** S.LOG_MAX);
  assert.equal(bad.delta, -90);
  assert.deepEqual(ST.deserialize("not json").sources.length, 3);
  for (const p of PRESETS) {
    const next = applyPreset(ST.defaults(), p.key);
    assert.ok(next.sources.every((x) => Number.isFinite(x.lambda) && x.lambda > 0), p.key);
    assert.ok(ST.INSTRUMENTS.some((i) => i.key === next.instrument), p.key);
  }
  const t = ST.defaults();
  near(ST.slowMotion(t), S.frequency(550e-9), 1);
});
