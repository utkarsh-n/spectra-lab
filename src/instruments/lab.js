// 06 · Spectroscopy lab: sweep a sample and its spectrum draws behind the cursor. The sweep tunes the
// active source, so the rest of the app follows along.
import { clear, glowLine, label, withAlpha, THEME } from "../ui/draw.js";
import { SAMPLES, larmor } from "../core/samples.js";
import { describe, displayColor, sig3 } from "../core/spectrum.js";

const MODE_NAMES = { emission: "Emission", absorption: "Absorption", ir: "IR absorption", raman: "Raman", a: "Chlorophyll a", b: "Chlorophyll b", 400: "400 MHz", 60: "60 MHz" };
const BALMER = { "2-3": "Hα", "2-4": "Hβ", "2-5": "Hγ", "2-6": "Hδ", "1-2": "Lyα", "3-4": "Paα" };
let els = null, maxCache = {}, dragging = false, lastPeak = false, geo = null;

const sample = (app) => SAMPLES.find((s) => s.key === app.state.lab.sample) ?? SAMPLES[0];
const xAt = (s, u) => (s.axis.kind === "lambda-log" ? s.axis.from * Math.pow(s.axis.to / s.axis.from, u) : s.axis.from + (s.axis.to - s.axis.from) * u);
function maxOf(s, mode) {
  const k = s.key + mode;
  if (maxCache[k]) return maxCache[k];
  let m = 1e-12;
  for (let i = 0; i <= 2400; i++) m = Math.max(m, s.value(xAt(s, i / 2400), mode));
  return (maxCache[k] = m);
}
function axisText(s, x) {
  if (s.axis.kind === "wavenumber") return `${sig3(x)} cm⁻¹`;
  if (s.axis.kind === "ppm") return `${x.toFixed(2)} ppm`;
  return describe(x).text.lambda;
}

const lab = {
  key: "lab",
  mount(app, { toolbar, aux, labels }) {
    els = { toolbar, aux, labels };
    lab.build(app);
  },
  unmount() { els = null; },
  build(app) {
    const s = sample(app), L = app.state.lab;
    if (!s.modes.includes(L.mode)) L.mode = s.modes[0];
    els.toolbar.innerHTML = `<div class="chips" role="group" aria-label="Sample" style="margin:0;padding:0;flex-basis:100%">${SAMPLES.map((x) => `<button class="chip" data-sample="${x.key}" aria-pressed="${x.key === s.key}">${x.name}</button>`).join("")}</div>
      <div class="seg small" role="group" aria-label="Technique" style="flex:1">${s.modes.map((m) => `<button data-mode="${m}" aria-pressed="${m === L.mode}">${MODE_NAMES[m]}</button>`).join("")}</div>
      <button class="glass" data-sweep><svg class="icon" style="width:14px;height:14px"><use href="#i-play"/></svg><span>Sweep</span></button>`;
    els.toolbar.querySelectorAll("[data-sample]").forEach((b) => b.addEventListener("click", () => { L.sample = b.dataset.sample; L.sweep = 0; L.sweeping = false; app.feedback.detent("action"); lab.build(app); lab.tune(app); }));
    els.toolbar.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { L.mode = b.dataset.mode; app.feedback.detent("action"); lab.build(app); lab.tune(app); }));
    els.toolbar.querySelector("[data-sweep]").addEventListener("click", () => { app.feedback.unlock(); L.sweeping = !L.sweeping; if (L.sweeping && L.sweep >= 0.999) L.sweep = 0; app.state.playing = true; app.changed({ controls: false }); });
    els.aux.innerHTML = `<p class="caption" style="padding:0 4px;display:flex;gap:8px;align-items:baseline"><span class="badge ${s.source}">${s.source}</span><span data-note></span></p>`;
    els.labels.innerHTML = `<div class="tag" style="top:10px;left:12px" data-ylabel></div><div class="tag" style="top:10px;right:12px" data-cursor></div><div class="hint">Drag to scan by hand · Sweep to scan automatically</div>`;
    app.dirty = true;
  },
  tune(app) {
    const s = sample(app), L = app.state.lab;
    app.setLambda(s.toLambda(xAt(s, L.sweep), L.mode));
  },
  align(app) { app.state.lab.sweep = 0; lab.tune(app); },
  pointer: {
    down(app, p) { dragging = true; app.state.lab.sweeping = false; lab.pointer.move(app, p); },
    move(app, p) {
      if (!dragging || !geo) return;
      app.state.lab.sweep = Math.min(1, Math.max(0, (p.x - geo.x0) / (geo.x1 - geo.x0)));
      lab.tune(app);
    },
    up() { dragging = false; },
  },
  readouts(app) {
    const s = sample(app), L = app.state.lab, x = xAt(s, L.sweep), d = describe(s.toLambda(x, L.mode));
    const rows = [
      [s.axis.label, axisText(s, x), MODE_NAMES[L.mode], THEME.phosphor],
      ["λ", d.text.lambda, d.sub, d.color],
      ["f", d.text.f, "", THEME.mint],
      ["E photon", d.text.ev, d.text.kcal, THEME.amber],
    ];
    if (s.key === "nmr") {
      const B0 = L.mode === "60" ? 1.41 : 9.4;
      rows.push(["Offset from TMS", `${(larmor(B0, x) - larmor(B0, 0)).toFixed(1)} Hz`, `B₀ ${B0} T`, THEME.violet]);
    }
    return rows;
  },
  status(app) {
    const s = sample(app), L = app.state.lab;
    return [`${s.name} · ${MODE_NAMES[L.mode]}`, L.sweeping ? "SWEEPING" : `${Math.round(L.sweep * 100)}% SCANNED`];
  },
  update(app) {
    if (!els) return;
    const s = sample(app), L = app.state.lab;
    els.aux.querySelector("[data-note]").textContent = s.note(L.mode);
    const btn = els.toolbar.querySelector("[data-sweep]");
    btn.querySelector("use").setAttribute("href", L.sweeping ? "#i-pause" : "#i-play");
    btn.querySelector("span").textContent = L.sweeping ? "Pause sweep" : "Sweep";
    btn.setAttribute("aria-pressed", L.sweeping);
    els.labels.querySelector("[data-ylabel]").textContent = s.key === "hydrogen" ? (L.mode === "emission" ? "Emission intensity" : "Absorption") : s.key === "nmr" ? "Signal" : L.mode === "raman" ? "Raman intensity" : "Absorbance";
    els.labels.querySelector("[data-cursor]").textContent = axisText(s, xAt(s, L.sweep));
  },
  draw(app, ctx, w, h, dt) {
    const s = sample(app), L = app.state.lab;
    if (L.sweeping && app.state.playing) {
      L.sweep = Math.min(1, L.sweep + dt * 0.06);
      if (L.sweep >= 1) L.sweeping = false;
      lab.tune(app);
    }
    clear(ctx, w, h);
    const x0 = 34, x1 = w - 18, y0 = 34, stripH = s.key === "hydrogen" ? 34 : 0, y1 = h - 40 - stripH;
    geo = { x0, x1 };
    const max = maxOf(s, L.mode), N = Math.max(400, Math.round((x1 - x0) * 2));
    const cu = L.sweep, done = [], ahead = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = s.value(xAt(s, u), L.mode) / max;
      const p = [x0 + u * (x1 - x0), y1 - Math.min(1.05, v) * (y1 - y0)];
      (u <= cu ? done : ahead).push(p);
    }
    if (done.length) ahead.unshift(done[done.length - 1]);
    // axis + ticks
    ctx.strokeStyle = THEME.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, x = x0 + u * (x1 - x0);
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 4); ctx.stroke();
      label(ctx, axisText(s, xAt(s, u)), x, y1 + 14, THEME.dim, i === 0 ? "left" : i === 6 ? "right" : "center");
    }
    ctx.setLineDash([2, 4]); glowLine(ctx, ahead, "rgba(156,181,166,0.3)", 1.1, 0); ctx.setLineDash([]);
    if (done.length > 1) {
      ctx.beginPath(); ctx.moveTo(done[0][0], y1);
      for (const p of done) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(done[done.length - 1][0], y1); ctx.closePath();
      ctx.fillStyle = "rgba(102,245,143,0.08)"; ctx.fill();
      glowLine(ctx, done, THEME.phosphor, 1.8, 0.2);
    }
    // Hydrogen: label the famous lines and show a spectroscope strip.
    if (s.key === "hydrogen") {
      for (const l of s.lines(L.mode)) {
        const u = Math.log(l.lambda / s.axis.from) / Math.log(s.axis.to / s.axis.from);
        if (u < 0 || u > 1) continue;
        const x = x0 + u * (x1 - x0), col = displayColor(l.lambda), seen = u <= cu;
        ctx.fillStyle = seen ? withAlpha(col.length === 7 ? col : "#ffffff", 0.35 + 0.65 * l.strength) : "rgba(255,255,255,0.05)";
        ctx.fillRect(x - 1, h - 34, 2, 26);
        const name = BALMER[`${l.n1}-${l.n2}`];
        if (name && seen) label(ctx, name, x, y1 - l.strength * (y1 - y0) / (max > 0 ? max : 1) - 10, col, "center", 10, 600);
      }
      label(ctx, "SPECTROSCOPE", x0, h - 40, THEME.dim);
      for (const [lo, hi] of [[400e-9, 700e-9]]) {
        const ua = Math.log(lo / s.axis.from) / Math.log(s.axis.to / s.axis.from), ub = Math.log(hi / s.axis.from) / Math.log(s.axis.to / s.axis.from);
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.strokeRect(x0 + ua * (x1 - x0), h - 35, (ub - ua) * (x1 - x0), 28);
      }
    }
    // Cursor
    const cx = x0 + cu * (x1 - x0), col = app.describe().color;
    ctx.strokeStyle = withAlpha(col.length === 7 ? col : "#e8f1ec", 0.2); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, y0 - 10); ctx.lineTo(cx, y1); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, y0 - 10); ctx.lineTo(cx, y1); ctx.stroke();
    // Resonance thump when the cursor crosses a strong feature.
    const here = s.value(xAt(s, cu), L.mode) / max > 0.35;
    if (here && !lastPeak) app.feedback.detent("resonance");
    lastPeak = here;
  },
};
export default lab;
