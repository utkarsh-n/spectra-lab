// Display-space fields. Distances are in units of the reference wavelength (the first enabled source,
// in vacuum) and time is screen time; every source keeps its true frequency ratio to the reference.
import { components, jones, pulseEnvelope } from "../core/wave.js";
import { MEDIA } from "../core/matter.js";
import { displayColor } from "../core/spectrum.js";
import { THEME } from "./draw.js";

const TAU = 2 * Math.PI;
export const MAX_RATIO = 24; // components more than 24× finer or coarser than the reference aren't drawn

let cache = { key: "", value: null };

export function displaySources(state) {
  const enabled = state.sources.map((s, i) => ({ s, i })).filter((x) => x.s.enabled);
  const ref = enabled[0]?.s ?? state.sources[0];
  const key = JSON.stringify([state.sources, state.medium]);
  if (cache.key === key) return cache.value;
  const medium = MEDIA[state.medium];
  const totalE0 = enabled.reduce((a, x) => a + x.s.E0, 0) || 1;
  const list = enabled.map(({ s, i }) => {
    // Pulses are drawn as one carrier under an analytic envelope; thermal light as many random-phase lines.
    const raw = s.kind === "thermal" ? components(s, 15) : [{ lambda: s.lambda, amp: 1, phase: (s.phi * Math.PI) / 180 }];
    const comps = raw.map((c) => {
      const nk = state.medium === "vacuum" ? { n: 1, k: 0, valid: true } : medium.index(c.lambda);
      return { r: ref.lambda / c.lambda, amp: c.amp, phase: c.phase, n: nk.valid ? nk.n : 1, k: nk.valid ? nk.k : 0, lambda: c.lambda };
    });
    const visible = comps.filter((c) => c.r <= MAX_RATIO && c.r >= 1 / MAX_RATIO);
    return {
      src: s, index: i, jones: jones(s), comps: visible, hidden: comps.length - visible.length,
      scale: (s.E0 / totalE0) * (s.kind === "thermal" ? 0.45 : 1), color: displayColor(s.lambda), tag: THEME.sources[i],
    };
  });
  const value = { ref, list, inMedium: state.medium !== "vacuum" };
  cache = { key, value };
  return value;
}

// Total field at display position z (reference wavelengths) and screen time t (s).
// Returns E components and the medium index there (B = n ẑ × E in these units).
export function fieldAt(ds, z, t, speed, only = null) {
  let ex = 0, ey = 0, nAt = 1;
  for (const d of ds.list) {
    if (only != null && d.index !== only) continue;
    const { ax, ay, delta } = d.jones;
    for (const c of d.comps) {
      const inside = ds.inMedium && z > 0;
      const n = inside ? c.n : 1;
      if (inside) nAt = c.n;
      const q = TAU * c.r * n * z - TAU * c.r * speed * t + c.phase;
      let a = d.scale * c.amp;
      if (inside) a *= (2 / (1 + c.n)) * Math.exp(-TAU * c.r * c.k * z);
      if (d.src.kind === "pulse") {
        // The envelope rides with the carrier and repeats every few pulse lengths so it stays on screen.
        const period = TAU * (d.src.cycles * 2.2 + 3);
        const centre = ((((TAU * c.r * speed * t) % period) + period) % period) - period / 2;
        a *= pulseEnvelope(d.src, TAU * c.r * (inside ? n : 1) * z - centre);
      }
      ex += a * ax * Math.cos(q);
      ey += a * ay * Math.cos(q + delta);
    }
  }
  return { ex, ey, n: nAt };
}

export function hiddenNote(ds) {
  const names = ds.list.filter((d) => d.hidden > 0 || d.comps.length === 0).map((d) => "ABC"[d.index]);
  return names.length ? `Source ${names.join(", ")} is too far from the reference wavelength to draw at this zoom` : "";
}
