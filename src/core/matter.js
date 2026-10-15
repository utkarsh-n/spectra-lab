// How matter answers a wave. Two kinds of numbers come out of here, and every result says which:
//   "table" — interpolated from measured reference data (NIST attenuation, Segelstein water)
//   "model" — oscillator / free-electron physics or a smooth curve through published anchor values
import { C, EPS0, ME, E_CHARGE, NA, HBAR } from "./constants.js";
import { XCOM } from "../data/xcom.js";
import { WATER_ABSORPTION } from "../data/water.js";

const TAU = 2 * Math.PI;

// ---------- interpolation ----------
// Log-log interpolation in rows [[x, y], ...] sorted by x. Repeated x values mark a step (absorption
// edge): at exactly the edge and above it the upper value applies. Returns null outside the table.
export function logLog(rows, x) {
  if (!(x >= rows[0][0]) || x > rows[rows.length - 1][0]) return null;
  let i = 1;
  while (i < rows.length - 1 && rows[i][0] < x) i++;
  // At an edge (rows[i][0] === rows[i+1][0] === x), take the upper value.
  while (i < rows.length - 1 && rows[i + 1][0] === x) i++;
  const [x0, y0] = rows[i - 1], [x1, y1] = rows[i];
  if (x1 === x0) return y1;
  const u = Math.log(x / x0) / Math.log(x1 / x0);
  return Math.exp(Math.log(y0) + u * (Math.log(y1) - Math.log(y0)));
}

// ---------- reference tables ----------
export const XCOM_MIN_EV = 1e3, XCOM_MAX_EV = 2e7;
export function massAttenuation(material, ev) {
  return logLog(XCOM[material].rows, ev / 1e6); // cm^2/g or null
}
export function linearAttenuation(material, ev, density = XCOM[material].density) {
  const m = massAttenuation(material, ev);
  return m == null ? null : m * density; // 1/cm
}
export function waterAbsorption(lambda) {
  return logLog(WATER_ABSORPTION, lambda * 1e9); // 1/cm or null (10 nm .. 10 m)
}

// ---------- complex helpers ----------
const cx = (re, im = 0) => ({ re, im });
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
export function csqrt(z) {
  const r = Math.hypot(z.re, z.im);
  const re = Math.sqrt(Math.max(0, (r + z.re) / 2));
  const im = Math.sign(z.im || 1) * Math.sqrt(Math.max(0, (r - z.re) / 2));
  return cx(re, im);
}
// Complex refractive index n + iκ from relative permittivity (e^{-iωt} convention, absorbing: κ > 0).
export function indexFromEpsilon(eps) { const n = csqrt(eps); return { n: n.re, k: Math.abs(n.im) }; }
export const absorptionFromK = (k, lambda) => (4 * Math.PI * k) / lambda / 100; // intensity, 1/cm
export const normalReflectance = (n, k = 0) => ((n - 1) ** 2 + k * k) / ((n + 1) ** 2 + k * k);

// ---------- the bound-charge (Lorentz) oscillator ----------
// A charge on a spring with resonance ω0 and damping γ, driven at ω. Displacement relative to the
// static (ω → 0) response, the phase lag behind the driving field, and absorbed power relative to
// the power absorbed exactly on resonance.
export function oscillatorResponse(omega, omega0, gamma) {
  const re = omega0 * omega0 - omega * omega, im = gamma * omega;
  const amplitude = (omega0 * omega0) / Math.hypot(re, im);
  const lag = (Math.atan2(im, re) * 180) / Math.PI; // 0 in step, 90 on resonance, 180 opposite
  const power = (gamma * gamma * omega * omega) / (re * re + im * im); // 1 at resonance
  return { amplitude, lag, power };
}
// Permittivity of a sum of Lorentz oscillators: ε = 1 + Σ ωp²/(ω0² − ω² − iγω).
export function lorentzEpsilon(omega, oscillators) {
  let eps = cx(1, 0);
  for (const o of oscillators) {
    const t = cdiv(cx(o.wp * o.wp, 0), cx(o.w0 * o.w0 - omega * omega, -o.gamma * omega));
    eps = cx(eps.re + t.re, eps.im + t.im);
  }
  return eps;
}
// Free electrons (Drude): the oscillator with no spring.
export const drudeEpsilon = (omega, wp, gamma) => lorentzEpsilon(omega, [{ w0: 0, wp, gamma }]);

// ---------- refractive index of the medium dial ----------
function sellmeier(lambdaUm, B, Cs) {
  const l2 = lambdaUm * lambdaUm;
  return Math.sqrt(1 + B.reduce((s, b, i) => s + (b * l2) / (l2 - Cs[i]), 0));
}
// Schott N-BK7 (0.3–2.5 µm); Malitson 1965 fused silica (0.21–3.7 µm); Peter 1923 diamond (0.225 µm+);
// water: Cauchy fit through n(400 nm) = 1.3435 and n(700 nm) = 1.3311 (0.2–1.1 µm);
// water below 1 THz: single Debye relaxation, 25 °C (Kaatze 1989): εs 78.36, ε∞ 5.16, τ 8.27 ps.
export const MEDIA = {
  vacuum: { name: "Vacuum", index: () => ({ n: 1, k: 0, valid: true }) },
  air: { name: "Air", index: (l) => ({ n: 1.000293, k: 0, valid: l > 200e-9 }) },
  water: {
    name: "Water",
    index: (l) => {
      if (l >= 200e-9 && l <= 1.1e-6) { const nm = l * 1e9; return { n: 1.3251 + 2946 / (nm * nm), k: 0, valid: true }; }
      if (l >= 0.3e-3) {
        const w = (TAU * C) / l, tau = 8.27e-12;
        const eps = cdiv(cx(78.36 - 5.16, 0), cx(1, w * tau));
        return { ...indexFromEpsilon(cx(5.16 + eps.re, -eps.im)), valid: true };
      }
      return { n: 1.33, k: 0, valid: false };
    },
  },
  glass: {
    name: "Glass (BK7)",
    index: (l) => {
      const um = l * 1e6;
      if (um >= 0.3 && um <= 2.5) return { n: sellmeier(um, [1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653]), k: 0, valid: true };
      if (l >= 1e-3) return { n: Math.sqrt(4.6), k: 0, valid: true }; // borosilicate, εr ≈ 4.6 at MHz–GHz
      return { n: 1.5, k: 0, valid: false };
    },
  },
  silica: {
    name: "Fused silica",
    index: (l) => {
      const um = l * 1e6;
      if (um >= 0.21 && um <= 3.7) return { n: sellmeier(um, [0.6961663, 0.4079426, 0.8974794], [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2]), k: 0, valid: true };
      return { n: 1.46, k: 0, valid: false };
    },
  },
  diamond: {
    name: "Diamond",
    index: (l) => {
      const um = l * 1e6;
      if (um >= 0.225) return { n: sellmeier(um, [4.3356, 0.3306], [0.106 ** 2, 0.175 ** 2]), k: 0, valid: um <= 1000 };
      return { n: 2.4, k: 0, valid: false };
    },
  },
};

// ---------- metals ----------
// Free-electron (Drude) parameters derived from density, valence and DC conductivity.
export function freeElectronMetal({ density, molarMass, valence, conductivity }) {
  const ne = (valence * density * 1e3 * NA) / (molarMass * 1e-3); // electrons / m^3 (density in g/cm^3)
  const wp = Math.sqrt((ne * E_CHARGE * E_CHARGE) / (EPS0 * ME));
  const tau = (conductivity * ME) / (ne * E_CHARGE * E_CHARGE);
  return { ne, wp, gamma: 1 / tau, plasmaEV: (HBAR * wp) / E_CHARGE };
}
export const ZINC = freeElectronMetal({ density: 7.134, molarMass: 65.38, valence: 2, conductivity: 1.69e7 });
// Photoelectric work functions, eV (CRC Handbook, polycrystalline).
export const WORK_FUNCTIONS = { cesium: 2.14, potassium: 2.3, sodium: 2.36, zinc: 4.33, copper: 4.65, platinum: 5.65 };

// Incoherent slab transmission with two identical faces.
export function slab(R, alphaPerCm, thicknessCm) {
  const a = Math.exp(-alphaPerCm * thicknessCm);
  const T = ((1 - R) ** 2 * a) / (1 - R * R * a * a);
  const Rt = R + ((1 - R) ** 2 * R * a * a) / (1 - R * R * a * a);
  return { T, R: Rt, A: Math.max(0, 1 - T - Rt) };
}

// Smooth curve through anchors [[λ m, value]]; log-log; clamps to the end values outside.
export function anchors(rows, lambda) {
  if (lambda <= rows[0][0]) return rows[0][1];
  if (lambda >= rows[rows.length - 1][0]) return rows[rows.length - 1][1];
  return logLog(rows, lambda);
}
// Bridge from the end of an optical table to the start of NIST data (10 nm ... 1.24 nm).
export function bridge(lambda, lambdaA, valueA, lambdaB, valueB) {
  const u = Math.log(lambda / lambdaA) / Math.log(lambdaB / lambdaA);
  return Math.exp(Math.log(valueA) + u * (Math.log(valueB) - Math.log(valueA)));
}
export const XCOM_LAMBDA_MAX = 1.239841984e-6 / XCOM_MIN_EV; // 1.24 nm

