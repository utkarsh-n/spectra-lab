// Optional sound and haptics. Both are off-by-default-safe: nothing plays until the person turns it on
// and has touched the page (browsers require a gesture before audio or vibration).
//
// Sound: each enabled source hums at a pitch mapped from its real frequency (log scale, 15 decades →
// four octaves), and detents click. Haptics: navigator.vibrate where supported (Android); on iOS
// Safari 18+ a hidden switch control gives a system tick. The native app replaces both with Core Haptics.

const LOG_F_MIN = 5.5, LOG_F_MAX = 21.5; // ~300 kHz .. ~3e21 Hz
export const pitchFor = (f) => 110 * Math.pow(2, (4 * (Math.log10(f) - LOG_F_MIN)) / (LOG_F_MAX - LOG_F_MIN));

export class Feedback {
  constructor(getSettings) {
    this.settings = getSettings;
    this.ctx = null;
    this.voices = [];
    this.lastHaptic = 0;
    this.lastClick = 0;
    this.iosSwitch = null;
    if (typeof navigator !== "undefined" && !("vibrate" in navigator) && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document) {
      const label = document.createElement("label");
      label.className = "visually-hidden";
      label.setAttribute("aria-hidden", "true");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.append(input);
      document.body.append(label);
      this.iosSwitch = label;
    }
  }

  get canVibrate() { return typeof navigator !== "undefined" && ("vibrate" in navigator || !!this.iosSwitch); }

  unlock() {
    if (!this.settings().sound || this.ctx) { this.ctx?.state === "suspended" && this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  // Keep one hum per source at its mapped pitch; silence when paused or sound is off.
  setTones(freqs, active) {
    const on = this.settings().sound && active && this.ctx;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.voices.length < freqs.length) {
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = "sine";
      gain.gain.value = 0;
      osc.connect(gain).connect(this.master);
      osc.start();
      this.voices.push({ osc, gain });
    }
    this.voices.forEach((v, i) => {
      const f = freqs[i];
      if (f) v.osc.frequency.setTargetAtTime(pitchFor(f), now, 0.03);
      v.gain.gain.setTargetAtTime(on && f ? 0.05 / Math.max(1, freqs.length) : 0, now, 0.06);
    });
  }

  blip(freq, dur, gain, type = "triangle") {
    if (!this.ctx || !this.settings().sound) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + dur);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  haptic(pattern) {
    const s = this.settings();
    if (!s.haptics) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers block vibration before a tap
    const t = performance.now();
    if (t - this.lastHaptic < 35) return; // rate limit, like Orbitals' quantized detents
    this.lastHaptic = t;
    const scale = (ms) => Math.max(1, Math.round(ms * (0.4 + 0.6 * s.strength)));
    if ("vibrate" in navigator) navigator.vibrate(Array.isArray(pattern) ? pattern.map(scale) : scale(pattern));
    else if (this.iosSwitch) {
      this.iosSwitch.click();
      if (Array.isArray(pattern) && pattern.length > 2) setTimeout(() => this.iosSwitch.click(), pattern[0] + pattern[1]);
    }
  }

  // kind: "band" (band edge), "ionizing" (hard stop), "tick" (quantized dial step),
  //       "resonance" (crossed a specimen's resonance), "action" (button)
  detent(kind) {
    const t = performance.now();
    if (kind === "tick" && t - this.lastClick < 45) return;
    this.lastClick = t;
    if (kind === "band") { this.haptic(10); this.blip(1400, 0.035, 0.08); }
    else if (kind === "ionizing") { this.haptic([18, 40, 18]); this.blip(95, 0.16, 0.22, "sine"); this.blip(1800, 0.03, 0.07); }
    else if (kind === "resonance") { this.haptic(24); this.blip(220, 0.25, 0.12, "sine"); }
    else if (kind === "action") { this.haptic(8); this.blip(900, 0.03, 0.05); }
    else { this.haptic(4); this.blip(2200, 0.012, 0.025); }
  }
}
