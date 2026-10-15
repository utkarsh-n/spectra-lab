// Spectroscopy lab samples. Line positions come from physics or the literature; band shapes and
// relative strengths are drawn to look like real spectra (model) unless marked "table".
import { C, R_HYDROGEN, GAMMA_PROTON_HZ_PER_T } from "./constants.js";
import { waterAbsorption } from "./matter.js";

const lorentz = (x, x0, hw) => 1 / (1 + ((x - x0) / hw) ** 2);
const gauss = (x, x0, s) => Math.exp(-((x - x0) ** 2) / (2 * s * s));

// ---------- hydrogen ----------
export const SERIES = [
  { n1: 1, name: "Lyman" }, { n1: 2, name: "Balmer" }, { n1: 3, name: "Paschen" }, { n1: 4, name: "Brackett" },
];
// Vacuum wavelength of the n2 → n1 transition from the Rydberg formula (reduced-mass corrected).
export const hydrogenLine = (n1, n2) => 1 / (R_HYDROGEN * (1 / (n1 * n1) - 1 / (n2 * n2)));
export function hydrogenLines(mode = "emission") {
  const out = [];
  for (const s of SERIES) {
    if (mode === "absorption" && s.n1 !== 1) continue; // cold atoms sit in n = 1
    for (let n2 = s.n1 + 1; n2 <= s.n1 + 12; n2++) {
      out.push({ lambda: hydrogenLine(s.n1, n2), series: s.name, n1: s.n1, n2, strength: Math.pow(s.n1 / n2, 3) * (mode === "absorption" ? 1 : 1 / s.n1) });
    }
  }
  const max = Math.max(...out.map((l) => l.strength));
  out.forEach((l) => (l.strength /= max));
  return out;
}

// ---------- CO2 ----------
// Band centres (cm^-1): ν1 1388.2 / 2ν2 1285.4 Fermi dyad (Raman only), ν2 667.4 bend, ν3 2349.1
// asymmetric stretch, combination bands 3716 and 3609 (Herzberg; NIST Chemistry WebBook).
const CO2_IR = [
  { nu: 2349.1, s: 1.0, type: "parallel", label: "ν₃ asymmetric stretch" },
  { nu: 667.4, s: 0.55, type: "perpendicular", label: "ν₂ bend" },
  { nu: 3716, s: 0.07, type: "parallel", label: "ν₁+ν₃ combination" },
  { nu: 3609, s: 0.05, type: "parallel", label: "2ν₂+ν₃ combination" },
];
const CO2_RAMAN = [
  { nu: 1388.2, s: 1.0, type: "q", label: "ν₁ symmetric stretch" },
  { nu: 1285.4, s: 0.62, type: "q", label: "2ν₂ (Fermi resonance)" },
];
// Rotational envelope of a gas-phase band at room temperature: P and R lobes ~12 cm^-1 either side,
// plus a sharp Q branch for perpendicular bands.
function bandShape(x, b) {
  const d = x - b.nu, sLobe = 12;
  const lobe = (Math.abs(d) / sLobe) * Math.exp(0.5 - (d * d) / (2 * sLobe * sLobe));
  if (b.type === "q") return lorentz(x, b.nu, 2.5);
  if (b.type === "perpendicular") return 0.75 * lobe + 1.0 * lorentz(x, b.nu, 1.2);
  return lobe;
}

// ---------- chlorophyll ----------
// Peak positions in diethyl ether (Lichtenthaler 1987): Chl a 428 / 660 nm, Chl b 452 / 642 nm.
const CHL = {
  a: [[428, 1.0, 14], [410, 0.55, 12], [660, 0.78, 9], [615, 0.12, 12], [578, 0.08, 12], [530, 0.03, 20]],
  b: [[452, 1.0, 14], [430, 0.4, 14], [642, 0.36, 9], [595, 0.07, 12]],
};

// ---------- proton NMR of ethanol ----------
// CH3 1.22 ppm triplet, CH2 3.69 ppm quartet, J = 7.1 Hz; OH singlet ~2.6 ppm (varies); TMS at 0.
const ETHANOL = [
  { ppm: 3.69, n: 2, mult: [1, 3, 3, 1], label: "CH₂ quartet" },
  { ppm: 2.61, n: 1, mult: [1], label: "OH" },
  { ppm: 1.22, n: 3, mult: [1, 2, 1], label: "CH₃ triplet" },
  { ppm: 0, n: 0.4, mult: [1], label: "TMS reference" },
];
export const larmor = (B0, ppm = 0) => GAMMA_PROTON_HZ_PER_T * B0 * (1 + ppm * 1e-6);
function nmrSpectrum(ppm, B0) {
  const f0 = GAMMA_PROTON_HZ_PER_T * B0, J = 7.1, hwHz = 1.2; // display linewidth (shimmed spectrometers reach < 0.5 Hz)
  let y = 0;
  for (const g of ETHANOL) {
    const sum = g.mult.reduce((a, b) => a + b, 0), k = g.mult.length;
    g.mult.forEach((m, i) => {
      const lineHz = g.ppm * 1e-6 * f0 + (i - (k - 1) / 2) * J;
      y += ((g.n * m) / sum) * lorentz(ppm * 1e-6 * f0, lineHz, hwHz);
    });
  }
  return y;
}

// ---------- the sample list ----------
// axis.kind: "lambda-log" | "lambda" (m) | "wavenumber" (cm^-1) | "ppm"; `from` is drawn on the left.
export const SAMPLES = [
  {
    key: "hydrogen", name: "Hydrogen", modes: ["emission", "absorption"], source: "model",
    axis: { kind: "lambda-log", from: 90e-9, to: 2.7e-6, label: "wavelength" },
    lines: (mode) => hydrogenLines(mode),
    value(x, mode) {
      return hydrogenLines(mode).reduce((y, l) => y + l.strength * lorentz(Math.log10(x), Math.log10(l.lambda), 0.0012), 0);
    },
    note: (mode) => mode === "emission"
      ? "Every line is an electron dropping between two levels. Positions come straight from the Rydberg formula; only Balmer lines are visible to the eye."
      : "Cold hydrogen absorbs only from the ground state, so only the Lyman series appears, all in the ultraviolet.",
    toLambda: (x) => x,
  },
  {
    key: "co2", name: "CO₂", modes: ["ir", "raman"], source: "model",
    axis: { kind: "wavenumber", from: 4000, to: 400, label: "wavenumber" },
    bands: (mode) => (mode === "ir" ? CO2_IR : CO2_RAMAN),
    value(x, mode) {
      return (mode === "ir" ? CO2_IR : CO2_RAMAN).reduce((y, b) => y + b.s * bandShape(x, b), 0);
    },
    note: (mode) => mode === "ir"
      ? "The symmetric stretch near 1388 cm⁻¹ leaves CO₂'s dipole unchanged, so infrared can't drive it. The 667 cm⁻¹ bend falls in Earth's thermal glow."
      : "Raman sees the symmetric stretch that IR misses: the field distorts the electron cloud instead of tugging on a dipole.",
    toLambda: (x) => 1 / (x * 100),
  },
  {
    key: "water", name: "Liquid water", modes: ["ir"], source: "table",
    axis: { kind: "wavenumber", from: 4000, to: 400, label: "wavenumber" },
    value(x) {
      const a = waterAbsorption(1 / (x * 100));
      return a == null ? 0 : (a * 1e-4) / Math.LN10; // absorbance of a 1 µm film
    },
    note: () => "Measured (Segelstein 1981), 1 µm film. The O–H stretch near 3400 cm⁻¹ is broad because hydrogen bonds keep tugging at every molecule.",
    toLambda: (x) => 1 / (x * 100),
  },
  {
    key: "chlorophyll", name: "Chlorophyll", modes: ["a", "b"], source: "model",
    axis: { kind: "lambda", from: 350e-9, to: 750e-9, label: "wavelength" },
    value(x, mode) {
      const nm = x * 1e9;
      return CHL[mode].reduce((y, [c, s, w]) => y + s * gauss(nm, c, w), 0);
    },
    note: (mode) => `Chlorophyll ${mode} absorbs blue and red light and reflects the green in between, which is why leaves look green.`,
    toLambda: (x) => x,
  },
  {
    key: "nmr", name: "Proton NMR", modes: ["400", "60"], source: "model",
    axis: { kind: "ppm", from: 4.5, to: -0.3, label: "chemical shift" },
    value(x, mode) {
      const B0 = mode === "60" ? 1.41 : 9.4;
      return nmrSpectrum(x, B0) / nmrSpectrum(1.22, B0);
    },
    note: (mode) => `Ethanol in a ${mode === "60" ? "1.41 T (60 MHz)" : "9.4 T (400 MHz)"} magnet. Radio waves flip proton spins. Neighbouring protons split each peak by J = 7.1 Hz, a fixed amount in hertz, so a stronger magnet spreads the peaks apart.`,
    toLambda: (x, mode) => C / larmor(mode === "60" ? 1.41 : 9.4, x),
  },
];

