// Haptics — navigator.vibrate mapping of the Core Haptics patterns.
// iOS Safari does not support vibrate(); play() is then a no-op (the toggle still persists).

const P = {
  castRelease: (c) => [Math.round(30 + 40 * (c.power ?? 0.5))],
  lastCast: () => [40, 60, 40, 60, 80],
  lureLanded: (c) => c.big ? [35, 40, 25] : [20],
  nibble: () => [12],
  bite: () => [30, 30, 20],
  cutIn: (c) => c.premium ? [50, 60, 50, 60, 120] : [40, 50, 70],
  heartbeat: (c) => {
    const lv = c.level ?? 1;
    return lv >= 4 ? [60, 50, 60, 50, 90] : lv >= 3 ? [50, 45, 70] : [35, 40, 45];
  },
  countdown: () => [25],
  surge: (c) => c.strong ? [60, 50, 80] : [30],
  mashTap: (c) => {
    const p = c.progress ?? 0;
    if (c.closing) return [Math.round(30 + 25 * p)];
    return [Math.round(14 + 26 * p)];
  },
  hook: () => [55, 40, 35],
  catchResult: (c) => {
    const r = c.rarity; // numeric Rarity enum: n0 r1 sr2 ssr3 ur4 lr5
    if (r === 5) return [80, 60, 60, 60, 60, 60, 200];
    if (r === 4) return [70, 50, 70, 50, 150];
    if (r === 3) return [55, 45, 90];
    if (r === 2) return [45, 40, 65];
    if (r === 1) return [35, 30, 40];
    return [28];
  },
  rushIn: (c) => c.continued ? [60, 45, 60, 45, 120] : [45, 40, 45, 40, 80],
  shortMiss: () => [15],
  lineSnap: (c) => c.nearMiss ? [70, 50, 60, 40, 45] : [40, 30, 30],
};

export class Haptics {
  constructor() {
    this.enabled = (localStorage.getItem("hapticsEnabled") ?? "1") === "1";
  }
  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem("hapticsEnabled", on ? "1" : "0");
  }
  get supported() { return typeof navigator !== "undefined" && !!navigator.vibrate; }
  play(cue) {
    if (!this.enabled || !this.supported) return;
    const fn = P[cue.name];
    if (!fn) return;
    try { navigator.vibrate(fn(cue)); } catch {}
  }
}
