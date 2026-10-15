// Field controls: field trips, sources A/B/C, dials, medium, time scale, display and feedback.
import { SOURCE_NAMES, SOURCE_KINDS, defaults } from "../core/state.js";
import { PRESETS } from "../core/presets.js";
import { LOG_MIN, LOG_MAX, describe, sci } from "../core/spectrum.js";
import { MEDIA } from "../core/matter.js";
import { wienPeak, ellipse, pulseBandwidth } from "../core/wave.js";
import { THEME } from "./draw.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style") el.style.cssText = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat().filter((x) => x != null));
  return el;
};
const icon = (id, size = 18) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "icon"); s.style.width = s.style.height = size + "px"; s.innerHTML = `<use href="#${id}"/>`; return s; };
const group = (num, title, ...kids) => h("section", { class: "group" }, h("div", { class: "label" }, h("b", {}, num), title), ...kids);
const switchBtn = (label, get, set) => {
  const b = h("button", { class: "switch", role: "switch", "aria-label": label, onclick: () => set(!get()) });
  b.sync = () => b.setAttribute("aria-checked", get());
  return b;
};

// ---------- dial ----------
const TICKS = 48;
function dial(app, spec) {
  const knob = h("div", { class: "knob", "aria-hidden": "true" });
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 104 96");
  svg.setAttribute("width", "104");
  svg.setAttribute("height", "96");
  svg.innerHTML = `<path class="ticks" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" stroke-linecap="round"/><path class="arc" fill="none" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="50" r="27" class="cap" stroke="rgba(255,255,255,0.1)"/><path class="ptr" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="50" r="2" class="dot"/>`;
  knob.append(svg);
  const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return `${(52 + r * Math.cos(a)).toFixed(1)} ${(50 - r * Math.sin(a)).toFixed(1)}`; };
  let ticks = "";
  for (let i = 0; i <= 24; i++) { const d = 225 - (270 * i) / 24; ticks += `M${pt(d, 39)}L${pt(d, i % 6 === 0 ? 45 : 42)}`; }
  svg.querySelector(".ticks").setAttribute("d", ticks);

  const val = h("div", { class: "val" }), val2 = h("div", { class: "val2" });
  const range = h("input", { type: "range", min: 0, max: 1000, step: 1, "aria-label": spec.name });
  const el = h("div", { class: "dial" }, h("div", { class: "dt" }, h("span", { class: "mono" }, spec.sym), h("span", {}, spec.name)), h("div", { class: "dd" }, spec.desc), knob, val, val2, range);

  let dragging = false, lastTick = null;
  const setUnit = (u) => {
    u = Math.min(1, Math.max(0, u));
    const tick = Math.round(u * TICKS);
    if (lastTick !== null && tick !== lastTick) app.feedback.detent("tick");
    lastTick = tick;
    spec.set(spec.fromUnit(u));
  };
  range.addEventListener("input", () => { app.feedback.unlock(); setUnit(range.value / 1000); });
  let start = null;
  knob.addEventListener("pointerdown", (e) => { app.feedback.unlock(); dragging = true; try { knob.setPointerCapture(e.pointerId); } catch {} start = { y: e.clientY, x: e.clientX, u: spec.toUnit(spec.get()) }; });
  knob.addEventListener("pointermove", (e) => { if (!dragging) return; setUnit(start.u + ((start.y - e.clientY) + (e.clientX - start.x) * 0.5) / 220); });
  const stop = () => { dragging = false; };
  knob.addEventListener("pointerup", stop);
  knob.addEventListener("pointercancel", stop);

  el.sync = () => {
    const v = spec.get(), u = spec.toUnit(v), accent = spec.accent();
    el.style.setProperty("--accent", accent);
    const end = 225 - 270 * u;
    let arc = `M${pt(225, 34)}`;
    for (let s = 1; s <= 40; s++) arc += `L${pt(225 - 270 * u * (s / 40), 34)}`;
    const a = svg.querySelector(".arc"); a.setAttribute("d", arc); a.setAttribute("stroke", accent);
    const p = svg.querySelector(".ptr"); p.setAttribute("d", `M${pt(end, 8)}L${pt(end, 21)}`); p.setAttribute("stroke", accent);
    svg.querySelector(".cap").setAttribute("fill", `color-mix(in srgb, ${accent} 22%, transparent)`);
    svg.querySelector(".dot").setAttribute("fill", accent);
    const [a1, a2] = spec.format(v);
    val.textContent = a1;
    val2.textContent = a2 || "";
    range.setAttribute("aria-valuetext", `${a1}${a2 ? ", " + a2 : ""}`);
    if (document.activeElement !== range) range.value = Math.round(u * 1000);
    el.hidden = spec.hidden?.() ?? false;
  };
  return el;
}

// ---------- the panel ----------
export function mountControls(root, app) {
  const s = app.state;
  const syncs = [];
  const live = (el) => { syncs.push(el); return el; };
  const src = () => s.sources[s.active];

  // Field trips
  const tripList = h("div", { class: "trip-list", hidden: true },
    PRESETS.map((p) => h("button", { onclick: () => { tripList.hidden = true; app.preset(p.key); app.closeControls?.(); } }, h("span", { class: "t" }, p.name), h("span", { class: "d" }, p.detail))));
  const tripLabel = h("span", { class: "d" });
  const trips = h("button", { class: "trips", "aria-expanded": "false", onclick: () => { tripList.hidden = !tripList.hidden; trips.setAttribute("aria-expanded", !tripList.hidden); } },
    icon("i-trips", 22), h("span", { style: "display:flex;flex-direction:column;gap:3px;flex:1" }, h("span", { class: "t" }, "Field trips"), tripLabel));
  trips.sync = () => { const p = PRESETS.find((x) => x.key === s.preset); tripLabel.textContent = p ? `${p.name} · ${p.detail}` : "Choose a real-world setup"; };
  syncs.push(trips);

  // Sources
  const srcSeg = h("div", { class: "seg grow", role: "group", "aria-label": "Source" },
    SOURCE_NAMES.map((n, i) => h("button", { onclick: () => { s.active = i; app.feedback.detent("action"); app.changed(); } }, n)));
  srcSeg.sync = () => [...srcSeg.children].forEach((b, i) => {
    b.setAttribute("aria-pressed", i === s.active);
    b.style.setProperty("--seg-color", THEME.sources[i]);
    b.style.opacity = s.sources[i].enabled ? 1 : 0.55;
  });
  const link = switchBtn("Link sources", () => s.link, (v) => { s.link = v; app.changed(); });
  const enabled = switchBtn("Source on", () => src().enabled, (v) => { src().enabled = v; if (!s.sources.some((x) => x.enabled)) s.sources[0].enabled = true; app.changed(); });
  const enabledLabel = h("span");
  const editing = h("div", { class: "mono", style: "font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:8px" });
  editing.sync = () => {
    const d = describe(src().lambda);
    editing.innerHTML = `<span style="width:7px;height:7px;border-radius:4px;background:${THEME.sources[s.active]};display:inline-block"></span>Editing ${SOURCE_NAMES[s.active]} · ${d.text.lambda} · ${d.band.name.toLowerCase()}${s.link ? " · linked" : ""}`;
    enabledLabel.textContent = `Source ${SOURCE_NAMES[s.active]} ${src().enabled ? "on" : "off"}`;
  };
  syncs.push(srcSeg, link, enabled, editing);

  const kinds = h("div", { class: "kinds" }, SOURCE_KINDS.map((k) => h("button", { onclick: () => { app.edit("kind", k.key); if (k.key === "thermal") app.edit("temperature", src().temperature); } }, k.name)));
  const kindNote = h("p", { class: "caption" });
  kinds.sync = () => {
    [...kinds.children].forEach((b, i) => { b.setAttribute("aria-pressed", SOURCE_KINDS[i].key === src().kind); b.style.setProperty("--kind-color", describe(src().lambda).color); });
    const k = SOURCE_KINDS.find((x) => x.key === src().kind);
    const extra = src().kind === "pulse" ? ` Bandwidth Δf/f ≈ ${(pulseBandwidth(src()) * 100).toFixed(0)}%.` : src().kind === "thermal" ? ` Peak at ${describe(wienPeak(src().temperature)).text.lambda} (Wien).` : "";
    kindNote.textContent = `${k.name} · ${k.note}${extra}`;
  };
  syncs.push(kinds);

  const lin = (lo, hi) => ({ toUnit: (v) => (v - lo) / (hi - lo), fromUnit: (u) => lo + u * (hi - lo) });
  const logm = (lo, hi) => ({ toUnit: (v) => (Math.log10(v) - lo) / (hi - lo), fromUnit: (u) => Math.pow(10, lo + u * (hi - lo)) });
  const dials = h("div", { class: "dials" },
    live(dial(app, { sym: "λ", name: "Wavelength", desc: "Sets color, energy and what matter answers.", accent: () => describe(src().lambda).color, get: () => src().lambda, set: (v) => app.edit("lambda", v), ...logm(LOG_MIN, LOG_MAX), format: (v) => { const d = describe(v); return [d.text.lambda, d.text.f]; }, hidden: () => src().kind === "thermal" })),
    live(dial(app, { sym: "T", name: "Temperature", desc: "How hot the glowing body is.", accent: () => THEME.amber, get: () => src().temperature, set: (v) => app.edit("temperature", v), ...logm(0, 7), format: (v) => [`${v >= 1e4 ? sci(v) : v.toPrecision(4)} K`, `peak ${describe(wienPeak(v)).text.lambda}`], hidden: () => src().kind !== "thermal" })),
    live(dial(app, { sym: "E₀", name: "Field", desc: "Peak electric field. B₀ = E₀ / c.", accent: () => THEME.e, get: () => src().E0, set: (v) => app.edit("E0", v), ...logm(-3, 13), format: (v) => [sci(v, "V/m"), `B₀ ${sci(v / 299792458, "T")}`] })),
    live(dial(app, { sym: "θ", name: "Polarization", desc: "Tilts the E plane around the beam.", accent: () => THEME.mint, get: () => src().theta, set: (v) => app.edit("theta", Math.round(v)), ...lin(-90, 90), format: (v) => [`${Math.round(v)}°`, ellipse(src()).kind] })),
    live(dial(app, { sym: "δ", name: "Ellipticity", desc: "Delay of Ey behind Ex.", accent: () => THEME.rose, get: () => src().delta, set: (v) => app.edit("delta", Math.round(v)), ...lin(-180, 180), format: (v) => [`${Math.round(v)}°`, ellipse(src()).sense ?? "no rotation"] })),
    live(dial(app, { sym: "φ", name: "Phase", desc: "Shifts the wave along its path.", accent: () => THEME.violet, get: () => src().phi, set: (v) => app.edit("phi", Math.round(v)), ...lin(0, 360), format: (v) => [`${Math.round(v)}°`, `${(v / 360).toFixed(2)} λ`] })),
    live(dial(app, { sym: "N", name: "Pulse length", desc: "Carrier cycles in the burst.", accent: () => THEME.amber, get: () => src().cycles, set: (v) => app.edit("cycles", Math.round(v * 2) / 2), ...lin(1, 12), format: (v) => [`${v.toFixed(1)} cycles`, `Δf/f ${(pulseBandwidth(src()) * 100).toFixed(0)}%`], hidden: () => src().kind !== "pulse" })),
  );

  // Medium and time
  const mediumSeg = h("div", { class: "seg small", role: "group", "aria-label": "Medium" },
    Object.entries(MEDIA).map(([k, m]) => h("button", { onclick: () => { s.medium = k; app.feedback.detent("action"); app.changed(); } }, m.name.replace(" (BK7)", ""))));
  mediumSeg.sync = () => [...mediumSeg.children].forEach((b, i) => b.setAttribute("aria-pressed", Object.keys(MEDIA)[i] === s.medium));
  const mediumNote = h("p", { class: "caption" });
  mediumNote.sync = () => {
    const m = MEDIA[s.medium].index(src().lambda);
    mediumNote.textContent = s.medium === "vacuum" ? "Light moves at c. Pick a medium to watch it slow down and its wavelength shrink." : m.valid ? `n = ${m.n.toFixed(4)} at this wavelength: light moves at ${(1 / m.n).toFixed(3)} c and its wavelength shrinks by the same factor. The frequency doesn't change.${m.k > 1e-3 ? " It is also absorbed as it goes." : ""}` : "No refractive-index data for this medium at this wavelength. The scope shows it as vacuum.";
  };
  syncs.push(mediumSeg, mediumNote);
  const speedVal = h("span");
  const speed = h("input", { type: "range", id: "speed", min: -1.3, max: 0.6, step: 0.01, oninput: (e) => { s.speed = Math.pow(10, +e.target.value); app.changed(); } });
  speed.sync = () => { if (document.activeElement !== speed) speed.value = Math.log10(s.speed); speedVal.textContent = `${s.speed.toFixed(2)} cycles/s`; };
  syncs.push(speed);

  // Display
  const disp = (k, label) => { const sw = switchBtn(label, () => s.scope[k], (v) => { s.scope[k] = v; app.changed(); }); syncs.push(sw); return h("div", { class: "toggle-row" }, h("span", {}, label), sw); };

  // Feedback
  const sound = switchBtn("Sound", () => s.feedback.sound, (v) => { s.feedback.sound = v; app.feedback.unlock(); app.feedback.detent("action"); app.changed(); });
  const haptics = switchBtn("Haptics", () => s.feedback.haptics, (v) => { s.feedback.haptics = v; app.feedback.detent("action"); app.changed(); });
  const strength = h("input", { type: "range", id: "strength", min: 0, max: 1, step: 0.05, oninput: (e) => { s.feedback.strength = +e.target.value; app.feedback.detent("band"); app.changed(); } });
  strength.sync = () => { if (document.activeElement !== strength) strength.value = s.feedback.strength; };
  syncs.push(sound, haptics, strength);

  const resetDials = h("button", { class: "glass grow", onclick: () => {
    const base = defaults().sources;
    const targets = s.link ? s.sources.map((_, i) => i) : [s.active];
    for (const i of targets) Object.assign(s.sources[i], { ...base[i], enabled: s.sources[i].enabled });
    app.feedback.detent("action"); app.changed();
  } }, icon("i-reset", 16), "Reset dials");
  const resetAlign = h("button", { class: "glass grow", onclick: () => { s.scope = { ...defaults().scope, showE: s.scope.showE, showB: s.scope.showB, showS: s.scope.showS }; app.feedback.detent("action"); app.changed(); } }, icon("i-align", 16), "Reset alignment");

  root.append(
    h("div", { class: "sheet-head" }, h("h2", {}, "Field controls"), h("button", { class: "glass", onclick: () => app.closeControls?.() }, "Done")),
    group("01", "Field source",
      trips, tripList,
      h("p", { class: "caption" }, "Field trips set every source and restart the clock."),
      h("div", { class: "row" }, srcSeg, h("span", { style: "display:flex;align-items:center;gap:8px;color:#d4e2d9" }, icon("i-link", 18), "Link"), link),
      editing,
      h("div", { class: "toggle-row" }, enabledLabel, enabled),
      kinds, kindNote, dials),
    group("02", "Medium & time", mediumSeg, mediumNote,
      h("div", { class: "range-row" }, h("label", { for: "speed" }, h("span", {}, "κ Display speed"), speedVal), speed),
      h("p", { class: "caption" }, "Real light oscillates trillions of times a second. The display slows every source by the same factor, so the readouts stay real.")),
    group("03", "Display", disp("showE", "Electric field E"), disp("showB", "Magnetic field B"), disp("showS", "Energy flow S (Poynting)")),
    group("04", "Feedback",
      h("div", { class: "toggle-row" }, h("span", {}, "Sound", h("small", {}, "Each source hums at a pitch set by its frequency; band edges click.")), sound),
      h("div", { class: "toggle-row" }, h("span", {}, "Haptics", h("small", {}, app.feedback.canVibrate ? "Detents at band edges, a firm stop at the ionizing line." : "This browser can't vibrate. The native app uses Core Haptics.")), haptics),
      h("div", { class: "range-row" }, h("label", { for: "strength" }, h("span", {}, "Haptic strength"), h("span", {})), strength)),
    h("div", { class: "row", style: "padding-bottom:8px" }, resetDials, resetAlign),
  );

  app.refreshControls = () => syncs.forEach((x) => x.sync());
  app.refreshControls();
}
