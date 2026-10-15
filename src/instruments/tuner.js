// 02 · Spectrum tuner: the poster as a draggable log ruler with λ, f and E axes.
import { clear, label, withAlpha, THEME } from "../ui/draw.js";
import { BANDS, LOG_MIN, LOG_MAX, SIZE_COMPARISONS, nearestComparison, describe, spectralRGB } from "../core/spectrum.js";
import { C, HC_EV_M, IONIZING_EV, PAIR_THRESHOLD_EV } from "../core/constants.js";
import { planckLambda, wienPeak, pulseBandwidth } from "../core/wave.js";

const SUP = (n) => String(n).replace(/[-0-9]/g, (ch) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(ch)]);
let geo = null, dragging = false;

function layout(w, h) {
  const top = 26, bottom = h - 30;
  const narrow = w < 520;
  const cols = narrow
    ? { lam: 54, strip: 60, stripW: 44, f: 110, e: 150, comp: 194, compSize: 9.5 }
    : { lam: 70, strip: 80, stripW: 70, f: 160, e: 214, comp: 290, compSize: 10.5 };
  const y = (lg) => top + ((lg - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (bottom - top);
  const lgAt = (py) => LOG_MIN + ((py - top) / (bottom - top)) * (LOG_MAX - LOG_MIN);
  return { top, bottom, y, lgAt, ...cols, w, h };
}

function lengthLabel(e) {
  const units = [[-12, "pm"], [-9, "nm"], [-6, "µm"], [-3, "mm"], [0, "m"], [3, "km"]];
  if (e === -2) return "1 cm";
  if (e === -1) return "10 cm";
  const [base, u] = units.filter(([b]) => b <= e).pop() ?? [-15, "fm"];
  return `${10 ** (e - base)} ${u}`;
}

const tuner = {
  key: "tuner",
  mount(app, { labels }) {
    labels.innerHTML = `<div class="hint">Drag to tune · each band edge is a detent</div>`;
  },
  align() {},
  status(app) {
    const d = app.describe(), c = nearestComparison(d.lambda);
    const r = c.ratio >= 1 ? `${c.ratio.toFixed(c.ratio < 10 ? 1 : 0)}×` : `1/${(1 / c.ratio).toFixed(1 / c.ratio < 10 ? 1 : 0)} of`;
    return [`One wave ≈ ${r} ${c.label}`, d.ion.label.toUpperCase()];
  },
  pointer: {
    down(app, p) {
      if (!geo) return;
      // Grab the nearest cursor if close, otherwise move the active one.
      let best = -1, bd = 16;
      app.state.sources.forEach((s, i) => { if (!s.enabled) return; const d = Math.abs(geo.y(Math.log10(s.lambda)) - p.y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0 && best !== app.state.active) { app.state.active = best; app.changed(); }
      dragging = true;
      tuner.pointer.move(app, p);
    },
    move(app, p) {
      if (!dragging || !geo) return;
      const src = app.active();
      if (src.kind === "thermal") app.edit("temperature", Math.min(1e8, Math.max(1, (2.897771955e-3) / Math.pow(10, geo.lgAt(p.y)))));
      else app.setLambda(Math.pow(10, Math.max(LOG_MIN, Math.min(LOG_MAX, geo.lgAt(p.y)))));
    },
    up() { dragging = false; },
  },
  draw(app, ctx, w, h) {
    const g = (geo = layout(w, h));
    clear(ctx, w, h, 0);
    const { y } = g;
    // Column headers
    label(ctx, "λ", g.lam, 12, THEME.dim, "right");
    label(ctx, "f (Hz)", g.f, 12, THEME.dim);
    label(ctx, "E", g.e, 12, THEME.dim);
    label(ctx, "ONE WAVE ≈", g.comp, 12, THEME.dim);

    // Band strip
    for (const b of BANDS) {
      const y0 = Math.max(g.top, y(Math.log10(Math.max(b.lo, 1e-30)))), y1 = Math.min(g.bottom, y(Math.log10(Math.min(b.hi, 1e30))));
      if (y1 <= y0) continue;
      if (b.key === "visible") {
        for (let py = y0; py < y1; py += 1) {
          const nm = 1e9 * Math.pow(10, g.lgAt(py + 0.5));
          const [r, gg, bb] = spectralRGB(nm);
          ctx.fillStyle = `rgb(${Math.round(255 * Math.max(r, 0.15))},${Math.round(255 * Math.max(gg, 0.15))},${Math.round(255 * Math.max(bb, 0.15))})`;
          ctx.fillRect(g.strip, py, g.stripW, 1.2);
        }
      } else {
        ctx.fillStyle = withAlpha(b.color, 0.2);
        ctx.fillRect(g.strip, y0, g.stripW, y1 - y0);
        if (y1 - y0 > 16) label(ctx, b.short === "Radio" ? "RADIO" : b.key === "microwave" ? "µWAVE" : b.short.toUpperCase(), g.strip + g.stripW / 2, (y0 + y1) / 2, b.color, "center", 9.5);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(g.strip + 0.5, g.top + 0.5, g.stripW - 1, g.bottom - g.top - 1, 10);
    ctx.stroke();

    // λ ticks every decade (labels every decade on tall screens, every other on short ones)
    const every = h < 420 ? 2 : 1;
    ctx.strokeStyle = "rgba(156,181,166,0.45)";
    for (let e = LOG_MIN; e <= LOG_MAX; e++) {
      const py = y(e);
      ctx.beginPath(); ctx.moveTo(g.strip - 7, py); ctx.lineTo(g.strip, py); ctx.stroke();
      if ((e - LOG_MIN) % every === 0) label(ctx, lengthLabel(e), g.lam - 4, py, THEME.muted, "right", 10);
    }
    // f ticks every two decades, E ticks every three
    for (let n = 22; n >= 4; n -= 2) {
      const py = y(Math.log10(C) - n);
      if (py > g.top - 2 && py < g.bottom + 2) label(ctx, `10${SUP(n)}`, g.f, py, withAlpha(THEME.mint, 0.85));
    }
    for (const [txt, ev] of [["10 MeV", 1e7], ["1 MeV", 1e6], ["1 keV", 1e3], ["1 eV", 1], ["1 meV", 1e-3], ["1 µeV", 1e-6]]) {
      const py = y(Math.log10(HC_EV_M / ev));
      if (py > g.top - 2 && py < g.bottom + 2) label(ctx, txt, g.e, py, withAlpha(THEME.amber, 0.85));
    }
    // Size comparisons
    const near = nearestComparison(app.active().lambda);
    for (const c of SIZE_COMPARISONS) {
      const py = y(Math.log10(c.size));
      if (py < g.top || py > g.bottom || g.comp > w - 40) continue;
      const on = c === SIZE_COMPARISONS.find((x) => x.label === near.label) && near.decades < 0.5;
      ctx.strokeStyle = on ? THEME.text : "#4f6457";
      ctx.beginPath(); ctx.moveTo(g.comp - 10, py); ctx.lineTo(g.comp - 4, py); ctx.stroke();
      label(ctx, c.label, g.comp, py, on ? THEME.text : "#6f887b", "left", g.compSize, on ? 700 : 400);
    }
    // Thresholds
    const dashed = (lam, color, text) => {
      const py = y(Math.log10(lam));
      ctx.setLineDash([4, 3]); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(g.strip, py); ctx.lineTo(g.comp - 14, py); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, text, g.f, py - 7, color, "left", 9.5);
    };
    dashed(HC_EV_M / IONIZING_EV, THEME.ionizing, "▲ IONIZING · 10 eV");
    dashed(HC_EV_M / PAIR_THRESHOLD_EV, THEME.violet, "▲ PAIR PRODUCTION");

    // Source spectra (thermal glow, pulse bandwidth) and cursors
    app.state.sources.forEach((s, i) => {
      if (!s.enabled) return;
      const color = describe(s.lambda).color, isActive = i === app.state.active;
      if (s.kind === "thermal") {
        const peak = planckLambda(wienPeak(s.temperature), s.temperature) * wienPeak(s.temperature);
        ctx.beginPath();
        ctx.moveTo(g.strip + g.stripW, g.top);
        for (let py = g.top; py <= g.bottom; py += 2) {
          const l = Math.pow(10, g.lgAt(py));
          const v = (planckLambda(l, s.temperature) * l) / peak;
          ctx.lineTo(g.strip + g.stripW + v * (g.comp - g.strip - g.stripW - 24), py);
        }
        ctx.lineTo(g.strip + g.stripW, g.bottom);
        ctx.fillStyle = withAlpha(THEME.amber, 0.13);
        ctx.fill();
        ctx.strokeStyle = withAlpha(THEME.amber, 0.7);
        ctx.stroke();
      }
      if (s.kind === "pulse") {
        const bw = pulseBandwidth(s), y0 = y(Math.log10(s.lambda / (1 + bw / 2))), y1 = y(Math.log10(s.lambda / (1 - bw / 2)));
        ctx.fillStyle = withAlpha(THEME.amber, 0.18);
        ctx.fillRect(g.strip - 4, y0, g.stripW + 8, Math.max(2, y1 - y0));
      }
      const py = y(Math.log10(s.lambda));
      ctx.strokeStyle = color;
      ctx.globalAlpha = isActive ? 0.18 : 0.08;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      ctx.globalAlpha = isActive ? 1 : 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      ctx.globalAlpha = 1;
      const pillW = g.stripW + 22, px = g.strip - 11;
      ctx.fillStyle = "#0b1210";
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 1.8 : 1;
      ctx.beginPath(); ctx.roundRect(px, py - 10, pillW, 20, 10); ctx.fill(); ctx.stroke();
      label(ctx, `${"ABC"[i]} ${describe(s.lambda).text.lambda}`, px + pillW / 2, py + 0.5, color, "center", 10, 600);
    });
  },
};
export default tuner;
