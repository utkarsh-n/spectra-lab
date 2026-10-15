// Field trips: each sets every source, restarts the clock and opens the instrument that tells its story.
import { defaultSource, wienPeak } from "./wave.js";
import { wavelengthFromEV } from "./spectrum.js";
import { C } from "./constants.js";
import { sanitize } from "./state.js";

const off = (lambda) => defaultSource({ enabled: false, lambda });
const one = (o) => [defaultSource(o), off(450e-9), off(650e-9)];

export const PRESETS = [
  {
    key: "fm", name: "FM radio", detail: "100 MHz · 3.00 m",
    note: "A half-wave dipole antenna (1.5 m) resonates: half a wavelength fits the rods.",
    apply: (s) => ({ sources: one({ lambda: C / 100e6, E0: 0.01 }), instrument: "bench", bench: { focus: "antenna" } }),
  },
  {
    key: "oven", name: "Microwave oven", detail: "2.45 GHz · 12.2 cm",
    note: "Water molecules twist after the field and lag behind it, so the water heats. The 2 mm holes in the door mesh are far smaller than the wave, so it can't get out.",
    apply: (s) => ({ sources: one({ lambda: C / 2.45e9, E0: 5000 }), instrument: "bench", bench: { focus: "water" } }),
  },
  {
    key: "wifi", name: "Wi-Fi through a wall", detail: "5 GHz · 6.0 cm",
    note: "Drywall and glass barely notice it. Metal reflects it, and water (and people) absorb it.",
    apply: () => ({ sources: one({ lambda: C / 5e9, E0: 1 }), instrument: "bench", bench: { focus: "glass" } }),
  },
  {
    key: "thermal", name: "Thermal camera", detail: "310 K body · peak 9.3 µm",
    note: "Your body glows in the long-wave infrared. Wien's law puts the peak of a 310 K body at 9.3 µm.",
    apply: () => ({ sources: one({ kind: "thermal", temperature: 310, lambda: wienPeak(310), E0: 30 }), instrument: "decompose", decompose: { tab: "fourier" } }),
  },
  {
    key: "prism", name: "Prism", detail: "Three colors in glass",
    note: "Blue, green and red travel at different speeds in glass (n = 1.53, 1.52, 1.51), so a prism bends them by different amounts.",
    apply: () => ({ sources: [defaultSource({ lambda: 450e-9 }), defaultSource({ lambda: 550e-9 }), defaultSource({ lambda: 650e-9 })], medium: "glass", instrument: "decompose", decompose: { tab: "fourier" } }),
  },
  {
    key: "photo", name: "Photoelectric effect", detail: "Red vs UV on zinc",
    note: "Turn red light up as bright as you like: zinc ejects nothing. A dim UV-C source ejects electrons at once. Energy per photon, not brightness, decides (Einstein, 1905).",
    apply: () => ({ sources: [defaultSource({ lambda: 650e-9, E0: 1e6 }), defaultSource({ enabled: false, lambda: 254e-9, E0: 10 }), off(550e-9)], instrument: "bench", bench: { focus: "zinc" } }),
  },
  {
    key: "balmer", name: "Hydrogen lines", detail: "656 · 486 · 434 · 410 nm",
    note: "The visible Balmer lines from the Rydberg formula. Sweep to see the ultraviolet Lyman and infrared Paschen series too.",
    apply: () => ({ sources: one({ lambda: 656.47e-9 }), instrument: "lab", lab: { sample: "hydrogen", mode: "emission", sweep: 0.584 } }),
  },
  {
    key: "sunburn", name: "Sunburn", detail: "UV-B · 300 nm",
    note: "UV-B reaches the ground and is absorbed in DNA's 260 nm band, where neighbouring thymines can fuse.",
    apply: () => ({ sources: one({ lambda: 300e-9 }), instrument: "bench", bench: { focus: "dna" } }),
  },
  {
    key: "xray", name: "Hand X-ray", detail: "60 keV · 20.7 pm",
    note: "Calcium-rich bone absorbs far more than soft tissue at this energy, and that difference is the image.",
    apply: () => ({ sources: one({ lambda: wavelengthFromEV(60e3) }), instrument: "bench", bench: { focus: "hand" } }),
  },
  {
    key: "cmb", name: "Cosmic background", detail: "2.725 K · peak 1.06 mm",
    note: "The Big Bang's afterglow, cooled to 2.725 K and stretched into the microwave band.",
    apply: () => ({ sources: one({ kind: "thermal", temperature: 2.725, lambda: wienPeak(2.725), E0: 1e-3 }), instrument: "tuner" }),
  },
  {
    key: "nmr", name: "NMR", detail: "400 MHz in 9.4 T",
    note: "Protons in a strong magnet precess at a radio frequency. Their neighbours shift and split the lines.",
    apply: () => ({ sources: one({ lambda: C / 400.23e6 }), instrument: "lab", lab: { sample: "nmr", mode: "400", sweep: 0.169 } }),
  },
  {
    key: "circular", name: "Circular light", detail: "Ex, Ey a quarter cycle apart",
    note: "Two equal components 90° apart sum to a field that turns in a circle, as in 3D cinema glasses. A polarizer at any angle passes 50%.",
    apply: () => ({ sources: one({ lambda: 550e-9, theta: 45, delta: 90 }), instrument: "decompose", decompose: { tab: "polarization" } }),
  },
  {
    key: "laser", name: "Petawatt laser", detail: "800 nm · a₀ = 2",
    note: "At this strength the magnetic force matters: a free electron traces a figure eight while its average drift carries it forward at half the speed of light.",
    apply: () => ({ sources: one({ lambda: 800e-9, E0: 8.03e12 }), instrument: "decompose", decompose: { tab: "probe", a0: 2, probeMode: "both" } }),
  },
  {
    key: "greenhouse", name: "Greenhouse gas", detail: "CO₂ · 15 µm bend",
    note: "CO₂'s 667 cm⁻¹ bend (15 µm) absorbs part of the infrared the warm Earth radiates.",
    apply: () => ({ sources: one({ lambda: 1 / (667.4 * 100) }), instrument: "lab", lab: { sample: "co2", mode: "ir", sweep: 0.926 } }),
  },
];

export function applyPreset(state, key) {
  const p = PRESETS.find((x) => x.key === key);
  if (!p) return state;
  const patch = p.apply(state);
  const next = { ...state, medium: "vacuum", link: false, active: 0, ...patch };
  next.sources = next.sources.map(sanitize);
  if (patch.decompose) next.decompose = { ...state.decompose, ...patch.decompose };
  if (patch.lab) next.lab = { ...state.lab, sweeping: false, ...patch.lab };
  if (patch.bench) next.bench = { ...state.bench, ...patch.bench };
  next.preset = key;
  return next;
}
