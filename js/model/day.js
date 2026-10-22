// GameModel の一部: 1日(30投)・時間帯・天気・デイリー
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  DAY, WEATHER, SECRET_COND, seedFromString, mulberry32, todayKey,
} from "../data.js";
import { LS, store } from "./store.js";

export const dayMethods = {

  // ---- 1日 ----
  loadDay() {
    const d = store.getJSON("day", null);
    if (!d || d.v !== 1) return this.freshDay("free");
    // 日付が変わったデイリーは続けない(シード・天気はその日のもの)
    if (d.mode === "daily" && d.date !== todayKey()) return this.freshDay("free");
    return d;
  },

  freshDay(mode) {
    const date = todayKey();
    // シード文字列は旧名のまま(変えるとデイリーの海が変わり、過去の結果と比べられなくなる)
    const seed = mode === "daily" ? seedFromString(`dopagaki-${date}`) : (Math.random() * 2 ** 32) >>> 0;
    const g = mulberry32(seed ^ 0x9e3779b9);
    const keys = Object.keys(WEATHER), total = keys.reduce((a, k) => a + WEATHER[k].weight, 0);
    const weather = DAY.slots.map(() => {
      let x = g() * total;
      for (const k of keys) { x -= WEATHER[k].weight; if (x < 0) return k; }
      return "clear";
    });
    return { v: 1, mode, date, seed, cast: 0, seq: 0, score: 0, weather,
             stats: { byR: [0, 0, 0, 0, 0, 0], miss: 0, best: null, newCount: 0, secrets: 0 } };
  },

  saveDay() { this.day.score = this.score; LS.setItem("day", JSON.stringify(this.day)); },

  slotFor(castNo) {
    const n = Math.max(1, Math.min(DAY.casts, castNo));
    return DAY.slots.findIndex((sl) => n <= sl.until);
  },
  get slot() { return DAY.slots[this.slotIdx]; },
  get weatherKey() { return this.day.weather[this.slotIdx] ?? "clear"; },

  setSlot(idx) {
    const changed = idx !== this.slotIdx;
    this.slotIdx = idx;
    this.fx.setWeather?.(this.weatherKey);
    return changed;
  },

  endDay() {
    this.phase = "dayEnd";
    this.prompt = "";
    this.autoCast = false;
    this.banner = null;
    this.oldManCue = null;
    const st = this.day.stats;
    const rank = DAY.ranks.find(([min]) => this.score >= min)[1];
    let dailyBest = null;
    if (this.day.mode === "daily") {
      const k = `dailyBest:${this.day.date}`;
      dailyBest = Math.max(store.getInt(k), this.score);
      store.set(k, dailyBest);
    }
    this.dayResult = { id: Math.random().toString(36).slice(2), mode: this.day.mode, date: this.day.date,
                       score: this.score, rank, stats: st, best: this.bestScore, dailyBest,
                       isBest: this.score > (this.day.prevBest ?? 0) };
    this.saveDay();
    this.snd.stopBGM();
    this.snd.play(rank === "S" || rank === "A" ? "fanfare_big" : "fanfare");
  },

  startNewDay(mode) {
    if (this.phase !== "dayEnd" && this.phase !== "idle") return;
    this.day = this.freshDay(mode);
    this.day.prevBest = this.bestScore;
    this.score = 0;
    this.combo = 0;
    this.dayResult = null;
    this.holds = [];
    this.fillHolds();
    this.setSlot(this.slotFor(1));
    this.saveDay();
    this.toIdle();
    const w = WEATHER[this.weatherKey];
    this.showBanner(mode === "daily" ? `デイリーチャレンジ ${this.day.date}` : "新しい1日",
                    `${this.slot.name} ${w.icon}${w.name}`, "info", 2.0);
  },

  secretConditionMet(name) {
    const c = SECRET_COND[name];
    if (!c) return true;
    if (c.slot && this.slot.key !== c.slot) return false;
    if (c.weather && this.weatherKey !== c.weather) return false;
    return true;
  },
};
