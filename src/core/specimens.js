// The Matter bench: six specimens and one idealized oscillator, each answering "what happens to this
// beam?" at any wavelength. Results carry their provenance ("table" or "model").
import { C, PAIR_THRESHOLD_EV } from "./constants.js";
import { photonEV, bandAt } from "./spectrum.js";
import { intensity } from "./wave.js";
import {
  linearAttenuation, waterAbsorption, oscillatorResponse, drudeEpsilon, indexFromEpsilon, absorptionFromK,
  normalReflectance, slab, anchors, bridge, MEDIA, ZINC, WORK_FUNCTIONS, XCOM_LAMBDA_MAX, XCOM_MAX_EV,
} from "./matter.js";

const TAU = 2 * Math.PI;
const SEG_MIN = 10e-9; // first Segelstein point
const xray = (lambda) => lambda <= XCOM_LAMBDA_MAX && photonEV(lambda) <= XCOM_MAX_EV;

// Attenuation of water at any wavelength, 1/cm, with provenance.
export function waterAlpha(lambda) {
  if (xray(lambda)) return { alpha: linearAttenuation("water", photonEV(lambda)), source: "table" };
  const a = waterAbsorption(lambda);
  if (a != null) return { alpha: a, source: "table" };
  if (lambda < SEG_MIN && lambda > XCOM_LAMBDA_MAX) {
    return { alpha: bridge(lambda, SEG_MIN, waterAbsorption(SEG_MIN), XCOM_LAMBDA_MAX, linearAttenuation("water", 1e3)), source: "model" };
  }
  return { alpha: linearAttenuation("water", Math.min(photonEV(lambda), XCOM_MAX_EV)) ?? 0, source: "model" };
}

function highEnergyNote(lambda) {
  const ev = photonEV(lambda);
  if (ev >= PAIR_THRESHOLD_EV) return "Above 1.022 MeV a photon near a nucleus can become an electron–positron pair.";
  if (ev >= 1e5) return "Mostly Compton scattering: photons bounce off electrons and lose energy.";
  return "Photoabsorption: the photon is swallowed and an inner electron is knocked out.";
}

// ---------------------------------------------------------------------------------------------
export const OSCILLATOR = {
  key: "oscillator",
  name: "Charge on a spring",
  sub: "The model behind every material",
  evaluate(lambda, src, opts = {}) {
    const lambda0 = opts.lambda0 ?? 120e-9, Q = opts.Q ?? 8;
    const w = (TAU * C) / lambda, w0 = (TAU * C) / lambda0;
    const r = oscillatorResponse(w, w0, w0 / Q);
    const where = lambda > lambda0 * 1.15 ? "below" : lambda < lambda0 / 1.15 ? "above" : "on";
    const text = {
      below: "Driven below its resonance, the charge follows the field in step. That only slows the wave, which is the origin of the refractive index.",
      on: "On resonance it swings hardest, a quarter cycle behind the field, and absorbs energy.",
      above: "Driven far above resonance, it can't keep up: tiny motion, half a cycle behind. The wave passes almost untouched.",
    }[where];
    return { source: "model", response: { kind: "spring", amplitude: r.amplitude, lag: r.lag, power: r.power, text, where } };
  },
};

// Half-wave dipole tuned to 100 MHz; odd harmonics also resonate. Q ≈ 8 (illustrative).
export const ANTENNA = {
  key: "antenna",
  name: "FM dipole antenna",
  sub: "1.5 m, tuned to 100 MHz",
  evaluate(lambda) {
    const f = C / lambda, f0 = 100e6, Q = 8;
    let current = 0;
    for (const [n, w] of [[1, 1], [3, 0.55], [5, 0.4]]) {
      const fn = n * f0, x = Q * (f / fn - fn / f);
      current = Math.max(current, w / Math.sqrt(1 + x * x));
    }
    const band = bandAt(lambda).key;
    const text = current > 0.5
      ? `Resonant: half a wavelength fits the rods, so electrons slosh end to end and drive a current.`
      : band === "radio" || band === "microwave"
        ? "Off resonance: the field pushes electrons, but the rods are the wrong length to build a current."
        : "Far too short a wave: the rods are just a metal surface that reflects it.";
    return { source: "model", response: { kind: "current", value: current, text } };
  },
};

export const WATER = {
  key: "water",
  name: "Water",
  sub: "1 cm deep",
  evaluate(lambda, src) {
    const { alpha, source } = waterAlpha(lambda);
    const d = 1;
    const T = Math.exp(-alpha * d);
    // Heating at the front face: absorbed power density α·I over ρ·c_p (4.18 J/cm^3/K).
    const I = src ? intensity(src.E0) : 0; // W/m^2
    const heating = ((alpha * 100 * I) / 4.18e6) * 60; // K per minute
    const band = bandAt(lambda).key;
    const text = {
      radio: "Molecules turn to follow the field but lag behind it, so a little energy turns to heat.",
      microwave: "Water molecules twist after the field and lag behind it (Debye relaxation), so the water heats.",
      ir: "Bonds stretch and bend in resonance, and water absorbs most infrared in a fraction of a millimetre.",
      visible: "Nearly transparent. Red is absorbed slightly more than blue, which is why deep water looks blue.",
      uv: lambda < 180e-9 ? "Electrons in the molecule absorb it within micrometres." : "Mostly transparent until the deep UV.",
      xray: highEnergyNote(lambda),
      gamma: highEnergyNote(lambda),
    }[band];
    return { T, R: 0, A: 1 - T, alpha, source, response: { kind: band === "microwave" || band === "radio" ? "twist" : band === "ir" ? "stretch" : "pass", heating, text } };
  },
};

// Borosilicate sheet. Optical absorption follows typical 3 mm transmission curves (model anchors);
// X-ray/gamma from NIST Pyrex; reflection from BK7 Sellmeier in the visible.
const GLASS_ALPHA = [ // [λ m, α 1/cm]
  [100e-9, 4e5], [200e-9, 100], [260e-9, 30], [280e-9, 5], [300e-9, 1.5], [320e-9, 0.4], [350e-9, 0.05],
  [400e-9, 0.004], [2.0e-6, 0.004], [2.7e-6, 0.5], [3.0e-6, 0.3], [3.5e-6, 0.6], [4.0e-6, 2], [4.5e-6, 8],
  [5e-6, 30], [6e-6, 300], [9e-6, 5000], [20e-6, 2000], [100e-6, 100], [1e-3, 3], [1e-2, 0.1], [0.1, 0.01], [1, 0.001], [1e3, 1e-6],
];
export const GLASS = {
  key: "glass",
  name: "Window glass",
  sub: "Borosilicate, 3 mm",
  evaluate(lambda) {
    if (xray(lambda)) {
      const T = Math.exp(-linearAttenuation("pyrex", photonEV(lambda)) * 0.3);
      return { T, R: 0, A: 1 - T, source: "table", response: { kind: "pass", text: highEnergyNote(lambda) } };
    }
    const alpha = lambda < 100e-9 ? bridge(lambda, 100e-9, 4e5, XCOM_LAMBDA_MAX, linearAttenuation("pyrex", 1e3)) : anchors(GLASS_ALPHA, lambda);
    const n = MEDIA.glass.index(lambda).n;
    const r = slab(normalReflectance(n), alpha, 0.3);
    const band = bandAt(lambda).key;
    const text = band === "visible" ? "Clear: its electrons resonate in the UV and its atoms in the IR, leaving a window for visible light."
      : band === "uv" ? "Blocked: the wave is close to the glass's electronic resonance, so it is absorbed."
      : band === "ir" ? (lambda > 5e-6 ? "Opaque: the silicon–oxygen lattice vibrates in resonance and soaks it up." : "Mostly clear in the near infrared.")
      : "Passes: glass has no free electrons to stop it; a little reflects at each face.";
    return { ...r, alpha, source: "model", response: { kind: r.T > 0.5 ? "pass" : "absorb", text } };
  },
};

// Zinc plate, 1 mm: free-electron reflection, photoelectric threshold, NIST attenuation for X-rays.
export const ZINC_PLATE = {
  key: "zinc",
  name: "Zinc plate",
  sub: "1 mm",
  evaluate(lambda) {
    const ev = photonEV(lambda), phi = WORK_FUNCTIONS.zinc;
    const eject = ev > phi ? { keMax: ev - phi } : null;
    const ejectText = eject ? `Photons above the ${phi} eV work function knock electrons out, at up to ${eject.keMax < 1e3 ? eject.keMax.toFixed(2) + " eV" : (eject.keMax / 1e3).toFixed(1) + " keV"}.` : `Below the ${phi} eV work function: no electrons come out, however bright the beam.`;
    if (xray(lambda)) {
      const T = Math.exp(-linearAttenuation("zinc", ev) * 0.1);
      return { T, R: 0, A: 1 - T, source: "table", response: { kind: "eject", eject, text: `${ejectText} ${highEnergyNote(lambda)}` } };
    }
    const w = (TAU * C) / lambda;
    const { n, k } = indexFromEpsilon(drudeEpsilon(w, ZINC.wp, ZINC.gamma));
    const r = slab(normalReflectance(n, k), absorptionFromK(k, lambda), 0.1);
    const mirror = r.R > 0.5 ? "Free electrons shake and re-radiate, so the metal reflects like a mirror. " : "";
    return { ...r, source: "model", response: { kind: eject ? "eject" : "reflect", eject, text: mirror + ejectText } };
  },
};

// dsDNA at 50 µg/mL in 1 cm of water: A260 = 1.00, A260/A280 ≈ 1.9, A260/A230 ≈ 2.2 (two Gaussian bands).
export function dnaAbsorbance(lambda) {
  const nm = lambda * 1e9;
  return Math.exp(-((nm - 259) ** 2) / (2 * 18.6 ** 2)) + 2.3 * Math.exp(-((nm - 195) ** 2) / (2 * 15 ** 2));
}
export const DNA = {
  key: "dna",
  name: "DNA",
  sub: "50 µg/mL in 1 cm of water",
  evaluate(lambda, src) {
    const w = WATER.evaluate(lambda, src);
    const inBand = lambda > 150e-9 && lambda < 400e-9;
    const A = inBand ? dnaAbsorbance(lambda) : 0;
    const T = w.T * Math.pow(10, -A);
    const resonance = A > 0.3;
    const text = resonance
      ? "The bases absorb strongly near 260 nm. Neighbouring thymines can fuse into dimers, which is the damage behind sunburn."
      : inBand ? "DNA barely absorbs here." : "DNA is transparent here; the surrounding water decides what happens.";
    return { T, R: 0, A: 1 - T, absorbance: A, source: inBand ? "model" : w.source, response: { kind: resonance ? "dimer" : "pass", resonance, text } };
  },
};

// A finger: two paths through 3 cm, one all soft tissue, one with 1 cm of cortical bone.
// X-ray/gamma from NIST (ICRU-44 tissue and bone). Elsewhere a model: optical effective attenuation
// anchors for soft tissue (after Jacques 2013), microwave/RF from muscle permittivity (after Gabriel 1996),
// and 0.7 × water in the infrared.
const TISSUE_OPTICAL = [
  [200e-9, 500], [300e-9, 150], [400e-9, 60], [450e-9, 40], [500e-9, 25], [550e-9, 20], [600e-9, 8], [650e-9, 4],
  [700e-9, 3], [800e-9, 2.5], [900e-9, 2.6], [1000e-9, 3], [1200e-9, 4], [1450e-9, 25], [1700e-9, 8], [1940e-9, 60],
];
const TISSUE_RF = [[3e-2, 6], [0.1224, 0.9], [3, 0.26], [300, 0.025]];
function tissueAlpha(lambda) {
  if (xray(lambda)) return { alpha: linearAttenuation("tissue", photonEV(lambda)), source: "table" };
  if (lambda < 200e-9) return { alpha: bridge(lambda, 200e-9, 500, XCOM_LAMBDA_MAX, linearAttenuation("tissue", 1e3)), source: "model" };
  if (lambda <= 1940e-9) return { alpha: anchors(TISSUE_OPTICAL, lambda), source: "model" };
  if (lambda <= 3e-3) return { alpha: 0.7 * waterAlpha(lambda).alpha, source: "model" };
  if (lambda < 3e-2) return { alpha: bridge(lambda, 3e-3, 0.7 * waterAlpha(3e-3).alpha, 3e-2, 6), source: "model" };
  return { alpha: anchors(TISSUE_RF, lambda), source: "model" };
}
export const HAND = {
  key: "hand",
  name: "Finger",
  sub: "3 cm, with 1 cm of bone",
  evaluate(lambda) {
    const t = tissueAlpha(lambda);
    const softT = Math.exp(-t.alpha * 3);
    let boneT, source = t.source;
    if (xray(lambda)) boneT = Math.exp(-linearAttenuation("bone", photonEV(lambda)) * 1 - t.alpha * 2);
    else { boneT = Math.exp(-t.alpha * 1.2 * 1 - t.alpha * 2); source = "model"; }
    const contrast = softT > 1e-12 ? 1 - boneT / softT : 0;
    const band = bandAt(lambda).key;
    const text = band === "xray" ? (softT > 0.05 ? `Bone stops more than soft tissue, so its shadow shows ${Math.round(contrast * 100)}% darker.` : "Too soft: almost nothing gets through, so the film would be blank.")
      : band === "gamma" ? "Passes through bone and tissue almost alike, so there's little contrast."
      : band === "visible" ? (lambda > 600e-9 ? "Red light scatters through and the fingertip glows; blood absorbs the rest of the colors." : "Blood and skin absorb it within millimetres.")
      : band === "ir" ? (lambda < 1.4e-6 ? "Near infrared goes deepest of all; pulse oximeters use this window." : "Water in the tissue absorbs it at the surface; you feel it as warmth.")
      : band === "uv" ? "Absorbed in the outer skin; this is what tans and burns."
      : "Penetrates centimetres and deposits heat; how deep depends on frequency.";
    return { T: softT, R: 0, A: 1 - softT, boneT, contrast, source, response: { kind: band === "xray" ? "shadow" : softT > 0.05 ? "glow" : "absorb", text } };
  },
};

export const SPECIMENS = [OSCILLATOR, ANTENNA, WATER, GLASS, ZINC_PLATE, DNA, HAND];

// In series: the beam meets each transmitting specimen in turn (the oscillator and antenna don't block it).
export function inSeries(lambda, src, list = SPECIMENS) {
  let remaining = 1;
  return list.map((s) => {
    const r = s.evaluate(lambda, src);
    const before = remaining;
    if (typeof r.T === "number") remaining *= r.T;
    return { key: s.key, before, after: remaining };
  });
}

