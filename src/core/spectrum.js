// Wavelength, frequency and photon-energy bookkeeping for the whole spectrum.
import { C, HC_EV_M, EV_TO_KCAL_PER_MOL, EV_TO_KJ_PER_MOL, IONIZING_EV, VISIBLE_EDGE_EV } from "./constants.js";

export const LOG_MIN = -13; // 0.1 pm (12.4 MeV)
export const LOG_MAX = 3; // 1 km (300 kHz)

export const frequency = (lambda) => C / lambda;
export const wavelength = (f) => C / f;
export const photonEV = (lambda) => HC_EV_M / lambda;
export const wavelengthFromEV = (ev) => HC_EV_M / ev;
export const kcalPerMol = (ev) => ev * EV_TO_KCAL_PER_MOL;
export const kjPerMol = (ev) => ev * EV_TO_KJ_PER_MOL;
export const wavenumber = (lambda) => 1 / (lambda * 100); // cm^-1
export const fromWavenumber = (nu) => 1 / (nu * 100);
export const clampLog = (lg) => Math.min(LOG_MAX, Math.max(LOG_MIN, lg));

// Conventional band edges (vacuum wavelength, m). Gamma and X-ray overlap in nature; they are
// named by origin (nucleus vs electrons). The toy splits them at 10 pm, as the poster does.
export const BANDS = [
  { key: "gamma", name: "Gamma", short: "γ", lo: 0, hi: 1e-11, color: "#E2D4FF" },
  { key: "xray", name: "X-ray", short: "X", lo: 1e-11, hi: 1e-8, color: "#8FD3FF" },
  { key: "uv", name: "Ultraviolet", short: "UV", lo: 1e-8, hi: 400e-9, color: "#B583FF" },
  { key: "visible", name: "Visible", short: "Vis", lo: 400e-9, hi: 700e-9, color: "#A8FF3E" },
  { key: "ir", name: "Infrared", short: "IR", lo: 700e-9, hi: 1e-3, color: "#FF7A6B" },
  { key: "microwave", name: "Microwave", short: "µW", lo: 1e-3, hi: 1, color: "#5FD3BC" },
  { key: "radio", name: "Radio", short: "Radio", lo: 1, hi: Infinity, color: "#9DB0CC" },
];

const SUB_BANDS = [
  [1e-11, 1e-8, "Hard → soft X-ray"],
  [1e-8, 100e-9, "Extreme UV"],
  [100e-9, 280e-9, "UV-C"],
  [280e-9, 315e-9, "UV-B"],
  [315e-9, 400e-9, "UV-A"],
  [700e-9, 1.4e-6, "Near IR"],
  [1.4e-6, 3e-6, "Short-wave IR"],
  [3e-6, 8e-6, "Mid-wave IR"],
  [8e-6, 15e-6, "Long-wave IR (thermal)"],
  [15e-6, 1e-3, "Far IR"],
  [1e-3, 1e-2, "Millimetre wave (EHF)"],
  [1e-2, 1e-1, "SHF · centimetre"],
  [1e-1, 1, "UHF"],
  [1, 10, "VHF"],
  [10, 100, "HF · shortwave"],
  [100, 1000, "MF · AM broadcast"],
];

export function bandAt(lambda) {
  return BANDS.find((b) => lambda >= b.lo && lambda < b.hi) ?? BANDS[BANDS.length - 1];
}

export function subBandAt(lambda) {
  if (lambda < 1e-11) return lambda < 1.2398e-12 ? "Gamma above 1 MeV" : "Gamma";
  if (lambda >= 400e-9 && lambda < 700e-9) return `Visible · ${hueName(lambda * 1e9)}`;
  const s = SUB_BANDS.find(([lo, hi]) => lambda >= lo && lambda < hi);
  return s ? s[2] : bandAt(lambda).name;
}

export function hueName(nm) {
  if (nm < 450) return "violet";
  if (nm < 495) return "blue";
  if (nm < 520) return "cyan";
  if (nm < 570) return "green";
  if (nm < 590) return "yellow";
  if (nm < 620) return "orange";
  return "red";
}

// What a photon of this energy can do to matter, coarsely.
export function ionizationClass(lambda) {
  const ev = photonEV(lambda);
  if (ev >= IONIZING_EV) return { key: "ionizing", label: "Ionizing" };
  if (ev > VISIBLE_EDGE_EV) return { key: "bond", label: "Can break bonds" };
  return { key: "none", label: "Non-ionizing" };
}

// Approximate perceived color of monochromatic light (after Bruton's piecewise fit), linear 0..1.
export function spectralRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else if (nm <= 780) { r = 1; }
  let k = 1;
  if (nm < 420) k = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm > 700) k = 0.3 + (0.7 * (780 - nm)) / 80;
  if (nm < 380 || nm > 780) k = 0;
  return [r * k, g * k, b * k];
}

const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

// Display color for a wavelength: true hue in the visible band (lifted for a dark screen), band palette elsewhere.
export function displayColor(lambda) {
  const band = bandAt(lambda);
  if (band.key !== "visible") return band.color;
  const [r, g, b] = spectralRGB(lambda * 1e9);
  const lift = (c) => 0.16 + 0.84 * Math.pow(c, 0.8);
  return hex(lift(r), lift(g), lift(b));
}

// Haptic and audible detents: band edges plus the ionizing threshold.
export const DETENTS = [
  ...BANDS.slice(1).map((b) => ({ log: Math.log10(b.lo), kind: "band", label: b.name })),
  { log: Math.log10(HC_EV_M / IONIZING_EV), kind: "ionizing", label: "Ionizing" },
];

export function crossedDetents(fromLog, toLog) {
  const lo = Math.min(fromLog, toLog), hi = Math.max(fromLog, toLog);
  return DETENTS.filter((d) => d.log > lo && d.log <= hi);
}

// Everyday objects whose size is one wavelength somewhere on the ruler.
export const SIZE_COMPARISONS = [
  { size: 1e-14, label: "an atomic nucleus" },
  { size: 1e-10, label: "an atom" },
  { size: 1e-9, label: "a sugar molecule" },
  { size: 1e-7, label: "a virus" },
  { size: 5e-7, label: "the width of E. coli" },
  { size: 1e-5, label: "a cell" },
  { size: 1e-3, label: "a pinhead" },
  { size: 1.2e-2, label: "a bee" },
  { size: 1.7, label: "a person" },
  { size: 100, label: "a football field" },
];

export function nearestComparison(lambda) {
  let best = SIZE_COMPARISONS[0], d = Infinity;
  for (const c of SIZE_COMPARISONS) {
    const dd = Math.abs(Math.log10(c.size) - Math.log10(lambda));
    if (dd < d) { d = dd; best = c; }
  }
  return { ...best, ratio: lambda / best.size, decades: d };
}

// Engineering formatting with SI prefixes, three significant figures.
function engineering(v, unit, prefixes) {
  if (!Number.isFinite(v) || v === 0) return `0 ${unit}`;
  for (const [p, s] of prefixes) {
    if (Math.abs(v) >= s * 0.9995) return `${sig3(v / s)} ${p}${unit}`;
  }
  const [p, s] = prefixes[prefixes.length - 1];
  return `${sig3(v / s)} ${p}${unit}`;
}
export function sig3(x) {
  const a = Math.abs(x);
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  if (a >= 1) return x.toFixed(2);
  return x.toPrecision(3);
}
const LEN = [["k", 1e3], ["", 1], ["c", 1e-2], ["m", 1e-3], ["µ", 1e-6], ["n", 1e-9], ["p", 1e-12], ["f", 1e-15]];
const FREQ = [["E", 1e18], ["P", 1e15], ["T", 1e12], ["G", 1e9], ["M", 1e6], ["k", 1e3], ["", 1]];
const ENERGY = [["M", 1e6], ["k", 1e3], ["", 1], ["m", 1e-3], ["µ", 1e-6], ["n", 1e-9], ["p", 1e-12]];
export const formatLength = (m) => engineering(m, "m", LEN);
export const formatFrequency = (hz) => (hz >= 1e19 ? sci(hz, "Hz") : engineering(hz, "Hz", FREQ));
export const formatEnergy = (ev) => engineering(ev, "eV", ENERGY);
export function sci(v, unit = "") {
  if (v === 0) return `0${unit ? " " + unit : ""}`;
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  const sup = String(e).replace(/[-0-9]/g, (ch) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(ch)]);
  return `${m.toFixed(2)}×10${sup}${unit ? " " + unit : ""}`;
}
export function formatKcal(ev) {
  const k = kcalPerMol(ev);
  return k >= 0.01 && k < 1e5 ? `${sig3(k)} kcal/mol` : `${sci(k)} kcal/mol`;
}

// Everything a readout needs for one wavelength.
export function describe(lambda) {
  const ev = photonEV(lambda);
  const band = bandAt(lambda);
  return {
    lambda, f: frequency(lambda), ev,
    band, sub: subBandAt(lambda), ion: ionizationClass(lambda),
    color: displayColor(lambda),
    text: {
      lambda: formatLength(lambda), f: formatFrequency(frequency(lambda)),
      ev: formatEnergy(ev), kcal: formatKcal(ev), wavenumber: `${sig3(wavenumber(lambda))} cm⁻¹`,
    },
  };
}
