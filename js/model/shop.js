// GameModel の一部: 釣具屋(強化)と活き餌
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  UPGRADE_COSTS, BAIT, BAIT_SHOP,
} from "../data.js";
import { LS, store } from "./store.js";

export const shopMethods = {

  // ---- shop ----
  level(i) { return [this.rareLv, this.reelLv, this.rushLv][i]; },
  nextCost(i) { const lv = this.level(i); return lv < UPGRADE_COSTS.length ? UPGRADE_COSTS[lv] : null; },
  buyUpgrade(i) {
    const cost = this.nextCost(i);
    if (cost === null || this.medals < cost) return false;
    this.medals -= cost;
    store.set("medals", this.medals);
    const lv = this.level(i) + 1;
    if (i === 0) { this.rareLv = lv; store.set("up_rare", lv); }
    if (i === 1) { this.reelLv = lv; store.set("up_reel", lv); }
    if (i === 2) { this.rushLv = lv; store.set("up_rush", lv); }
    this.snd.play("coin");
    return true;
  },
  setMedals(v) { this.medals = v; store.set("medals", v); },

  // ---- 活き餌 ----
  setBait(b) {
    this.bait = b;
    if (b) LS.setItem("bait", JSON.stringify(b)); else LS.removeItem("bait");
  },
  buyBait(i) {
    const item = BAIT_SHOP[i];
    if (!item || this.medals < item.cost) return false;
    this.medals -= item.cost;
    store.set("medals", this.medals);
    this.setBait({ name: item.name, img: item.img, grade: item.grade });
    this.snd.play("coin");
    return true;
  },
  applyBait(r) {
    const b = this.activeBait;
    if (!b) return r;
    this.activeBait = null;
    return 1 - (1 - r) * (1 - BAIT[b.grade].power);
  },
};
