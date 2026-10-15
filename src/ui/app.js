// Spectra web prototype: state, layout, transport and the render loop. Instruments live in ../instruments.
import { defaults, deserialize, serialize, editSource, INSTRUMENTS, slowMotion, enabledSources, sanitize } from "../core/state.js";
import { applyPreset, PRESETS } from "../core/presets.js";
import { describe, crossedDetents, BANDS, sci, frequency } from "../core/spectrum.js";
import { intensity, peakB, photonFlux } from "../core/wave.js";
import { MEDIA } from "../core/matter.js";
import { Feedback } from "./feedback.js";
import { fit } from "./draw.js";
import { mountControls } from "./controls.js";
import { renderNotes } from "./notes.js";
import scope from "../instruments/scope.js";
import tuner from "../instruments/tuner.js";
import bench from "../instruments/bench.js";
import decompose from "../instruments/decompose.js";
import lab from "../instruments/lab.js";

const MODULES = { scope, tuner, bench, decompose, lab };
const $ = (id) => document.getElementById(id);
const STORE = "spectra.v1";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BAND_JUMP = { gamma: 1.24e-12, xray: 20.7e-12, uv: 254e-9, visible: 550e-9, ir: 9.3e-6, microwave: 0.1224, radio: 3 };

let saved = null;
try { saved = localStorage.getItem(STORE); } catch {}
const state = saved ? deserialize(saved) : defaults();
if (reduceMotion) state.playing = false;

export const app = {
  state,
  t: 0,
  dirty: true,
  feedback: null,
  active: () => state.sources[state.active],
  describe: () => describe(state.sources[state.active].lambda),
  medium: () => MEDIA[state.medium],
  module: () => MODULES[state.instrument],
  set(patch) {
    Object.assign(state, patch);
    this.changed();
  },
  changed({ controls = true } = {}) {
    this.dirty = true;
    if (controls) this.refreshControls?.();
    saveSoon();
  },
  // Edit a field of the active source (Link applies it to all), with detents for wavelength.
  edit(key, value, { quiet = false } = {}) {
    const src = this.active();
    const before = src.lambda;
    editSource(state, key, value);
    if (!quiet && src.lambda !== before) {
      for (const d of crossedDetents(Math.log10(before), Math.log10(src.lambda))) this.feedback.detent(d.kind === "ionizing" ? "ionizing" : "band");
    }
    state.preset = null;
    this.changed();
  },
  setLambda(lambda, opts) { this.edit("lambda", lambda, opts); },
  toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove("show"), 6500);
  },
  preset(key) {
    Object.assign(state, applyPreset(state, key));
    this.t = 0;
    const p = PRESETS.find((x) => x.key === key);
    this.toast(`${p.name}: ${p.note}`);
    this.feedback.detent("action");
    selectInstrument(state.instrument, true);
    this.changed();
  },
};
app.feedback = new Feedback(() => state.feedback);

let saveTimer = 0;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, serialize({ ...state, playing: state.playing })); } catch {} }, 400);
}

// ---------- chrome ----------
function buildBands() {
  const el = $("bands");
  el.innerHTML = "";
  for (const b of BANDS) {
    const btn = document.createElement("button");
    btn.textContent = b.short;
    btn.setAttribute("aria-label", b.name);
    btn.addEventListener("click", () => { app.setLambda(BAND_JUMP[b.key]); });
    btn.dataset.band = b.key;
    el.append(btn);
  }
}
function syncBands() {
  const band = app.describe().band;
  for (const btn of $("bands").children) {
    const on = btn.dataset.band === band.key;
    btn.setAttribute("aria-pressed", on);
    btn.style.setProperty("--seg-color", on ? app.describe().color : "");
  }
}

function buildInstruments() {
  const el = $("instruments");
  for (const inst of INSTRUMENTS) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.key = inst.key;
    btn.textContent = inst.name;
    btn.addEventListener("click", () => selectInstrument(inst.key));
    el.append(btn);
  }
}

let mounted = null;
function selectInstrument(key, force = false) {
  if (mounted === key && !force) return;
  state.instrument = key;
  const inst = INSTRUMENTS.find((i) => i.key === key);
  $("inst-title").innerHTML = `<b>${String(INSTRUMENTS.indexOf(inst) + 1).padStart(2, "0")}</b>${inst.name}`;
  $("inst-detail").textContent = inst.detail;
  for (const b of $("instruments").children) {
    const on = b.dataset.key === key;
    b.setAttribute("aria-pressed", on);
    if (on && !force) b.scrollIntoView({ inline: "nearest", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }
  for (const id of ["inst-toolbar", "inst-aux", "stage-labels"]) $(id).innerHTML = "";
  MODULES[mounted]?.unmount?.(app);
  mounted = key;
  MODULES[key].mount?.(app, { toolbar: $("inst-toolbar"), aux: $("inst-aux"), labels: $("stage-labels"), stage: $("stage") });
  app.dirty = true;
  saveSoon();
  slowTick(true);
}

// ---------- readouts ----------
function defaultReadouts() {
  const d = app.describe(), src = app.active(), m = app.medium().index(src.lambda);
  const n = state.medium === "vacuum" ? 1 : m.n;
  const rows = [
    ["λ wavelength", d.text.lambda, state.medium !== "vacuum" && m.valid ? `${describe(src.lambda / n).text.lambda} in ${app.medium().name.toLowerCase()}` : d.text.wavenumber, d.color],
    ["f frequency", d.text.f, `period ${sci(1 / d.f, "s")}`, "#59f0b0"],
    ["E photon", d.text.ev, d.text.kcal, "#ffbf5e"],
    ["B₀ field", sci(peakB(src.E0, n), "T"), `E₀ ${sci(src.E0, "V/m")}`, "#ff5c7a"],
    ["Intensity", sci(intensity(src.E0, n), "W/m²"), `${sci(photonFlux(src.E0, src.lambda, n) * 1e-4)} photons/cm²·s`, "#e8f1ec"],
  ];
  if (state.medium !== "vacuum") rows.push(["n medium", m.valid ? m.n.toFixed(4) : "no data", m.valid ? `speed ${(1 / m.n).toFixed(3)} c` : "outside model range", "#ffbf5e"]);
  return rows;
}
function renderReadouts() {
  const mod = app.module();
  const rows = mod.readouts?.(app) ?? defaultReadouts();
  const el = $("readouts");
  if (el.children.length !== rows.length) {
    el.innerHTML = rows.map(() => `<div class="readout"><span class="k"></span><span class="v"></span><span class="s"></span></div>`).join("");
  }
  rows.forEach(([k, v, s, color], i) => {
    const c = el.children[i];
    if (c.children[0].textContent !== k) c.children[0].textContent = k;
    if (c.children[1].textContent !== v) c.children[1].textContent = v;
    c.children[1].style.color = color || "";
    c.children[2].textContent = s || "";
  });
  const d = app.describe();
  const [left, right] = mod.status?.(app) ?? [`${d.sub}`, d.ion.label.toUpperCase()];
  $("statusline").innerHTML = `<span>${left}</span><span class="mono" style="color:${d.ion.key === "ionizing" ? "var(--ionizing)" : d.ion.key === "bond" ? "var(--amber)" : "var(--phosphor)"}">${right}</span>`;
  $("slowmo").textContent = `${sci(slowMotion(state))}× slower`;
}

function slowTick(force) {
  syncBands();
  renderReadouts();
  app.module().update?.(app, force);
  const play = $("play");
  play.querySelector("use").setAttribute("href", state.playing ? "#i-pause" : "#i-play");
  play.querySelector("span").textContent = state.playing ? "Pause" : "Play";
  const freqs = enabledSources(state).map((s) => frequency(s.lambda));
  app.feedback.setTones(freqs, state.playing);
}

// ---------- canvas input ----------
function bindStage() {
  const canvas = $("canvas");
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  const pointers = new Map();
  let lastTap = 0, pinch = null;
  canvas.addEventListener("pointerdown", (e) => {
    app.feedback.unlock();
    try { canvas.setPointerCapture(e.pointerId); } catch {} // synthetic or already-released pointers
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    const now = performance.now();
    if (now - lastTap < 300) { app.module().pointer?.double?.(app, pos(e)); app.dirty = true; lastTap = 0; return; }
    lastTap = now;
    app.module().pointer?.down?.(app, pos(e), e);
    app.dirty = true;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      app.module().pointer?.zoom?.(app, d / pinch.d);
      pinch.d = d;
    } else app.module().pointer?.move?.(app, pos(e), e);
    app.dirty = true;
  });
  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) app.module().pointer?.up?.(app, pos(e), e);
    app.dirty = true;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => {
    if (!app.module().pointer?.zoom) return;
    e.preventDefault();
    app.module().pointer.zoom(app, Math.exp(-e.deltaY * 0.0015));
    app.dirty = true;
  }, { passive: false });
}

// ---------- loop ----------
let last = 0, slow = 0, lowPower = false;
function frame(ts) {
  requestAnimationFrame(frame);
  const minDt = lowPower ? 1000 / 30 : 0;
  if (last && ts - last < minDt) return;
  const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
  last = ts;
  if (state.playing) { app.t += dt; app.dirty = true; }
  if (ts - slow > 100) { slow = ts; slowTick(); }
  if (!app.dirty || (document.hidden && !app.forceRender)) return; // forceRender: debugging hook for hidden previews
  app.dirty = false;
  const { ctx, w, h } = fit($("canvas"));
  app.module().draw(app, ctx, w, h, dt);
}
document.addEventListener("visibilitychange", () => { last = 0; app.dirty = true; });
navigator.getBattery?.().then((b) => { const f = () => (lowPower = b.level < 0.2 && !b.charging); f(); b.addEventListener("levelchange", f); }).catch(() => {});

// ---------- wiring ----------
function openControls(open) {
  $("controls").classList.toggle("open", open);
  $("scrim").classList.toggle("open", open);
}
function wire() {
  $("open-controls").addEventListener("click", () => openControls(true));
  $("open-controls-2").addEventListener("click", () => openControls(true));
  $("scrim").addEventListener("click", () => openControls(false));
  app.closeControls = () => openControls(false);
  $("open-notes").addEventListener("click", () => { renderNotes($("notes"), app); $("notes-dialog").showModal(); });
  $("play").addEventListener("click", () => { app.feedback.unlock(); state.playing = !state.playing; app.feedback.detent("action"); app.changed({ controls: false }); slowTick(); });
  $("step").addEventListener("click", () => { state.playing = false; app.t += 1 / 60; app.dirty = true; app.feedback.detent("tick"); slowTick(); });
  $("align").addEventListener("click", () => { app.module().align?.(app); app.feedback.detent("action"); app.changed({ controls: false }); });
  $("fullscreen").addEventListener("click", () => {
    const full = $("instrument").classList.toggle("full");
    $("fullscreen").querySelector("use").setAttribute("href", full ? "#i-collapse" : "#i-expand");
    $("fullscreen").setAttribute("aria-label", full ? "Exit full screen" : "Full screen");
    app.dirty = true;
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, [role=slider], dialog")) return;
    if (e.key === " " && e.target === document.body) { e.preventDefault(); $("play").click(); }
    if (e.key === "Escape") { openControls(false); if ($("instrument").classList.contains("full")) $("fullscreen").click(); }
  });
  addEventListener("resize", () => (app.dirty = true));
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    try { new EventSource("/__events").onmessage = (e) => e.data === "reload" && location.reload(); } catch {}
  }
}

state.sources.forEach(sanitize);
buildBands();
buildInstruments();
mountControls($("controls"), app);
wire();
bindStage();
selectInstrument(state.instrument, true);
requestAnimationFrame(frame);
window.spectra = app; // for console debugging
