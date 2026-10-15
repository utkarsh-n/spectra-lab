// 05 · Decompose: polarization (Ex + Ey), the probe charge (E shakes, v×B pushes) and Fourier superposition.
import { clear, glowLine, label, arrow, withAlpha, THEME } from "../ui/draw.js";
import { displaySources, fieldAt, hiddenNote } from "../ui/fieldview.js";
import { ellipse, polarizerTransmission, electronTrajectory, a0, fieldForA0, quiverAmplitude, driftSpeed, components } from "../core/wave.js";
import { describe, sci } from "../core/spectrum.js";
import { MEDIA } from "../core/matter.js";

const TAU = 2 * Math.PI;
const TABS = [["polarization", "Polarization"], ["probe", "Probe charge"], ["fourier", "Fourier"]];
const PROBE = [["both", "E + v×B"], ["electric", "E only"], ["magnetic", "B only"]];
let els = null, traj = null, trajKey = "";

const decompose = {
  key: "decompose",
  mount(app, { toolbar, aux, labels }) {
    toolbar.innerHTML = `<div class="seg" role="group" aria-label="Decomposition" style="flex:1">${TABS.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join("")}</div>`;
    toolbar.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { app.state.decompose.tab = b.dataset.tab; app.feedback.detent("action"); decompose.mountTab(app); app.changed({ controls: false }); }));
    els = { toolbar, aux, labels };
    decompose.mountTab(app);
  },
  unmount() { els = null; },
  mountTab(app) {
    const d = app.state.decompose;
    els.toolbar.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tab === d.tab));
    if (d.tab === "polarization") {
      els.aux.innerHTML = `<div class="group" style="padding:12px 16px"><div class="range-row"><label for="pol"><span>Polarizer angle α</span><span data-alpha></span></label><input id="pol" type="range" min="0" max="180" step="1"></div><p class="caption" data-note></p></div>`;
      const inp = els.aux.querySelector("#pol");
      inp.value = d.polarizer;
      inp.addEventListener("input", () => { d.polarizer = +inp.value; if (d.polarizer % 15 === 0) app.feedback.detent("tick"); app.changed({ controls: false }); });
      els.labels.innerHTML = `<div class="tag" style="top:10px;left:12px;color:#1aedff">Ex</div><div class="tag" style="top:10px;left:50%;margin-left:8px;color:#ffe82e">Ey</div><div class="tag" style="top:10px;right:12px;color:#ffbf5e" data-poltag></div><div class="hint">Looking down the beam · E = Ex + Ey</div>`;
    } else if (d.tab === "probe") {
      els.aux.innerHTML = `<div class="group" style="padding:12px 16px">
        <div class="seg small" role="group" aria-label="Forces">${PROBE.map(([k, n]) => `<button data-mode="${k}">${n}</button>`).join("")}</div>
        <div class="range-row"><label for="a0"><span>Strength a₀ = eE₀ / mωc</span><span data-a0></span></label><input id="a0" type="range" min="-2" max="1" step="0.01"></div>
        <p class="caption" data-note></p></div>`;
      els.aux.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { d.probeMode = b.dataset.mode; app.feedback.detent("action"); app.changed({ controls: false }); }));
      const inp = els.aux.querySelector("#a0");
      inp.value = Math.log10(d.a0);
      inp.addEventListener("input", () => { d.a0 = Math.pow(10, +inp.value); app.changed({ controls: false }); });
      els.labels.innerHTML = `<div class="tag" style="top:10px;left:12px">Side view · beam travels →</div><div class="tag" style="top:10px;right:12px" data-drift></div><div class="hint">Electron starts at rest · equal axes, units of λ/2π</div>`;
    } else {
      els.aux.innerHTML = `<p class="caption" data-note style="padding:0 4px"></p>`;
      els.labels.innerHTML = `<div class="tag" style="top:10px;left:12px">Field at one point vs time</div><div class="tag" style="top:52%;left:12px">Frequency content</div><div class="tag" style="top:10px;right:12px" data-hidden></div>`;
    }
    app.dirty = true;
  },
  align(app) { app.state.decompose.polarizer = 30; app.state.decompose.a0 = 1.5; decompose.mountTab(app); },
  readouts(app) {
    const d = app.state.decompose, src = app.active(), e = ellipse(src);
    if (d.tab === "polarization") {
      const psi = (src.theta * Math.PI) / 180;
      return [
        ["Ex₀", Math.abs(Math.cos(psi)).toFixed(2), "of E₀", THEME.ex],
        ["Ey₀", Math.abs(Math.sin(psi)).toFixed(2), "of E₀", THEME.ey],
        ["δ lag", `${Math.round(src.delta)}°`, e.kind, THEME.rose],
        ["Passes", `${Math.round(polarizerTransmission(src, d.polarizer) * 100)}%`, `polarizer at ${d.polarizer}°`, THEME.amber],
        ["Ellipse", `${Math.round(e.orientation)}°`, e.sense ?? "no rotation", THEME.text],
      ];
    }
    if (d.tab === "probe") {
      const real = a0(src.E0, src.lambda);
      return [
        ["a₀ shown", d.a0.toPrecision(3), `drift ${(driftSpeed(d.a0) * 100).toPrecision(3)}% of c`, THEME.amber],
        ["E₀ needed", sci(fieldForA0(d.a0, src.lambda), "V/m"), `at ${describe(src.lambda).text.lambda}`, THEME.e],
        ["Your source", `a₀ ${sci(real)}`, `E₀ ${sci(src.E0, "V/m")}`, THEME.text],
        ["Quiver", describe(quiverAmplitude(src.E0, src.lambda)).text.lambda, "your electron's swing", THEME.mint],
      ];
    }
    return null;
  },
  update(app) {
    if (!els) return;
    const d = app.state.decompose, src = app.active();
    if (d.tab === "polarization") {
      els.aux.querySelector("[data-alpha]").textContent = `${d.polarizer}°`;
      const e = ellipse(src);
      els.aux.querySelector("[data-note]").textContent = e.kind === "linear"
        ? `Ex and Ey move in step, so the tip of E slides along a line at ${Math.round(e.orientation)}°. Malus's law: ${Math.round(polarizerTransmission(src, d.polarizer) * 100)}% gets through.`
        : e.kind === "circular" ? "Ey trails Ex by a quarter cycle, so the tip of E traces a circle. Every polarizer angle passes exactly half."
        : `Ey trails Ex by ${Math.round(src.delta)}°, so the tip of E traces an ellipse. How much passes depends on how the polarizer lines up with it.`;
      const tag = els.labels.querySelector("[data-poltag]");
      if (tag) tag.textContent = `Polarizer ${d.polarizer}°`;
    } else if (d.tab === "probe") {
      els.aux.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === d.probeMode));
      els.aux.querySelector("[data-a0]").textContent = d.a0.toPrecision(3);
      els.aux.querySelector("[data-note]").textContent = {
        both: d.a0 < 0.3 ? "E shakes the electron sideways. The v×B push is a₀²/4 as big, too small to see here. Raise a₀ to watch it." : "E shakes the electron sideways; v×B then pushes it forward twice per cycle. Riding along with the drift, it traces a figure eight.",
        electric: "With the magnetic force switched off, the electron only shakes back and forth and never moves along the beam.",
        magnetic: "B alone does nothing: v×B needs a moving charge, and this one starts at rest. E has to get it moving first.",
      }[d.probeMode];
      const drift = els.labels.querySelector("[data-drift]");
      if (drift) drift.textContent = d.probeMode === "both" ? `Drift ${(driftSpeed(d.a0) * 100).toPrecision(2)}% c` : "No drift";
    } else {
      const ds = displaySources(app.state);
      els.aux.querySelector("[data-note]").textContent = `${ds.list.map((x) => `${"ABC"[x.index]}: ${x.src.kind === "thermal" ? `${x.src.temperature} K thermal` : describe(x.src.lambda).text.lambda}${x.src.kind === "pulse" ? ` pulse (${x.src.cycles} cycles)` : ""}`).join(" · ")}. The top trace is the sum; the stems below show what it's made of.${ds.inMedium ? " The prism inset bends each color by its own index." : ""}`;
      const tag = els.labels.querySelector("[data-hidden]");
      if (tag) tag.textContent = hiddenNote(ds);
    }
  },
  draw(app, ctx, w, h) {
    clear(ctx, w, h);
    const tab = app.state.decompose.tab;
    if (tab === "polarization") drawPolarization(app, ctx, w, h);
    else if (tab === "probe") drawProbe(app, ctx, w, h);
    else drawFourier(app, ctx, w, h);
  },
};
export default decompose;

function drawPolarization(app, ctx, w, h) {
  const ds = displaySources(app.state), t = app.t, sp = app.state.speed;
  const stripH = Math.min(90, h * 0.24);
  const cx = w / 2, cy = (h - stripH) / 2 + 8, R = Math.min(w * 0.36, (h - stripH) * 0.38);
  ctx.strokeStyle = THEME.axis; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - R * 1.3, cy); ctx.lineTo(cx + R * 1.3, cy); ctx.moveTo(cx, cy - R * 1.25); ctx.lineTo(cx, cy + R * 1.25); ctx.stroke();
  // Trace of the tip over one reference period.
  const trail = [];
  for (let i = 0; i <= 120; i++) { const f = fieldAt(ds, 0, t - i / (120 * sp), sp); trail.push([cx + f.ex * R, cy - f.ey * R]); }
  ctx.setLineDash([3, 4]); glowLine(ctx, trail, withAlpha(THEME.e, 0.5), 1.4, 0); ctx.setLineDash([]);
  // Polarizer
  const a = (app.state.decompose.polarizer * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  ctx.setLineDash([6, 5]); ctx.strokeStyle = withAlpha(THEME.amber, 0.8); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - ux * R * 1.2, cy + uy * R * 1.2); ctx.lineTo(cx + ux * R * 1.2, cy - uy * R * 1.2); ctx.stroke(); ctx.setLineDash([]);
  const f = fieldAt(ds, 0, t, sp), tx = cx + f.ex * R, ty = cy - f.ey * R;
  ctx.setLineDash([2, 3]); ctx.strokeStyle = "rgba(232,241,236,0.25)";
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, cy); ctx.moveTo(tx, ty); ctx.lineTo(cx, ty); ctx.stroke(); ctx.setLineDash([]);
  glowLine(ctx, [[cx, cy], [tx, cy]], THEME.ex, 3, 0.15);
  glowLine(ctx, [[cx, cy], [cx, ty]], THEME.ey, 3, 0.15);
  glowLine(ctx, [[cx, cy], [tx, ty]], THEME.e, 2.6, 0.25);
  ctx.fillStyle = THEME.e; ctx.beginPath(); ctx.arc(tx, ty, 4.5, 0, TAU); ctx.fill();
  const p = f.ex * ux + f.ey * uy;
  glowLine(ctx, [[cx, cy], [cx + p * ux * R, cy - p * uy * R]], THEME.amber, 3, 0.1);
  // Component strips: Ex(t), Ey(t), newest at the right.
  const y0 = h - stripH - 4, mid1 = y0 + stripH * 0.28, mid2 = y0 + stripH * 0.72, amp = stripH * 0.2;
  const ex = [], ey = [];
  for (let x = 0; x <= w; x += 3) { const tt = t - ((w - x) / w) * (2.2 / sp); const g = fieldAt(ds, 0, tt, sp); ex.push([x, mid1 - g.ex * amp]); ey.push([x, mid2 - g.ey * amp]); }
  ctx.strokeStyle = "rgba(156,181,166,0.18)"; ctx.beginPath(); ctx.moveTo(0, mid1); ctx.lineTo(w, mid1); ctx.moveTo(0, mid2); ctx.lineTo(w, mid2); ctx.stroke();
  glowLine(ctx, ex, THEME.ex, 1.8, 0); glowLine(ctx, ey, THEME.ey, 1.8, 0);
  label(ctx, "Ex(t)", 8, mid1 - amp - 6, THEME.ex); label(ctx, "Ey(t)", 8, mid2 - amp - 6, THEME.ey); label(ctx, "NOW ›", w - 8, y0 - 6, THEME.dim, "right");
}

function drawProbe(app, ctx, w, h) {
  const d = app.state.decompose, src = app.active(), cycles = 3;
  const key = JSON.stringify([d.a0, d.probeMode, src.theta, src.delta]);
  if (key !== trajKey) { traj = electronTrajectory(src, d.a0, d.probeMode, cycles, 900); trajKey = key; }
  // Equal-aspect side view: z (along beam) →, transverse x/y ↑ (projection onto the polarization direction).
  const psi = (src.theta * Math.PI) / 180;
  const tr = (p) => p.x * Math.cos(psi) + p.y * Math.sin(psi);
  const zMax = Math.max(1e-9, ...traj.map((p) => p.z)), tMax = Math.max(1e-9, ...traj.map((p) => Math.abs(tr(p))));
  const mainW = w * 0.62, pad = 30;
  const s = Math.min((mainW - 2 * pad) / Math.max(zMax, tMax * 0.5), (h - 2 * pad) / (2 * tMax + 1e-9));
  const ox = pad, oy = h / 2;
  ctx.strokeStyle = THEME.axis; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(mainW, oy); ctx.stroke();
  arrow(ctx, mainW - 60, oy + h * 0.38, mainW - 10, oy + h * 0.38, THEME.s, 1.6, 7);
  label(ctx, "BEAM", mainW - 66, oy + h * 0.38, THEME.s, "right");
  glowLine(ctx, traj.map((p) => [ox + p.z * s, oy - tr(p) * s]), withAlpha(THEME.phosphor, 0.55), 1.4, 0);
  // Animate the electron along its path by phase.
  const eta = (TAU * app.state.speed * app.t * 0.5) % (TAU * cycles);
  const i = Math.min(traj.length - 1, Math.round((eta / (TAU * cycles)) * (traj.length - 1)));
  const e = traj[i];
  const ex = ox + e.z * s, ey = oy - tr(e) * s;
  ctx.fillStyle = THEME.phosphor; ctx.beginPath(); ctx.arc(ex, ey, 6, 0, TAU); ctx.fill();
  label(ctx, "e⁻", ex + 10, ey - 10, THEME.phosphor, "left", 11, 600);
  // Field acting now: E transverse, v×B forward.
  if (d.probeMode !== "magnetic") arrow(ctx, ex, ey, ex, ey - 26 * Math.cos(e.eta), THEME.e, 2, 7);
  if (d.probeMode === "both" && e.uz > 1e-6) arrow(ctx, ex, ey, ex + Math.min(40, 14 + 30 * e.uz / (d.a0 * d.a0 / 2 + 1e-9)), ey, THEME.b, 2, 7);
  // Inset: drift frame (figure eight), axes scaled independently and labeled.
  const ix0 = mainW + 20, iw = w - ix0 - 16, icx = ix0 + iw / 2, icy = h / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.strokeRect(ix0, h * 0.18, iw, h * 0.64);
  label(ctx, "RIDING WITH THE DRIFT", ix0, h * 0.18 - 10, THEME.muted);
  if (d.probeMode === "both") {
    const vd = traj[traj.length - 1].z / traj[traj.length - 1].t;
    const pts = traj.map((p) => [p.z - vd * p.t, tr(p)]);
    const zr = Math.max(1e-12, ...pts.map((p) => Math.abs(p[0]))), xr = Math.max(1e-12, ...pts.map((p) => Math.abs(p[1])));
    const sz = (iw * 0.42) / zr, sx = (h * 0.28) / xr;
    glowLine(ctx, pts.map(([z, x]) => [icx + z * sz, icy - x * sx]), THEME.amber, 1.8, 0.2);
    label(ctx, `forward ×${(sz / sx).toPrecision(2)}`, ix0 + 6, h * 0.82 - 10, THEME.dim);
  } else label(ctx, "No forward motion", icx, icy, THEME.dim, "center");
}

function drawFourier(app, ctx, w, h) {
  const ds = displaySources(app.state), t = app.t, sp = app.state.speed;
  const topH = h * 0.46, mid = topH / 2 + 14, amp = topH * 0.36;
  // Time trace: the field at z = 0 projected on each source's polarization, summed.
  const win = 4 / sp;
  const total = [];
  for (let x = 0; x <= w; x += 2) {
    const tt = t - ((w - x) / w) * win;
    const f = fieldAt(ds, 0, tt, sp);
    total.push([x, mid - (f.ex + f.ey) * 0.707 * amp]);
  }
  if (ds.list.length > 1) for (const d of ds.list) {
    const pts = [];
    for (let x = 0; x <= w; x += 3) { const tt = t - ((w - x) / w) * win; const f = fieldAt(ds, 0, tt, sp, d.index); pts.push([x, mid - (f.ex + f.ey) * 0.707 * amp]); }
    glowLine(ctx, pts, withAlpha(d.color, 0.4), 1, 0);
  }
  glowLine(ctx, total, THEME.text, 2, 0.18);
  ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.moveTo(0, topH + 6); ctx.lineTo(w, topH + 6); ctx.stroke();
  // Spectrum: stems on a log-frequency axis spanning all components.
  const all = [];
  for (const d of ds.list) for (const c of components(d.src, 41)) all.push({ ...c, src: d, f: 299792458 / c.lambda, a: c.amp * d.scale });
  if (!all.length) return;
  const lf = all.map((c) => Math.log10(c.f));
  let lo = Math.min(...lf) - 0.15, hi = Math.max(...lf) + 0.15;
  if (hi - lo < 0.4) { const m = (hi + lo) / 2; lo = m - 0.2; hi = m + 0.2; }
  const base = h - 26, top = topH + 34, maxA = Math.max(...all.map((c) => c.a));
  for (const c of all) {
    const x = 16 + ((Math.log10(c.f) - lo) / (hi - lo)) * (w - 32), y = base - (c.a / maxA) * (base - top);
    ctx.strokeStyle = describe(c.lambda).color; ctx.lineWidth = all.length > 20 ? 1.5 : 2.4;
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = describe(c.lambda).color; ctx.beginPath(); ctx.arc(x, y, all.length > 20 ? 1.6 : 3.4, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = THEME.axis; ctx.beginPath(); ctx.moveTo(16, base); ctx.lineTo(w - 16, base); ctx.stroke();
  label(ctx, describe(299792458 / Math.pow(10, lo)).text.lambda, 16, base + 12, THEME.dim);
  label(ctx, describe(299792458 / Math.pow(10, hi)).text.lambda, w - 16, base + 12, THEME.dim, "right");
  label(ctx, "higher frequency →", w / 2, base + 12, THEME.dim, "center");
  // Prism inset: minimum-deviation angle for each source through a 60° prism of the chosen medium.
  if (ds.inMedium) {
    const m = MEDIA[app.state.medium], px = w - 110, py = topH * 0.55, s = 34;
    ctx.fillStyle = "rgba(4,8,7,0.88)"; ctx.fillRect(px - 106, py - s - 12, 210, 2 * s + 40);
    ctx.strokeStyle = "rgba(200,240,255,0.6)"; ctx.fillStyle = "rgba(200,240,255,0.08)";
    ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px - s * 0.87, py + s * 0.5); ctx.lineTo(px + s * 0.87, py + s * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    glowLine(ctx, [[px - 100, py + 6], [px - s * 0.45, py]], "#e8f1ec", 1.6, 0);
    // Minimum-deviation angle through a 60° prism; the spread between colors is exaggerated ×8 to be visible.
    const devs = ds.list.map((d) => { const nk = m.index(d.src.lambda); return nk.valid ? { d, dev: 2 * Math.asin(Math.min(1, nk.n * Math.sin(Math.PI / 6))) - Math.PI / 3 } : null; }).filter(Boolean);
    const mean = devs.reduce((a, x) => a + x.dev, 0) / Math.max(1, devs.length);
    for (const { d, dev } of devs) {
      const ang = 0.25 + (dev - mean) * 8;
      glowLine(ctx, [[px + s * 0.45, py], [px + s * 0.45 + 70 * Math.cos(ang), py + 70 * Math.sin(ang)]], d.color, 1.6, 0.2);
    }
    if (devs.length) label(ctx, `${(mean * 180 / Math.PI).toFixed(1)}° bend · spread ×8`, px, py + s + 18, THEME.dim, "center");
  }
}
