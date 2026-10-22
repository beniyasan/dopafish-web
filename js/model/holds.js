// GameModel の一部: 抽選: 保留(先読み)・天井「海の気配」・レア度の決定
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  Rarity, RushRules, HOLD_COLORS, HOLD_SIZE, HOLD_COLOR_TABLE, HOLD_CHANGE,
  OMEN, DAY, WEATHER, mulberry32,
} from "../data.js";
import { store } from "./store.js";

// 連続予告: 保留ができた時点の結果ごとの発生率(ハズレ・小物はガセ)
const RENZOKU_CHANCE = { miss: 0.025, [Rarity.n]: 0.025, [Rarity.r]: 0.03, [Rarity.sr]: 0.05, [Rarity.ssr]: 0.14, [Rarity.ur]: 0.4, [Rarity.lr]: 0.7 };

export const holdsMethods = {

  rollResult() {
    if (this.rig) {
      this.result = Object.prototype.hasOwnProperty.call(Rarity, this.rig) ? Rarity[this.rig] : null;
      return;
    }
    const h = this.currentHold ?? this.makeHold(this.day.seq);
    this.result = this.resolveHold(h, true);
  },

  // ---- 保留(先読み) ----
  // 保留は乱数だけを先に引いておき、レア度は投げる時点の状態(RUSH・竿・餌・時間帯)で決める
  holdRng(seq) {
    return this.day.mode === "daily"
      ? mulberry32((this.day.seed ^ Math.imul(seq + 1, 2654435761)) >>> 0)
      : Math.random;
  },

  makeHold(seq) {
    const g = this.holdRng(seq);
    // u: 魚種 / cm: 大きさ / sec, secPick: シークレット抽選 — デイリーでは全部シード由来
    const h = { seq, r: g(), rescue: g(), rescueR: g(), u: g(), c1: g(), c2: g(),
                cm: g(), sec: g(), secPick: g(), gold: g(), rz: g(), forced: false };
    this.colorHold(h);
    this.markRenzoku(h);
    return h;
  },

  // 表示色(color)と、保留変化で化ける先(target)を決める
  colorHold(h) {
    if (h.forced) { h.color = h.target = HOLD_COLORS.length - 1; return; }
    const res = this.resolveHold(h, false);
    const table = HOLD_COLOR_TABLE[res === null ? "miss" : res];
    const roll = (u) => {
      let x = u * table.reduce((a, b) => a + b, 0);
      for (let i = 0; i < table.length; i++) { x -= table[i]; if (x < 0) return i; }
      return table.length - 1;
    };
    h.color = roll(h.c1);
    h.target = Math.max(h.color, roll(h.c2));
    if (this.debugHold !== null) h.color = h.target = this.debugHold;
  },

  // この保留を当該とする連続予告を出すか(3投前から段階的に熱くなる)
  markRenzoku(h) {
    if (h.forced) { h.renzoku = true; return; }
    const res = this.resolveHold(h, false);
    h.renzoku = h.rz < RENZOKU_CHANCE[res === null ? "miss" : res];
  },

  fillHolds() {
    while (this.holds.length < HOLD_SIZE) {
      const last = this.holds.at(-1);
      this.holds.push(this.makeHold(last ? last.seq + 1 : this.day.seq));
    }
  },

  get timeBias() {
    const w = WEATHER[this.day.weather[this.slotIdx]] ?? WEATHER.clear;
    return 1 - (1 - DAY.slots[this.slotIdx].bias) * (1 - w.bias);
  },

  resolveHold(h, useBait) {
    let r = h.r;
    // RUSH中は竿・時間帯の補正なし(RUSH自体が高確率なので、重ねると上乗せが止まらなくなる)
    if (!this.rushActive) {
      r = RushRules.boost(r, this.rareLv);
      r = 1 - (1 - r) * (1 - this.timeBias);
    }
    if (useBait) r = this.applyBait(r);
    let res = this.rarityForRoll(r);
    const cap = RushRules.rarityCap(this.rareLv);
    if (res !== null && res > cap) res = cap;
    // リール救済は通常時のみ(RUSH中に効くと上乗せが止まらない)
    if (res === null && !this.rushActive && h.rescue < RushRules.reelRescueProbability(this.reelLv)) {
      const r2 = RushRules.reelBoost(this.missThreshold + h.rescueR * (1 - this.missThreshold), this.reelLv);
      res = Math.min(this.rarityForRoll(r2) ?? Rarity.n, cap);
    }
    // 天井: 大物(SSR以上・竿の上限まで)確定
    if (h.forced) res = Math.max(res ?? -1, Math.min(Rarity.ssr, cap));
    return res;
  },

  // 投げるときに先頭の保留を使う。残りは列が進むときに保留変化することがある
  consumeHold() {
    this.fillHolds();
    const h = this.holds.shift();
    if (h.color < h.target && Math.random() < HOLD_CHANGE.onCast) this.changeHold(h, true);
    for (const o of this.holds) {
      if (o.color < o.target && Math.random() < HOLD_CHANGE.onShift) this.changeHold(o, false);
    }
    this.day.seq = h.seq + 1;
    this.fillHolds();
    return h;
  },

  changeHold(h, onCast) {
    h.color = h.target;
    this.holdChange = { id: Math.random().toString(36).slice(2), seq: h.seq, onCast };
    this.snd.play("shine");
    this.haptics.play({ name: "bite" });
    const name = ["", "青", "緑", "赤", "金", "虹"][h.color];
    if (h.color >= 3) {
      // 赤以上への変化は画面ごと叩く(金以上は金色に光らせて強めに揺らす)
      this.doFlash(h.color >= 4 ? [255, 214, 10] : [255, 255, 255], 0.6, 0.15);
      this.fx.shake(h.color >= 4 ? 7 : 4);
    }
    if (h.color >= 3) this.showBanner(onCast ? `${name}保留に変化!!` : "保留変化!!", h.color >= 4 ? "激アツ!!" : "チャンス!", h.color >= 5 ? "rainbow" : h.color >= 4 ? "gold" : "hot", 1.4);
  },

  // 天井「海の気配」
  addOmen(v) {
    if (this.rushActive || v <= 0) return;
    this.omen = Math.min(OMEN.max, this.omen + v);
    if (this.omen >= OMEN.max) {
      // 満タン: 一番後ろの保留を大物確定(虹)にする
      this.fillHolds();
      const h = this.holds.at(-1);
      h.forced = true;
      this.colorHold(h);
      this.markRenzoku(h);
      this.omen = 0;
      this.holdChange = { id: Math.random().toString(36).slice(2), seq: h.seq, onCast: false };
      this.schedule(0.3, () => {
        this.snd.play("shine"); this.snd.play("perfect");
        this.doFlash([255, 255, 255], 0.9, 0.3);
        this.fx.shake(8);
        this.fx.starShower(30);
        this.showBanner("海の気配がMAX!!", "虹保留 = 大物確定", "rainbow", 2.0);
      });
    }
    store.set("omen", this.omen);
  },
  resetOmen() { this.omen = 0; store.set("omen", 0); },

  rarityForRoll(r) {
    if (this.rushActive) {
      // RUSHは「ハズレが少なく点数2倍」が主役。UR以上(=上乗せ)は1割に抑え、SR・SSRを厚くする
      const t = RushRules.rushTable;
      if (r < RushRules.missThreshold) return null;
      if (r < t.n) return Rarity.n;
      if (r < t.r) return Rarity.r;
      if (r < t.sr) return Rarity.sr;
      if (r < RushRules.extendThreshold) return Rarity.ssr;
      if (r < t.ur) return Rarity.ur;
      return Rarity.lr;
    }
    if (r < 0.42) return null;
    if (r < 0.62) return Rarity.n;
    if (r < 0.76) return Rarity.r;
    if (r < 0.87) return Rarity.sr;
    if (r < 0.95) return Rarity.ssr;
    if (r < 0.985) return Rarity.ur;
    return Rarity.lr;
  },

  get missThreshold() { return this.rushActive ? RushRules.missThreshold : 0.42; },
};
