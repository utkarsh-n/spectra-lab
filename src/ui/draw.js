// Canvas helpers shared by the instruments: crisp sizing, phosphor glow, grids and labels.
export const THEME = {
  plot: "#040807", grid: "rgba(102,245,143,0.06)", axis: "rgba(156,181,166,0.35)",
  text: "#e8f1ec", muted: "#9cb5a6", dim: "#7e978a", phosphor: "#66f58f", amber: "#ffbf5e",
  e: "#61b3ff", b: "#ff5c7a", s: "#ffbf5e", mint: "#59f0b0", violet: "#c799ff", rose: "#ff8fb8",
  ionizing: "#ff8f6b", ex: "#1aedff", ey: "#ffe82e",
  sources: ["#66f58f", "#ff8fb8", "#8fd3ff"],
  mono: '10px "SF Mono", ui-monospace, Menlo, monospace',
};

export function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height, dpr };
}

export function clear(ctx, w, h, grid = 26) {
  ctx.fillStyle = THEME.plot;
  ctx.fillRect(0, 0, w, h);
  if (!grid) return;
  ctx.strokeStyle = THEME.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = (w / 2) % grid; x <= w; x += grid) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
  for (let y = (h / 2) % grid; y <= h; y += grid) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
  ctx.stroke();
}

// Polyline with a soft phosphor bloom underneath.
export function glowLine(ctx, pts, color, width = 2.2, glow = 0.22) {
  if (pts.length < 2) return;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trace(ctx, pts);
  if (glow > 0) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = glow;
    ctx.lineWidth = width * 3.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
export function trace(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

export function label(ctx, text, x, y, color = THEME.muted, align = "left", size = 10, weight = 400) {
  ctx.font = `${weight} ${size}px "SF Mono", ui-monospace, Menlo, monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

export function arrow(ctx, x0, y0, x1, y1, color, width = 2, head = 8) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
  ctx.stroke();
}

export function withAlpha(hex, a) {
  if (hex.startsWith("rgb")) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Pointer bookkeeping for one canvas: drag, pinch and double-tap without fighting the page scroll.
export function pointerState() {
  return { pointers: new Map(), last: null, pinch: null, lastTap: 0 };
}
