// 保存(localStorage)と魚図鑑
import {
  fishPool, secretFishPool,
} from "../data.js";

export const LS = window.localStorage;
export const store = {
  getInt(k, d = 0) { const v = LS.getItem(k); return v === null ? d : (parseInt(v, 10) || 0); },
  set(k, v) { LS.setItem(k, String(v)); },
  getJSON(k, d) { try { const v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
};

// 魚図鑑 — name -> [count, maxCm, gold(0/1), crown(0/1)]
export const dex = {
  records: store.getJSON("fishDex", {}),
  // records: name -> [count, maxCm, gold(0/1), crown(0/1)]。返り値は初めての金色・王冠か
  log(name, cm, v = {}) {
    const e = this.records[name] || [0, 0, 0, 0];
    const newGold = !!v.gold && !e[2], newCrown = !!v.crown && !e[3];
    e[0] += 1; e[1] = Math.max(e[1], cm);
    if (v.gold) e[2] = 1;
    if (v.crown) e[3] = 1;
    this.records[name] = e;
    LS.setItem("fishDex", JSON.stringify(this.records));
    return { newGold, newCrown };
  },
  entry(name) {
    const e = this.records[name] || [0, 0, 0, 0];
    return { count: e[0], maxCm: e[1], gold: !!e[2], crown: !!e[3] };
  },
  get goldCount() { return fishPool.reduce((a, s) => a + s.filter(f => this.entry(f.name).gold).length, 0); },
  get crownCount() { return fishPool.reduce((a, s) => a + s.filter(f => this.entry(f.name).crown).length, 0); },
  // 通常種のみ(シークレットは totalSpecies に含まないので数えない)
  get caughtSpecies() { return fishPool.reduce((a, s) => a + s.filter(f => this.entry(f.name).count > 0).length, 0); },
  get totalSpecies() { return fishPool.reduce((a, s) => a + s.length, 0); },
  get caughtSecrets() { return secretFishPool.filter(f => this.entry(f.name).count > 0).length; },
  // シークレット以外を全種捕獲済み
  get isComplete() { return fishPool.every(s => s.every(f => this.entry(f.name).count > 0)); },
};
