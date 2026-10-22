// GameModel の一部: リーチ: 発展・合わせ(突っ込みのタイミング)
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  Rarity,
} from "../data.js";

const REACH_STAGE_SEC = 2.2;    // 発展前の各段階の長さ(秒)
const REACH_DEVELOP_DELAY = 1.3; // 発展バナーの後、最終段階の台本を始めるまでの間(秒)
// リーチ中の「合わせ」 — 突っ込み(battleLunge)の瞬間にタップ
// cue: 予告リングが縮み始めてから突っ込みまで / great・good: 突っ込み後の受付幅 / early: これより早いと「早い」
export const HOOK = { cue: 0.6, early: 0.08, great: 0.2, good: 0.4, goodGain: 0.6,
                      lv: [0.3, 0.7, 1.0], rankUpMinLunges: 4 };

export const reachMethods = {



  pickReach() {
    if (this.rig === "bluff") { this.reachKind = 2; return; }
    const r = Math.random();
    const res = this.result;
    if (res === null) this.reachKind = r < 0.70 ? 0 : (r < 0.92 ? 1 : 2);
    else if (res === Rarity.n) this.reachKind = r < 0.8 ? 0 : 1;
    else if (res === Rarity.r) this.reachKind = r < 0.5 ? 0 : (r < 0.9 ? 1 : 2);
    else if (res === Rarity.sr) this.reachKind = r < 0.55 ? 1 : (r < 0.95 ? 2 : 3);
    else if (res === Rarity.ssr) this.reachKind = r < 0.7 ? 2 : 3;
    else if (res === Rarity.ur) this.reachKind = 3;
    else this.reachKind = 4;
  },

  runReach() {
    this.phase = "reach";
    this.battleT = 0;
    this.spike = 0;
    const k = this.reachKind;
    this.hookGauge = 0;
    this.hookLunge = null;
    this.hookPop = null;
    this.hookPerfect = false;
    this.prompt = "突っ込む瞬間にタップで合わせろ!";
    this.promptHot = false;
    this.fx.setFightLook(true);

    // 発展: 最終段階より低い段階から始めて、途中で段階を上げていく(パチンコのリーチ発展)
    const path = this.reachPath(k);
    const pre = (path.length - 1) * REACH_STAGE_SEC;
    // 発展した場合は最終段階の台本が REACH_DEVELOP_DELAY 遅れて始まるので、その分も伸ばす
    const dur = pre + (path.length > 1 ? REACH_DEVELOP_DELAY : 0) + [2.4, 4.2, 6.2, 8.2, 9.6][k];
    const lunges = [1, 2, 4, 6, 7][k] + (path.length - 1);
    this.hookLunges = lunges;
    for (let i = 0; i < lunges; i++) {
      const t = 0.6 + (dur - 0.6) * i / lunges;
      this.schedule(Math.max(0, t - HOOK.cue), () => this.hookCue(t - Math.max(0, t - HOOK.cue)));
      this.schedule(t, () => this.battleLunge(k >= 2));
    }
    path.forEach((stage, i) => {
      const final = i === path.length - 1;
      if (i === 0) this.enterReachStage(stage, final, false);
      else this.schedule(i * REACH_STAGE_SEC, () => { if (this.phase === "reach") this.enterReachStage(stage, final, true); });
    });
    // 発展しそうでしない(ガセ発展)
    if (path.length === 1 && (k === 1 || k === 2) && Math.random() < 0.25) {
      this.schedule(1.3, () => { if (this.phase !== "reach") return; this.doFlash([255, 255, 255], 0.3, 0.12); this.snd.play("riser"); this.showBanner("発展…!?", "", "hot", 0.9); });
      this.schedule(2.3, () => { if (this.phase === "reach") this.showBanner("…しなかった", "", "miss", 1.0); });
    }
    this.schedule(dur, () => this.endReach());
  },

  // 最終段階 k に至る発展ルート
  reachPath(k) {
    if (this.nushiPending || this.secretPending || k <= 1) return [k];
    const r = Math.random();
    if (k === 2) return r < 0.55 ? [1, 2] : [2];
    if (k === 3) return r < 0.4 ? [1, 2, 3] : r < 0.75 ? [2, 3] : [3];
    return r < 0.25 ? [1, 2, 4] : r < 0.5 ? [2, 3, 4] : r < 0.75 ? [3, 4] : [4];
  },

  // 段階ごとの見た目と台本。final=最終段階(従来の台本を流す) / developed=途中から発展した
  enterReachStage(k, final, developed) {
    this.fx.shadowSize([0.3, 0.45, 0.7, 0.9, 1.1][k]);
    this.fx.setOrbit([1.8, 2.5, 4.2, 4.0, 5.2][k], [42, 55, 70, 80, 90][k], true);
    this.fx.setAura(k);
    this.fx.setSpeedLines(k >= 2 ? k : 0);
    if (developed) {
      const [title, style] = k >= 4 ? ["虹色…発展!!!!", "rainbow"] : k === 3 ? ["ゴールデン発展!!!", "gold"] : ["SUPERリーチ発展!!", "hot"];
      this.doFlash(k >= 4 ? [168, 85, 247] : k === 3 ? [255, 214, 10] : [255, 255, 255], 0.6, 0.25);
      this.snd.play("cutin"); this.snd.play("impact");
      this.fx.shake(6);
      this.haptics.play({ name: "cutIn", premium: k >= 3 });
      this.showBanner(title, "", style, 1.2);
    }
    if (k === 2) this.enterSuperLook();
    else if (k === 3) this.enterPremiumLook(false);
    else if (k === 4) this.enterPremiumLook(true);
    if (!final) {
      // 発展前の段階: 短い台本だけ
      const lines = ["", "引いてる…!", "大物の影だ!!", "折れそうだ…!!"];
      this.schedule(developed ? REACH_DEVELOP_DELAY : 0.1, () => { if (this.phase === "reach") this.showBanner(lines[k], "", k >= 2 ? "hot" : "info", 1.0); });
      return;
    }
    const d0 = developed ? REACH_DEVELOP_DELAY : 0; // 発展バナーの後に台本を始める
    const at = (t, f) => this.schedule(d0 + t, () => { if (this.phase === "reach") f(); });
    if (k === 0) {
      at(0, () => this.showBanner("食いついた!", "", "info", 1.2));
    } else if (k === 1) {
      at(0, () => this.showBanner("引いてる…!", "", "info", 1.4));
      at(1.6, () => this.showBanner("粘ってるぞ…", "", "info", 1.2));
    } else if (k === 2) {
      at(0.1, () => this.showBanner("大物の影だ!!", "スーパーバトルリーチ", "hot", 1.8));
      for (let i = 0; i < 7; i++) at(0.5 + i * 0.7, () => { this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 2 }); });
      at(3.4, () => this.showBanner("まだ逃げてない…!!", "", "hot", 1.4));
      at(4.6, () => this.showBanner("手前まで来た!!", "", "hot", 1.2));
    } else if (k === 3) {
      at(0.1, () => this.showBanner("ゴールデンバトル!!", "確変大物の激闘…!", "gold", 2.2));
      for (let i = 0; i < 8; i++) at(0.5 + i * 0.65, () => { this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 3 }); });
      at(3.0, () => this.showBanner("折れそうだ…!!", "", "gold", 1.4));
      for (let i = 0; i < 3; i++) {
        at(5.0 + i * 0.7, () => {
          this.prompt = `${3 - i}`; this.promptHot = true;
          this.snd.play("count"); this.haptics.play({ name: "countdown", step: i }); this.fx.shake(6);
        });
      }
      at(7.1, () => { this.prompt = "GO!!"; this.snd.play("countgo"); });
    } else {
      if (this.secretPending) {
        at(0.1, () => this.showBanner("!?!?!?", "見たことのない影が…", "rainbow", 1.8));
        at(2.0, () => this.showBanner("幻の魚の気配!!!", "図鑑に載っていない何かがいる", "rainbow", 2.4));
      } else if (this.nushiPending) {
        const d = this.nushiDef, hp = Math.round(this.nushiState.hp * 100);
        at(0.1, () => this.showBanner("ヌシ出現!!!", d.name, "rainbow", 1.8));
        at(2.0, () => this.showBanner(hp < 100 ? "またアイツだ!!" : "まともに釣れる相手じゃない…", `残り体力 ${hp}%`, "rainbow", 2.4));
      } else {
        at(0.1, () => this.showBanner("!?!?", "この引きは…何だ!?", "rainbow", 1.8));
        at(2.0, () => this.showBanner("虹色バトル!!!", "伝説確定!?", "rainbow", 2.4));
      }
      for (let i = 0; i < 8; i++) {
        at(0.6 + i * 0.75, () => { this.fx.sparkleBurst([255, 255, 255]); this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 4 }); });
      }
      at(6.0, () => this.showBanner("伝説が暴れてる!!!", "", "rainbow", 1.6));
      for (let i = 0; i < 3; i++) {
        at(6.6 + i * 0.7, () => {
          this.prompt = `${3 - i}`; this.promptHot = true;
          this.snd.play("count"); this.haptics.play({ name: "countdown", step: i }); this.fx.shake(7);
        });
      }
      at(8.7, () => { this.prompt = "GO!!"; this.snd.play("countgo"); });
    }
  },

  // ---- 合わせ ----
  hookCue(lead) {
    if (this.phase !== "reach") return;
    this.hookLunge = { id: Math.random().toString(36).slice(2), cueAt: this.now, at: this.now + lead, judged: false };
  },

  hookTap() {
    const l = this.hookLunge;
    if (!l || l.judged || this.now > l.at + HOOK.good) {
      this.snd.play("tick");
      this.fx.splashFX(false);
      return;
    }
    l.judged = true;
    const d = this.now - l.at;
    if (d < -HOOK.early) { this.hookResult("早い…", "early", 0); return; }
    if (d <= HOOK.great) this.hookResult("GREAT!!", "great", 1);
    else this.hookResult("GOOD!", "good", HOOK.goodGain);
  },

  hookResult(text, kind, gain) {
    this.hookPop = { id: Math.random().toString(36).slice(2), text, kind };
    if (gain <= 0) { this.snd.play("deny"); return; }
    const before = this.hookLevel;
    this.hookGauge = Math.min(1, this.hookGauge + gain / Math.max(1, this.hookLunges));
    // 端数で取りこぼさないよう全GREATなら満タン扱い
    if (this.hookGauge > 0.999) this.hookGauge = 1;
    this.snd.play(kind === "great" ? "hook" : "coin");
    this.haptics.play({ name: "hook" });
    this.fx.shockwave(kind === "great");
    this.fx.splashFX(true);
    if (kind === "great") this.doFlash([255, 255, 255], 0.25, 0.08);
    if (this.hookLevel > before) this.snd.play("shine");
  },

  // 合わせのレア度UPはSSRまで(UR/LRへの昇格はRUSH突入・上乗せに直結してしまう)
  hookCanRankUp(r) { return r !== null && r < Rarity.ssr; },

  // 0..3 — Lv3(レア度UP)は突っ込みの多い長いリーチだけ
  get hookLevel() {
    const lv = HOOK.lv.filter(v => this.hookGauge >= v - 1e-9).length;
    return this.hookLunges >= HOOK.rankUpMinLunges ? lv : Math.min(2, lv);
  },

  battleLunge(strong) {
    this.spike = Math.min(0.45, this.spike + (strong ? 0.34 : 0.22));
    this.fx.bobberDip(strong ? 1.4 : 0.9);
    this.fx.splashFX(strong);
    this.fx.shake(strong ? 7 : 3);
    if (strong) this.fx.shockwave(false);
    this.snd.play(strong ? "surge" : "bite");
    this.haptics.play({ name: "surge", strong });
  },

  endReach() {
    if (this.phase !== "reach") return;
    if (this.result === null && this.reachKind <= 1) {
      this.escape("逃げられた…");
    } else {
      this.beginMash();
    }
  },
};
