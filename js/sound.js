// SoundEngine — Web Audio port of the Swift WAV synth. Same oscillator math,
// same note data. Renders SE/BGM into AudioBuffers at prepare() (first tap).

const SR = 44100;
let noiseState = 0x2f6e2b1;
function noise() { // same LCG as the Swift Synth
  noiseState = (noiseState * 1664525 + 1013904223) >>> 0;
  return (noiseState - 2147483648) / 2147483647;
}

class Synth {
  constructor(seconds) {
    this.buf = new Float32Array(Math.ceil(SR * seconds));
    this.sr = SR;
  }
  osc(w, f, t) {
    switch (w) {
      case "sine": return Math.sin(2 * Math.PI * f * t);
      case "square": return Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1;
      case "saw": return 2 * (f * t % 1) - 1;
      case "tri": return 2 * Math.abs(2 * (f * t % 1) - 1) - 1;
      case "noise": return noise();
    }
  }
  add(t0, dur, wave = "sine", f0, f1 = null, gain = 0.5, attack = 0.005, decay = -1, lpf = false) {
    const dec = decay >= 0 ? decay : dur;
    const s0 = Math.floor(t0 * this.sr), s1 = Math.min(this.buf.length, s0 + Math.floor(dur * this.sr));
    let last = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / this.sr;
      const x = t / dur;
      const f = f0 + ((f1 ?? f0) - f0) * x;
      let s = this.osc(wave, f, t);
      if (lpf) { s = (s + last) * 0.5; last = s; }
      const a = Math.min(1, t / Math.max(attack, 0.0001));
      const d = Math.max(0, 1 - Math.max(0, t - (dur - dec)) / dec);
      this.buf[i] += s * gain * a * d;
    }
  }
  hit(t0, dur = 0.08, wave = "noise", f = 3000, gain = 0.5, decay = 0.05) {
    this.add(t0, dur, wave, f, f * 0.5, gain, 0.001, decay, true);
  }
  normalize(k0 = 0.85) {
    let peak = 0.001;
    for (const v of this.buf) peak = Math.max(peak, Math.abs(v));
    const k = k0 / peak;
    for (let i = 0; i < this.buf.length; i++) this.buf[i] *= k;
  }
}

const m = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

function composeBGM(kind) {
  let bpm;
  const bars = 4;
  const seq = [];
  const n = (beat, d, f, g, w, bpm) => {
    const spb = 60.0 / bpm;
    seq.push({ t: beat * spb, d: d * spb, f, g, w });
  };
  if (kind === "idle") {
    bpm = 92;
    const bass = [45, 45, 43, 41];
    const arp = [57, 60, 64, 69, 72, 69, 64, 60];
    for (let b = 0; b < bars; b++) {
      n(b * 4, 3.4, m(bass[b]), 0.30, "tri", bpm);
      n(b * 4, 0.5, m(bass[b] + 12), 0.06, "sine", bpm);
      arp.forEach((a, i) => n(b * 4 + i * 0.5, 0.4, m(a), 0.10, "sine", bpm));
    }
  } else if (kind === "reach") {
    bpm = 140;
    for (let b = 0; b < bars; b++) {
      for (let e = 0; e < 8; e++) {
        n(b * 4 + e * 0.5, 0.22, m(40), 0.34, "square", bpm);
        n(b * 4 + e * 0.5 + 0.25, 0.05, 6000, 0.10, "noise", bpm);
      }
      for (const [bt, f] of [[1.0, 52], [1.5, 55], [3.0, 52], [3.5, 57]]) {
        n(b * 4 + bt, 0.18, m(f), 0.16, "saw", bpm);
        n(b * 4 + bt, 0.18, m(f + 3), 0.10, "saw", bpm);
      }
      n(b * 4 + 2, 0.12, 180, 0.5, "noise", bpm);
    }
  } else { // rush
    bpm = 168;
    const chords = [[48, 52, 55], [45, 52, 57], [50, 53, 57], [47, 50, 55]];
    const leadPat = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    for (let b = 0; b < bars; b++) {
      const ch = chords[b];
      for (let e = 0; e < 8; e++) {
        n(b * 4 + e * 0.5, 0.24, m(ch[0] - 24 + (e % 2 === 0 ? 0 : 12)), 0.34, "saw", bpm);
        n(b * 4 + e * 0.5 + 0.25, 0.05, 7000, 0.09, "noise", bpm);
      }
      leadPat.forEach((bt, i) => n(b * 4 + bt, 0.4, m(ch[i % ch.length] + 24), 0.16, "square", bpm));
      n(b * 4 + 2, 0.12, 200, 0.45, "noise", bpm);
    }
  }
  const total = bars * 4 * 60 / bpm + 0.05;
  const s = new Synth(total);
  for (const nn of seq) if (nn.f > 0) s.add(nn.t, nn.d, nn.w, nn.f, null, nn.g, 0.004);
  s.normalize(0.8);
  return s;
}

function buildSE(name) {
  const s = new Synth(1.6);
  switch (name) {
    case "splash":
      s.add(0, 0.28, "noise", 1200, 300, 0.5, 0.002, -1, true);
      s.add(0, 0.1, "sine", 300, 90, 0.4); break;
    case "bite": s.add(0, 0.09, "square", 880, 660, 0.35); break;
    case "tick": s.add(0, 0.04, "square", 1500, null, 0.2); break;
    case "heart":
      s.add(0, 0.10, "sine", 80, 50, 0.9);
      s.add(0.14, 0.09, "sine", 75, 48, 0.7); break;
    case "riser": s.add(0, 1.1, "saw", 200, 1600, 0.25, 0.05); break;
    case "siren":
      for (let i = 0; i < 6; i++) s.add(i * 0.22, 0.2, "square", i % 2 === 0 ? 620 : 930, null, 0.22); break;
    case "cutin":
      s.add(0, 0.5, "saw", 110, 110, 0.4);
      s.add(0, 0.5, "saw", 165, 165, 0.3);
      s.add(0, 0.12, "noise", 3000, null, 0.4, 0.005, -1, true);
      s.add(0.12, 0.4, "saw", 220, 220, 0.35); break;
    case "count": s.add(0, 0.1, "square", 660, null, 0.35); break;
    case "countgo": s.add(0, 0.3, "square", 990, null, 0.4); break;
    case "hook":
      s.hit(0, 0.06, "noise", 5000, 0.5);
      s.add(0.02, 0.35, "saw", 220, 440, 0.4); break;
    case "perfect":
      [523, 659, 784, 1047].forEach((f, i) => s.add(i * 0.07, 0.25, "square", f, null, 0.3)); break;
    case "fanfare": {
      const notes = [[0, 523], [0.1, 659], [0.2, 784], [0.35, 1047], [0.35, 784], [0.55, 1319]];
      for (const [t, f] of notes) s.add(t, 0.3, "square", f, null, 0.28);
      for (const [t, f] of notes) s.add(t, 0.3, "tri", f / 2, null, 0.22);
      break;
    }
    case "fanfare_big": {
      const chords = [[0, [523, 659, 784]], [0.15, [587, 740, 880]], [0.3, [659, 784, 988]],
                      [0.5, [784, 988, 1175]], [0.5, [523, 659, 784]], [0.75, [1047, 1319, 1568]]];
      for (const [t, ch] of chords) for (const f of ch) s.add(t, 0.4, "square", f, null, 0.2);
      s.add(0.75, 1.0, "saw", 262, null, 0.25);
      s.add(0.75, 1.0, "saw", 392, null, 0.2);
      break;
    }
    case "coin":
      s.add(0, 0.06, "square", 1980, null, 0.25);
      s.add(0.05, 0.12, "square", 2640, null, 0.2); break;
    case "escape":
      s.add(0, 0.5, "saw", 440, 110, 0.3);
      s.add(0.1, 0.3, "noise", 800, 200, 0.2, 0.005, -1, true); break;
    case "surge":
      s.add(0, 0.2, "saw", 150, 320, 0.4);
      s.hit(0, 0.08, "noise", 2500, 0.3); break;
    case "break":
      s.hit(0, 0.06, "noise", 6000, 0.55);
      s.add(0.03, 0.6, "saw", 500, 60, 0.35); break;
    case "reel": s.add(0, 0.05, "square", 2200, null, 0.12); break;
    case "rush_in":
      for (let i = 0; i < 8; i++) s.add(i * 0.06, 0.2, "square", 523 + i * 120, null, 0.22);
      s.add(0.5, 0.8, "saw", 523, null, 0.25);
      s.add(0.5, 0.8, "saw", 784, null, 0.2); break;
    case "rush_out":
      [784, 659, 523, 392].forEach((f, i) => s.add(i * 0.16, 0.42, "tri", f, null, 0.3)); break;
    case "charge": s.add(0, 0.7, "sine", 220, 880, 0.25); break;
    case "cast": s.add(0, 0.25, "noise", 2500, 700, 0.3, 0.005, -1, true); break;
    case "deny": s.add(0, 0.15, "square", 220, 180, 0.3); break;
    case "thunder":
      s.hit(0, 0.45, "noise", 900, 0.65, 0.3);
      s.add(0.02, 0.7, "sine", 95, 38, 0.7);
      s.hit(0.06, 0.3, "noise", 400, 0.4, 0.25); break;
    case "shine":
      [1568, 1976, 2349, 2637, 3136].forEach((f, i) => s.add(i * 0.05, 0.3, "sine", f, null, 0.16)); break;
    case "impact":
      s.hit(0, 0.1, "noise", 1800, 0.55);
      s.add(0, 0.4, "sine", 120, 42, 0.8); break;
  }
  s.normalize(0.85);
  return s;
}

const SE_NAMES = ["splash", "bite", "tick", "heart", "riser", "siren", "cutin", "count", "countgo",
  "hook", "perfect", "fanfare", "fanfare_big", "coin", "escape", "surge", "break", "reel",
  "rush_in", "rush_out", "charge", "cast", "deny", "thunder", "shine", "impact"];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.seIndex = {};
    this.muted = false;
    this.bgmNodes = null;   // {src, gain, kind}
    this.currentBGM = null;
    this.built = false;
  }

  prepare() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (!this.built) {
      this.built = true;
      for (const name of SE_NAMES) this.buffers[name] = this.toBuffer(buildSE(name));
      for (const kind of ["idle", "reach", "rush"]) this.buffers["bgm_" + kind] = this.toBuffer(composeBGM(kind));
    }
  }

  toBuffer(synth) {
    const b = this.ctx.createBuffer(1, synth.buf.length, SR);
    b.copyToChannel(synth.buf, 0);
    return b;
  }

  play(name) {
    if (this.muted || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.connect(this.master);
    src.start();
  }

  bgm(kind) {
    if (!this.buffers["bgm_" + kind] || this.currentBGM === kind) return;
    this.currentBGM = kind;
    const g = this.ctx.createGain();
    g.gain.value = this.muted ? 0 : 0.5;
    g.connect(this.master);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers["bgm_" + kind];
    src.loop = true;
    src.connect(g);
    src.start();
    // fade out the old one (old reference detached before fading, like the Swift fix)
    const old = this.bgmNodes;
    this.bgmNodes = { src, gain: g, kind };
    if (old) {
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      setTimeout(() => { try { old.src.stop(); old.src.disconnect(); old.gain.disconnect(); } catch {} }, 1200);
    }
  }

  stopBGM() {
    const old = this.bgmNodes;
    this.bgmNodes = null;
    this.currentBGM = null;
    if (old) {
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => { try { old.src.stop(); old.src.disconnect(); old.gain.disconnect(); } catch {} }, 400);
    }
  }

  applyMute() {
    if (this.bgmNodes) this.bgmNodes.gain.gain.value = this.muted ? 0 : 0.5;
  }
}
