// Plane electromagnetic waves: fields, polarization, superposition, blackbody sources and a test charge.
import { C, H, KB, EPS0, E_CHARGE, ME, WIEN_B } from "./constants.js";

const TAU = 2 * Math.PI;
const rad = (deg) => (deg * Math.PI) / 180;

// A source is a monochromatic plane wave (or a pulse or a thermal spectrum) travelling along +z.
//   lambda  vacuum wavelength, m
//   E0      peak electric field, V/m
//   theta   Jones amplitude-split angle ψ, deg: Ex0 = E0 cos ψ, Ey0 = E0 sin ψ (the tilt of linear light;
//           90 = vertical, the default)
//   delta   phase of Ey relative to Ex, deg (0 linear, ±90 circular when ψ = 45)
//   phi     overall phase, deg
export function defaultSource(overrides = {}) {
  return { enabled: true, kind: "plane", lambda: 550e-9, E0: 1000, theta: 90, delta: 0, phi: 0, cycles: 3, temperature: 5772, ...overrides };
}

export function jones(src) {
  const psi = rad(src.theta), d = rad(src.delta);
  return { ax: Math.cos(psi), ay: Math.sin(psi), delta: d };
}

// Real fields at phase q = k z − ω t + φ, for unit amplitude. B is returned already divided by c/n,
// i.e. in "E units": B_SI = (n / c) * B_returned.
export function fieldsAtPhase(src, q) {
  const { ax, ay, delta } = jones(src);
  const ex = ax * Math.cos(q), ey = ay * Math.cos(q + delta);
  return { ex, ey, bx: -ey, by: ex };
}

export function phaseAt(src, z, t, n = 1) {
  const k = (TAU * n) / src.lambda, w = (TAU * C) / src.lambda;
  return k * z - w * t + rad(src.phi);
}

// Time-averaged intensity of a plane wave in a medium of (real) index n, W/m^2.
export const intensity = (E0, n = 1) => 0.5 * n * C * EPS0 * E0 * E0;
export const peakB = (E0, n = 1) => (n * E0) / C; // tesla
export const radiationPressure = (E0, n = 1, reflect = false) => ((reflect ? 2 : 1) * intensity(E0, n)) / C;
export const photonFlux = (E0, lambda, n = 1) => intensity(E0, n) / ((H * C) / lambda); // photons / m^2 / s

// Polarization ellipse of a Jones vector (Born & Wolf §1.4).
export function ellipse(src) {
  const { ax, ay, delta } = jones(src);
  const orientation = 0.5 * Math.atan2(2 * ax * ay * Math.cos(delta), ax * ax - ay * ay);
  const sin2chi = Math.max(-1, Math.min(1, 2 * ax * ay * Math.sin(delta)));
  const chi = 0.5 * Math.asin(sin2chi); // ellipticity angle: 0 linear, ±45° circular
  const eps = 1e-9;
  const kind = Math.abs(sin2chi) < eps ? "linear" : Math.abs(Math.abs(sin2chi) - 1) < 1e-6 ? "circular" : "elliptical";
  // With Ey = cos(q + δ) and q = kz − ωt, sin δ > 0 rotates x → y at a fixed point in time order.
  const sense = kind === "linear" ? null : sin2chi > 0 ? "counter-clockwise" : "clockwise";
  return { orientation: (orientation * 180) / Math.PI, chi: (chi * 180) / Math.PI, kind, sense };
}

// Fraction of intensity an ideal linear polarizer at angle alpha (deg) passes.
export function polarizerTransmission(src, alphaDeg) {
  const { ax, ay, delta } = jones(src);
  const a = rad(alphaDeg), c = Math.cos(a), s = Math.sin(a);
  return ax * ax * c * c + ay * ay * s * s + 2 * ax * ay * c * s * Math.cos(delta);
}

// Pulse: Gaussian envelope with `cycles` carrier periods at full width half maximum of intensity.
export function pulseEnvelope(src, q) {
  const fwhmPhase = TAU * src.cycles;
  const sigma = fwhmPhase / (2 * Math.sqrt(2 * Math.log(2)));
  return Math.exp(-(q * q) / (4 * sigma * sigma)); // field envelope (intensity envelope is its square)
}
export const pulseBandwidth = (src) => (2 * Math.log(2)) / (Math.PI * src.cycles); // Δf/f for a transform-limited Gaussian

// Planck spectral radiance per unit wavelength, W / (m^2 sr m).
export function planckLambda(lambda, T) {
  const a = (2 * H * C * C) / Math.pow(lambda, 5);
  const x = (H * C) / (lambda * KB * T);
  return x > 700 ? 0 : a / Math.expm1(x);
}
export const wienPeak = (T) => WIEN_B / T;

// Discrete frequency components of a source, used for superposition and the Fourier view.
// Returns [{lambda, amp, phase}] with amplitudes relative to src.E0.
export function components(src, count = 15) {
  count = Math.max(3, count);
  if (src.kind === "plane") return [{ lambda: src.lambda, amp: 1, phase: rad(src.phi) }];
  if (src.kind === "pulse") {
    const f0 = C / src.lambda, df = pulseBandwidth(src) * f0;
    const sigmaF = df / (2 * Math.sqrt(2 * Math.log(2)));
    const out = [];
    for (let i = 0; i < count; i++) {
      const u = (i / (count - 1)) * 2 - 1;
      const f = f0 + 2.2 * sigmaF * u;
      out.push({ lambda: C / f, amp: Math.exp(-((f - f0) ** 2) / (4 * sigmaF * sigmaF)), phase: rad(src.phi) });
    }
    const s = out.reduce((a, c) => a + c.amp, 0);
    out.forEach((c) => (c.amp /= s));
    return out;
  }
  // Thermal: sample the Planck curve on a log grid around its peak; amplitude ∝ sqrt(power in bin).
  const peak = wienPeak(src.temperature), out = [];
  let rng = 12345;
  const rand = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const lambda = peak * Math.pow(10, -0.6 + (1.6 * i) / (count - 1));
    const p = planckLambda(lambda, src.temperature) * lambda; // power per log-wavelength bin
    out.push({ lambda, amp: Math.sqrt(p), phase: TAU * rand() });
  }
  const s = Math.sqrt(out.reduce((a, c) => a + c.amp * c.amp, 0));
  out.forEach((c) => (c.amp /= s));
  return out;
}

// Normalized laser strength parameter a0 = e E0 / (m ω c); above ~1 the v×B push is comparable to the E shake.
export const a0 = (E0, lambda) => (E_CHARGE * E0) / (ME * ((TAU * C) / lambda) * C);
export const fieldForA0 = (a, lambda) => (a * ME * ((TAU * C) / lambda) * C) / E_CHARGE;
// Peak quiver amplitude of a free electron (non-relativistic), m.
export const quiverAmplitude = (E0, lambda) => (E_CHARGE * E0) / (ME * ((TAU * C) / lambda) ** 2);

// Exact trajectory of an electron, initially at rest, in a vacuum plane wave with strength a0.
// Uses the light-front phase η = ωt − kz. With normalized vector potential A(η), canonical momentum
// conservation gives u⊥ = A(η) − A(0); with the magnetic force included, γ − u_z = 1 so u_z = |u⊥|² / 2.
// Coordinates are returned in units of the reduced wavelength c/ω; time in units of 1/ω.
// mode: "both" (E and v×B), "electric" (drop v×B), "magnetic" (drop E: nothing moves from rest).
export function electronTrajectory(src, a, mode = "both", cycles = 2, steps = 720) {
  const { ax, ay, delta } = jones(src);
  const A = (eta) => [a * ax * Math.sin(eta), a * ay * Math.sin(eta + delta)];
  const A0 = A(0);
  const pts = [];
  let x = 0, y = 0, z = 0, t = 0;
  const dEta = (TAU * cycles) / steps;
  for (let i = 0; i <= steps; i++) {
    const eta = i * dEta;
    let ux = 0, uy = 0, uz = 0;
    if (mode !== "magnetic") {
      const Ae = A(eta);
      ux = Ae[0] - A0[0];
      uy = Ae[1] - A0[1];
      if (mode === "both") uz = (ux * ux + uy * uy) / 2;
    }
    const gamma = mode === "both" ? 1 + uz : Math.sqrt(1 + ux * ux + uy * uy);
    pts.push({ eta, t, x, y, z, ux, uy, uz, gamma });
    // dη/dt = ω(γ − u_z)/γ; integrate dx/dη = u/(γ − u_z) with the midpoint rule.
    const etaM = eta + dEta / 2;
    let mx = 0, my = 0, mz = 0, mg = 1;
    if (mode !== "magnetic") {
      const Am = A(etaM);
      mx = Am[0] - A0[0];
      my = Am[1] - A0[1];
      if (mode === "both") mz = (mx * mx + my * my) / 2;
      mg = mode === "both" ? 1 + mz : Math.sqrt(1 + mx * mx + my * my);
    }
    const md = mg - mz;
    x += (mx / md) * dEta;
    y += (my / md) * dEta;
    z += (mz / md) * dEta;
    t += (mg / md) * dEta;
  }
  return pts;
}

// Average forward drift speed (fraction of c) of a free electron in a linearly polarized wave.
export const driftSpeed = (a) => (a * a) / (4 + a * a);
