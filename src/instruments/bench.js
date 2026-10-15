// 03 · Matter bench: one beam, seven pieces of matter. The stage animates the focused specimen;
// cards list every specimen's answer with its provenance.
import { clear, label, withAlpha, glowLine, arrow, THEME } from "../ui/draw.js";
import { SPECIMENS, inSeries } from "../core/specimens.js";
import { describe, sci } from "../core/spectrum.js";

const TAU = 2 * Math.PI;
let cards = null, lastResonance = {}, results = {};
const focusOf = (app) => app.state.bench.focus ?? "water";

const pct = (v) => (v == null ? "—" : v >= 0.995 && v < 1 ? ">99%" : v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);

function evaluateAll(app) {
  const src = app.active();
  for (const s of SPECIMENS) results[s.key] = s.evaluate(src.lambda, src, { lambda0: app.state.bench.lambda0 });
  return results;
}

function cardHTML(s) {
  const extra = s.key === "oscillator"
    ? `<label class="range-row" style="gap:2px"><span style="display:flex;justify-content:space-between;font-size:12px;color:#b9ccc0"><span>Resonance λ₀</span><span class="mono" data-l0></span></span><input type="range" min="-8" max="0" step="0.01" data-l0in aria-label="Oscillator resonance wavelength"></label>`
    : "";
  return `<article class="spec" data-key="${s.key}">
    <div class="body">
      <div class="nm"><button class="focus-btn" data-focus aria-pressed="false"><b>${s.name}</b></button><i>${s.sub}</i><span class="badge" data-src></span><span class="badge res" data-res hidden>Resonance</span></div>
      <div class="tx" data-tx></div>
      <div class="bar" data-bar><span data-t></span><span data-r style="background:rgba(232,241,236,0.45)"></span><span data-a style="background:rgba(255,191,94,0.55)"></span></div>
      <div class="num" data-num></div>${extra}
    </div></article>`;
}

const bench = {
  key: "bench",
  mount(app, { toolbar, aux, labels }) {
    toolbar.innerHTML = `<div class="seg small" role="group" aria-label="Arrangement" style="flex:1;max-width:340px"><button data-arr="side">Side by side</button><button data-arr="series">In series</button></div>
      <span class="mono" style="font-size:10.5px;color:var(--muted)"><span class="badge table">table</span> measured · <span class="badge model">model</span> physics</span>`;
    toolbar.querySelectorAll("[data-arr]").forEach((b) => b.addEventListener("click", () => { app.state.bench.arrangement = b.dataset.arr; app.feedback.detent("action"); app.changed({ controls: false }); bench.update(app, true); }));
    aux.innerHTML = `<div class="specimens">${SPECIMENS.map(cardHTML).join("")}</div>`;
    cards = {};
    aux.querySelectorAll(".spec").forEach((el) => {
      cards[el.dataset.key] = el;
      el.addEventListener("click", (e) => { if (e.target.closest("input,label")) return; app.state.bench.focus = el.dataset.key; app.feedback.detent("action"); app.changed({ controls: false }); bench.update(app, true); });
    });
    const l0 = aux.querySelector("[data-l0in]");
    l0.addEventListener("input", () => { app.state.bench.lambda0 = Math.pow(10, +l0.value); app.changed({ controls: false }); bench.update(app, true); });
    labels.innerHTML = `<div class="tag" style="top:10px;left:12px" data-stage-title></div><div class="tag" style="top:10px;right:12px" data-stage-src></div>`;
    lastResonance = {};
  },
  unmount() { cards = null; },
  update(app) {
    if (!cards) return;
    const r = evaluateAll(app), st = app.state, d = app.describe(), focus = focusOf(app);
    const series = st.bench.arrangement === "series" ? Object.fromEntries(inSeries(d.lambda, app.active()).map((x) => [x.key, x])) : null;
    document.querySelectorAll("[data-arr]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.arr === st.bench.arrangement));
    for (const s of SPECIMENS) {
      const el = cards[s.key], x = r[s.key];
      el.querySelector("[data-focus]").setAttribute("aria-pressed", focus === s.key);
      el.style.outline = focus === s.key ? "1px solid rgba(102,245,143,0.5)" : "";
      const resonant = x.response.resonance || (s.key === "oscillator" && x.response.where === "on") || (s.key === "antenna" && x.response.value > 0.5);
      el.classList.toggle("res", !!resonant);
      el.querySelector("[data-res]").hidden = !resonant;
      if (resonant && !lastResonance[s.key]) app.feedback.detent("resonance");
      lastResonance[s.key] = resonant;
      const badge = el.querySelector("[data-src]");
      badge.className = `badge ${x.source}`;
      badge.textContent = x.source;
      el.querySelector("[data-tx]").textContent = x.response.text;
      const bar = el.querySelector("[data-bar]");
      let num = "";
      if (typeof x.T === "number") {
        const T = series ? series[s.key].after : x.T, R = series ? 0 : x.R ?? 0;
        bar.hidden = false;
        bar.querySelector("[data-t]").style.cssText = `width:${T * 100}%;background:${d.color}`;
        bar.querySelector("[data-r]").style.width = `${R * 100}%`;
        bar.querySelector("[data-a]").style.width = `${Math.max(0, 1 - T - R) * 100}%`;
        num = series ? `BEAM LEFT ${pct(series[s.key].after)} · THIS ONE PASSES ${pct(x.T)}` : `T ${pct(x.T)} · R ${pct(x.R ?? 0)} · A ${pct(x.A)}`;
      } else bar.hidden = true;
      if (s.key === "oscillator") {
        num = `AMPLITUDE ${x.response.amplitude.toFixed(2)}× · LAG ${Math.round(x.response.lag)}°`;
        el.querySelector("[data-l0]").textContent = describe(st.bench.lambda0).text.lambda;
        const inp = el.querySelector("[data-l0in]");
        if (document.activeElement !== inp) inp.value = Math.log10(st.bench.lambda0);
      }
      if (s.key === "antenna") num = `INDUCED CURRENT ${Math.round(x.response.value * 100)}% OF PEAK`;
      if (s.key === "water" && x.response.heating > 1e-6) num += ` · HEATS ${x.response.heating >= 0.01 && x.response.heating < 1000 ? x.response.heating.toPrecision(2) : sci(x.response.heating)} °C/min AT SURFACE`;
      if (s.key === "zinc" && x.response.eject) num += ` · e⁻ KE ≤ ${x.response.eject.keMax < 1e3 ? x.response.eject.keMax.toFixed(2) + " eV" : (x.response.eject.keMax / 1e3).toFixed(1) + " keV"}`;
      if (s.key === "hand") num = `SOFT ${pct(x.T)} · THROUGH BONE ${pct(x.boneT)}${x.contrast > 0.02 ? ` · CONTRAST ${Math.round(x.contrast * 100)}%` : ""}`;
      if (s.key === "dna" && x.absorbance > 0.01) num += ` · A ${x.absorbance.toFixed(2)}`;
      el.querySelector("[data-num]").textContent = num;
    }
    const f = SPECIMENS.find((s) => s.key === focus);
    document.querySelector("[data-stage-title]").textContent = `${f.name} · ${f.sub}`;
    document.querySelector("[data-stage-src]").textContent = `${d.text.lambda} · ${d.text.ev}`;
  },
  status(app) {
    const r = results[focusOf(app)];
    return [r?.response?.text?.split(". ")[0] ?? "", app.describe().ion.label.toUpperCase()];
  },
  draw(app, ctx, w, h) {
    clear(ctx, w, h);
    const focus = focusOf(app);
    const r = results[focus] ?? evaluateAll(app)[focus];
    const color = app.describe().color, t = app.t, k = app.state.speed;
    if (focus === "oscillator") return drawSpring(ctx, w, h, r, color, t, k, app);
    if (focus === "antenna") return drawAntenna(ctx, w, h, r, color, t, k);
    drawSlab(ctx, w, h, r, color, t, k, focus);
  },
};
export default bench;

function wave(ctx, x0, x1, y, amp, color, t, k, phase0 = 0, decay = 0, width = 2.2) {
  const pts = [];
  for (let x = x0; x <= x1; x += 2) {
    const u = (x - x0) / 60;
    const a = amp * Math.exp(-decay * (x - x0));
    pts.push([x, y - a * Math.cos(TAU * (u - k * t) + phase0)]);
  }
  glowLine(ctx, pts, color, width, 0.2);
}

function drawSlab(ctx, w, h, r, color, t, k, key) {
  const cy = h / 2, A = Math.min(56, h * 0.16);
  const sx0 = w * 0.42, sx1 = w * 0.58;
  const T = r.T ?? 1, R = r.R ?? 0;
  // incoming and reflected
  wave(ctx, 16, sx0, cy, A, color, t, k);
  if (R > 0.01) {
    const pts = [];
    for (let x = sx0; x >= 16; x -= 2) pts.push([x, cy + A * 0.9 + 18 - A * 0.5 * Math.sqrt(R) * Math.cos(TAU * ((sx0 - x) / 60 - k * t))]);
    glowLine(ctx, pts, withAlpha("#e8f1ec", 0.6), 1.4, 0);
    arrow(ctx, sx0 - 30, cy + A + 40, sx0 - 70, cy + A + 40, "rgba(232,241,236,0.6)", 1.4, 6);
    label(ctx, `REFLECTED ${Math.round(R * 100)}%`, sx0 - 76, cy + A + 40, THEME.muted, "right");
  }
  // slab
  const tint = { water: "rgba(97,179,255,0.10)", glass: "rgba(200,240,255,0.08)", zinc: "rgba(150,165,175,0.35)", dna: "rgba(199,153,255,0.10)", hand: "rgba(255,170,150,0.12)" }[key] ?? "rgba(255,255,255,0.06)";
  ctx.fillStyle = tint;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.roundRect(sx0, cy - h * 0.34, sx1 - sx0, h * 0.68, 8); ctx.fill(); ctx.stroke();
  // inside: decaying wave
  const inside = T > 0 ? -Math.log(Math.max(T, 1e-6)) / (sx1 - sx0) : 0.08;
  wave(ctx, sx0, sx1, cy, A * (1 - R) ** 0.5, color, t, k, TAU * ((sx0 - 16) / 60), inside / 2, 1.6);
  // transmitted
  if (T > 0.002) wave(ctx, sx1, w - 16, cy, A * Math.sqrt(T), color, t, k, TAU * ((sx1 - 16) / 60), 0, 2.2);
  else label(ctx, "NOTHING GETS THROUGH", (sx1 + w) / 2, cy, THEME.dim, "center");
  label(ctx, `TRANSMITTED ${T >= 0.995 ? ">99" : T < 0.005 && T > 0 ? "<1" : Math.round(T * 100)}%`, (sx1 + w) / 2, cy - A - 22, color, "center", 11, 600);
  label(ctx, "INCOMING", (16 + sx0) / 2, cy - A - 22, THEME.muted, "center");

  const kind = r.response.kind;
  if (kind === "twist" || kind === "stretch") {
    // Molecules inside the slab respond, lagging the field.
    const heat = Math.min(1, (r.response.heating ?? 0) / 30);
    ctx.fillStyle = `rgba(255,120,80,${0.12 * heat})`;
    ctx.fillRect(sx0 + 1, cy - h * 0.34 + 1, sx1 - sx0 - 2, h * 0.68 - 2);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      const mx = sx0 + ((i + 0.5) * (sx1 - sx0)) / 4, my = cy - h * 0.27 + (j * h * 0.54) / 4;
      const drive = Math.cos(TAU * (k * t) - 1.1);
      const ang = kind === "twist" ? 0.8 * drive : 0, stretch = kind === "stretch" ? 1 + 0.25 * drive : 1;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
      ctx.strokeStyle = "rgba(232,241,236,0.5)"; ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 7 * stretch, 6 * stretch); ctx.stroke(); }
      ctx.fillStyle = THEME.b; ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#e8f1ec"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 7 * stretch, 6 * stretch, 2.2, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  if (kind === "eject" && r.response.eject) {
    const v = Math.min(1, 0.25 + Math.sqrt(r.response.eject.keMax) / 4);
    for (let i = 0; i < 9; i++) {
      const life = ((t * 0.7 + i / 9) % 1), ang = -1.2 + (i * 2.4) / 9;
      const x = sx0 - life * 140 * v * Math.cos(ang) * 0.9, y = cy + life * 140 * v * Math.sin(ang);
      ctx.fillStyle = withAlpha(THEME.phosphor, 1 - life);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
    }
    label(ctx, "e⁻", sx0 - 40, cy - h * 0.3, THEME.phosphor, "center", 12, 600);
  }
  if (kind === "dimer" || key === "dna") {
    const flash = r.response.resonance ? 0.5 + 0.5 * Math.cos(TAU * k * t) : 0;
    const mx = (sx0 + sx1) / 2;
    for (let i = 0; i <= 16; i++) {
      const yy = cy - h * 0.3 + (i * h * 0.6) / 16, ph = i * 0.7 + t;
      const xa = mx + 14 * Math.sin(ph), xb = mx - 14 * Math.sin(ph);
      ctx.strokeStyle = i % 4 === 2 ? withAlpha(THEME.amber, 0.25 + 0.75 * flash) : "rgba(255,255,255,0.3)";
      ctx.lineWidth = i % 4 === 2 && flash > 0 ? 2.4 : 1.2;
      ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xb, yy); ctx.stroke();
      ctx.fillStyle = THEME.violet; ctx.beginPath(); ctx.arc(xa, yy, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = THEME.e; ctx.beginPath(); ctx.arc(xb, yy, 2.2, 0, TAU); ctx.fill();
    }
  }
  if (key === "hand") {
    // Film behind the finger: soft-tissue shade vs bone shade.
    const fx = w - 70, fy = cy - h * 0.3, fh = h * 0.6;
    ctx.fillStyle = `rgba(232,241,236,${0.08 + 0.85 * T})`; ctx.fillRect(fx, fy, 40, fh);
    ctx.fillStyle = `rgba(232,241,236,${0.08 + 0.85 * (r.boneT ?? T)})`; ctx.fillRect(fx, fy + fh * 0.35, 40, fh * 0.3);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.strokeRect(fx, fy, 40, fh);
    label(ctx, "FILM", fx + 20, fy - 10, THEME.muted, "center");
    ctx.fillStyle = "rgba(235,225,210,0.35)";
    ctx.beginPath(); ctx.roundRect(sx0 + 12, cy - h * 0.1, sx1 - sx0 - 24, h * 0.2, 10); ctx.fill();
    label(ctx, "BONE", (sx0 + sx1) / 2, cy, "#0b110f", "center", 10, 700);
  }
}

function drawSpring(ctx, w, h, r, color, t, k, app) {
  const { amplitude, lag } = r.response;
  const cy = h * 0.45, A = Math.min(60, h * 0.17);
  // Driving field (left), the spring and charge (centre), response curve (right).
  const drive = Math.cos(TAU * k * t);
  const ex = w * 0.16;
  arrow(ctx, ex, cy, ex, cy - A * drive, THEME.e, 2.6, 9);
  label(ctx, "E drives", ex, cy + A + 26, THEME.e, "center");
  const x = Math.min(1.6, amplitude) * Math.cos(TAU * k * t - (lag * Math.PI) / 180);
  const cx = w * 0.42, top = cy - A * 2.1, by = cy - A * 0.9 * x;
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(cx - 40, top - 8, 80, 8);
  ctx.strokeStyle = "rgba(232,241,236,0.6)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, top);
  const coils = 14;
  for (let i = 1; i <= coils; i++) { const yy = top + ((by - 14 - top) * i) / coils; ctx.lineTo(cx + (i % 2 ? 10 : -10), yy); }
  ctx.lineTo(cx, by - 14); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, by, 12, 0, TAU); ctx.fill();
  label(ctx, "−", cx, by + 0.5, "#04140a", "center", 14, 700);
  label(ctx, `lags ${Math.round(lag)}°`, cx, cy + A + 26, THEME.amber, "center");
  // Response curve: amplitude vs drive wavelength, log axis spanning λ0 ×/÷ 10.
  const gx0 = w * 0.6, gx1 = w - 20, gy0 = h * 0.18, gy1 = h * 0.78;
  ctx.strokeStyle = THEME.axis; ctx.lineWidth = 1; ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
  const l0 = app.state.bench.lambda0, Q = 8, pts = [];
  for (let i = 0; i <= 160; i++) {
    const u = i / 160, l = l0 * Math.pow(10, 1 - 2 * u);
    const wr = l0 / l, amp = 1 / Math.hypot(1 - wr * wr, wr / Q);
    pts.push([gx0 + u * (gx1 - gx0), gy1 - Math.min(1, amp / Q) * (gy1 - gy0)]);
  }
  glowLine(ctx, pts, THEME.amber, 1.8, 0.15);
  const lnow = app.active().lambda, u = (1 - Math.log10(lnow / l0)) / 2;
  if (u >= 0 && u <= 1) {
    const mx = gx0 + u * (gx1 - gx0);
    ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(mx, gy0); ctx.lineTo(mx, gy1); ctx.stroke();
  } else label(ctx, u < 0 ? "◀ far longer" : "far shorter ▶", (gx0 + gx1) / 2, gy0 + 14, THEME.muted, "center");
  label(ctx, "RESPONSE", gx0, gy0 - 10, THEME.muted);
  label(ctx, "longer λ", gx0, gy1 + 12, THEME.dim);
  label(ctx, "shorter λ", gx1, gy1 + 12, THEME.dim, "right");
}

function drawAntenna(ctx, w, h, r, color, t, k) {
  const cx = w * 0.55, cy = h / 2, L = h * 0.32, I = r.response.value;
  wave(ctx, 16, cx - 40, cy, Math.min(50, h * 0.15), color, t, k);
  ctx.strokeStyle = "#b8c4cc"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx, cy - L); ctx.lineTo(cx, cy - 6); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + L); ctx.stroke();
  const slosh = I * Math.cos(TAU * k * t);
  for (let i = 0; i < 10; i++) {
    const base = -L + ((i + 0.5) * 2 * L) / 10, yy = cy + base + slosh * L * 0.18 * Math.cos((base / L) * Math.PI / 2);
    ctx.fillStyle = withAlpha(THEME.phosphor, 0.5 + 0.5 * I); ctx.beginPath(); ctx.arc(cx + 9, yy, 2.6, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = withAlpha(THEME.amber, 0.15 + 0.85 * I * Math.abs(Math.sin(TAU * k * t)));
  ctx.beginPath(); ctx.arc(cx + 60, cy, 14, 0, TAU); ctx.fill();
  label(ctx, "RECEIVER", cx + 60, cy + 30, THEME.muted, "center");
  label(ctx, `CURRENT ${Math.round(I * 100)}%`, cx, cy - L - 16, I > 0.5 ? THEME.amber : THEME.muted, "center", 11, 600);
}
