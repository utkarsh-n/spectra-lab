// 01 · Wave scope: E and B in 3D, field arrows, energy flow, superposition and an optional medium.
import { clear, glowLine, arrow, label, withAlpha, THEME } from "../ui/draw.js";
import { displaySources, fieldAt, hiddenNote } from "../ui/fieldview.js";
import { describe } from "../core/spectrum.js";
import { MEDIA } from "../core/matter.js";
import { defaults } from "../core/state.js";

const Z0 = -1.6, Z1 = 1.6, AMP = 0.62, N = 260;
let drag = null, tags = null;

function camera(app, w, h) {
  const sc = app.state.scope;
  const yaw = (sc.yaw * Math.PI) / 180, pitch = (sc.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const S = Math.min(w / 4.5, h / 1.95) * sc.zoom;
  const ox = w / 2 - w * 0.04, oy = h / 2 + 6;
  return (x, y, z) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp;
    return [ox + x1 * S, oy - y2 * S];
  };
}

const scope = {
  key: "scope",
  mount(app, { labels }) {
    labels.innerHTML = `<div class="tag" style="top:10px;left:12px" id="scope-scale"></div><div class="tag" style="top:10px;right:12px" id="scope-medium"></div><div class="hint">Drag to rotate · pinch or scroll to zoom · double-tap to reset</div>`;
    tags = { scale: labels.querySelector("#scope-scale"), medium: labels.querySelector("#scope-medium") };
  },
  unmount() { tags = null; },
  align(app) { const d = defaults().scope; Object.assign(app.state.scope, { yaw: d.yaw, pitch: d.pitch, zoom: d.zoom }); },
  pointer: {
    down(app, p) { drag = p; },
    move(app, p) {
      if (!drag) return;
      const sc = app.state.scope;
      sc.yaw += (p.x - drag.x) * 0.4;
      sc.pitch = Math.max(-60, Math.min(80, sc.pitch + (p.y - drag.y) * 0.3));
      drag = p;
    },
    up(app) { drag = null; app.changed({ controls: false }); },
    zoom(app, f) { const sc = app.state.scope; sc.zoom = Math.max(0.4, Math.min(4, sc.zoom * f)); },
    double(app) { scope.align(app); },
  },
  update(app) {
    if (!tags) return;
    const ds = displaySources(app.state);
    tags.scale.textContent = `1 cycle = ${describe(ds.ref.lambda).text.lambda}${ds.list.length > 1 ? ` · ${ds.list.length} sources` : ""}`;
    tags.medium.textContent = hiddenNote(ds) || (ds.inMedium ? `vacuum | ${MEDIA[app.state.medium].name}` : "Canvas 2D");
  },
  draw(app, ctx, w, h) {
    const st = app.state, sc = st.scope, P = camera(app, w, h);
    const ds = displaySources(st), t = app.t, speed = st.speed;
    clear(ctx, w, h);

    // Medium block on the far half.
    if (ds.inMedium) {
      const box = [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]];
      ctx.fillStyle = "rgba(255,191,94,0.045)";
      ctx.strokeStyle = "rgba(255,191,94,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      box.forEach(([x, y], i) => { const q = P(x, y, 0); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (const [x, y] of box) { const a = P(x, y, 0), b = P(x, y, Z1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.strokeStyle = "rgba(255,191,94,0.12)";
      ctx.stroke();
      const q = P(0.9, 0.9, 0.05);
      label(ctx, MEDIA[st.medium].name.toUpperCase(), q[0] + 4, q[1] - 8, THEME.amber);
    }

    // Sample the field once.
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const z = Z0 + ((Z1 - Z0) * i) / N;
      const f = fieldAt(ds, z, t, speed);
      samples.push({ z, ex: f.ex * AMP, ey: f.ey * AMP, n: f.n });
    }
    const planar = ds.list.every((d) => d.src.delta % 180 === 0) && ds.list.every((d) => d.src.theta === ds.list[0].src.theta);
    const eP = samples.map((s) => P(s.ex, s.ey, s.z));
    const bP = samples.map((s) => P(-s.ey * s.n, s.ex * s.n, s.z));
    const axisColor = describe(ds.ref.lambda).color;

    // Ribbons and stems (the poster's sheets).
    const ribbon = (pts, color) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      const a = P(0, 0, Z1), b = P(0, 0, Z0);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    const stems = (pts, color) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i += 6) { const o = P(0, 0, samples[i].z); ctx.moveTo(o[0], o[1]); ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    if (sc.showE) { if (planar) ribbon(eP, "rgba(97,179,255,0.09)"); stems(eP, "rgba(97,179,255,0.42)"); }
    if (sc.showB) { if (planar) ribbon(bP, "rgba(255,92,122,0.08)"); stems(bP, "rgba(255,92,122,0.36)"); }

    // Beam axis in the wave's own color.
    const a0 = P(0, 0, Z0 - 0.2), a1 = P(0, 0, Z1);
    glowLine(ctx, [a0, a1], axisColor, 1.6, 0.25);

    // Individual sources when superposed.
    if (ds.list.length > 1 && sc.showE) {
      for (const d of ds.list) {
        const pts = [];
        for (let i = 0; i <= N; i += 2) { const z = Z0 + ((Z1 - Z0) * i) / N; const f = fieldAt(ds, z, t, speed, d.index); pts.push(P(f.ex * AMP, f.ey * AMP, z)); }
        glowLine(ctx, pts, withAlpha(d.color, 0.45), 1.1, 0);
      }
    }
    if (sc.showB) glowLine(ctx, bP, THEME.b, 2.3, 0.18);
    if (sc.showE) glowLine(ctx, eP, THEME.e, 2.5, 0.22);

    // Energy flow S = E × B / μ0 along +z.
    if (sc.showS) {
      const s0 = P(0, 0, Z1 + 0.05), s1 = P(0, 0, Z1 + 0.55);
      arrow(ctx, s0[0], s0[1], s1[0], s1[1], THEME.s, 2.4, 10);
      label(ctx, "S", s1[0] + 8, s1[1] - 8, THEME.s, "left", 11, 600);
    }
    // Axis labels at the near end.
    const e0 = P(0, AMP + 0.12, Z0), b0 = P(-(AMP + 0.18), 0, Z0);
    if (sc.showE) label(ctx, "E", e0[0], e0[1], THEME.e, "center", 11, 600);
    if (sc.showB) label(ctx, "B", b0[0], b0[1], THEME.b, "center", 11, 600);
  },
};
export default scope;
