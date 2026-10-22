// GameModel の一部: 釣果と結果カード・逃げられたとき・RUSH・通常ED
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  Rarity, fishPool, RushRules, ESCAPE, cardFXSpec, OMEN,
  VARIANT, randInt,
} from "../data.js";
import { store, dex } from "./store.js";

// 図鑑初登録の演出タイミング(秒) — ui/css と揃える
const REVEAL_NEW_STAMP_AT = 0.9;
const REVEAL_NEW_LOCK = 1.8;
const REVEAL_CHOICE_LOCK = 0.5; // 換金/餌の選択 — 連打の残りで誤選択しないように
// 通常ED タイムライン(秒) — ui/css と揃える
export const ENDING = { skipLock: 2.0, teaserAt: 13.5, closeLock: 1.5 };

export const catchMethods = {

  // ---- resolve ----
  caught(perfect, small) {
    this.oldManCue = null;
    const nushi = this.nushiFight ? this.nushiDef : null;
    this.nushiFight = false;
    const r = nushi ? Rarity.lr : (this.result ?? Rarity.n);
    let chosen = nushi ?? this.pickSpecies(fishPool[r], this.currentHold?.u);
    let isSecret = false;
    const hr = this.currentHold;
    // シークレットは投げた時点で決まっている(land)
    if (!nushi && this.secretFight) { chosen = this.secretFish; isSecret = true; }
    this.secretFight = false;
    const cm = hr ? chosen.cm[0] + Math.floor(hr.cm * (chosen.cm[1] - chosen.cm[0] + 1)) : randInt(chosen.cm[0], chosen.cm[1]);
    const isNew = dex.entry(chosen.name).count === 0;
    // 個体差: 金色個体(まれ)・サイズ王冠(種のサイズ幅の上位5%)
    const gold = !nushi && (this.forceGold || (hr?.gold ?? Math.random()) < VARIANT.gold);
    const crown = !nushi && cm >= chosen.cm[0] + (1 - VARIANT.crownTop) * (chosen.cm[1] - chosen.cm[0]);
    const { newGold, newCrown } = dex.log(chosen.name, cm, { gold, crown });
    if (nushi) { this.nushiState = { idx: this.nushiState.idx + 1, hp: 1 }; this.saveNushi(); }
    let sc = chosen.score;
    if (gold) sc *= VARIANT.goldScore;
    if (perfect) sc = Math.floor(sc * 1.5);
    if (this.rushActive) sc *= 2;
    sc = Math.floor(sc * (1 + Math.min(0.5, this.combo * 0.08)));
    const isRecord = cm > this.bestCm;
    if (isRecord) { this.bestCm = cm; store.set("bestCm", cm); }
    const medal = Math.max(1, Math.floor(sc / 12));
    // N・R は「換金」か「餌にする」かを結果カードで選ぶ。換金するまで点数・メダルは入らない
    const baitable = !isSecret && !gold && r <= Rarity.r;
    if (!baitable) this.addScore(sc, medal);
    this.combo += 1;
    // 天井: 小物は気配が溜まり、自力の大物で戻る
    if (r <= Rarity.r) this.addOmen(OMEN[r]);
    else if (!this.rushActive && !this.currentHold?.forced) this.resetOmen();
    // 1日の釣果
    const st = this.day.stats;
    if (isSecret) st.secrets += 1; else st.byR[r] += 1;
    if (isNew) st.newCount += 1;
    const rank = isSecret ? 6 : r;
    if (!st.best || rank > st.best.rank || (rank === st.best.rank && cm > st.best.cm)) {
      st.best = { name: chosen.name, img: chosen.img, cm, rank };
    }
    this.saveDay();

    const rushGain = RushRules.gain(r, this.rushActive, this.rushLv);

    this.reveal = { name: chosen.name, img: chosen.img, rarity: r, cm, score: sc, medals: medal,
                    perfect, isRecord, rushGain, isSmall: small, isSecret, isNew, baitable,
                    rushMissed: !this.rushActive && r === Rarity.ur && rushGain === 0,
                    gold, crown, newGold, newCrown, nushi: !!nushi };
    this.phase = "reveal";
    // 図鑑初登録: lock taps so leftover mash taps can't skip the reveal
    const entryDelay = cardFXSpec(this.reveal).entryDelay;
    this.revealLockUntil = isNew ? this.now + entryDelay + REVEAL_NEW_LOCK
                         : baitable ? this.now + REVEAL_CHOICE_LOCK : 0;
    if (isNew) {
      this.schedule(entryDelay + REVEAL_NEW_STAMP_AT, () => {
        if (this.reveal?.name !== chosen.name) return;
        this.snd.play("impact");
        this.snd.play("shine");
        this.haptics.play({ name: "bite" });
      });
    }
    this.prompt = "";
    this.fx.setFightLook(false);
    this.fx.setOrbit(0, 0, false);
    this.fx.zoomTo(1);
    this.fx.setSpeedLines(0);
    this.fx.setAura(0);

    this.haptics.play({ name: "catchResult", rarity: r });
    if (r >= Rarity.ur) {
      this.doFlash([255, 214, 10], 0.7, 0.3);
      this.snd.play("fanfare_big");
      this.snd.play("thunder");
      this.snd.play("shine");
      this.showBanner(r === Rarity.lr ? "超弩級当たり!!!!" : "大当たり!!!", `+${sc}pt`, r === Rarity.lr ? "rainbow" : "gold", 2.4);
      this.fx.coinRain(Math.min(60, medal));
      this.fx.lightPillar(r === Rarity.lr ? [255, 128, 230] : [255, 230, 77]);
      this.fx.lightningFX();
      this.fx.confettiRain(48);
      this.fx.starShower(40);
    } else if (r >= Rarity.sr) {
      this.doFlash([255, 255, 255], 0.5, 0.2);
      this.snd.play("fanfare");
      this.snd.play("shine");
      this.showBanner("当たり!", `+${sc}pt`, "hot", 1.8);
      this.fx.coinRain(Math.min(30, medal));
      this.fx.lightPillar([153, 230, 255]);
      this.fx.starShower(18);
    } else {
      this.snd.play("deny");
      this.snd.play("coin");
      this.showBanner("…小物だった", baitable ? "換金か、餌にして大物を狙うか" : `+${sc}pt`, "miss", 1.6);
      this.fx.coinRain(Math.min(12, medal));
    }
    this.schedule(0.5, () => this.fx.splashFX(true));
  },

  // 同じレア度の中では未登録の魚を3倍出やすくする(図鑑埋めの後押し)
  pickSpecies(pool, u = Math.random()) {
    const w = pool.map((f) => (dex.entry(f.name).count > 0 ? 1 : 3));
    let x = u * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x < 0) return pool[i]; }
    return pool[pool.length - 1];
  },

  addScore(sc, medal) {
    this.score += sc;
    if (this.score > this.bestScore) { this.bestScore = this.score; store.set("bestDay", this.score); }
    this.medals += medal;
    store.set("medals", this.medals);
    this.saveDay();
  },

  // choice: "cash"(換金・既定) | "bait"(餌にする) — N・R のみ意味を持つ
  dismissReveal(choice = "cash") {
    if (this.phase !== "reveal" || !this.reveal) return;
    if (this.now < this.revealLockUntil) return;
    const rv = this.reveal;
    const rushGain = rv.rushGain;
    this.reveal = null;
    if (rv.baitable) {
      if (choice === "bait") {
        this.setBait({ name: `${rv.name}の活き餌`, img: rv.img, grade: rv.rarity });
        this.snd.play("splash");
        this.showBanner("活き餌ゲット!", this.rushActive ? "RUSH後の1投で使う" : "次の1投で大物を狙え", "info", 1.4);
      } else {
        this.addScore(rv.score, rv.medals);
        this.snd.play("coin");
      }
    }
    // 最後の1種を釣ったらRUSHより先にEDを流す
    if (dex.isComplete && !this.endingSeen) {
      this.pendingRushGain = rushGain;
      this.startEnding(false);
      return;
    }
    this.applyRushGain(rushGain);
  },

  applyRushGain(rushGain) {
    if (rushGain > 0) {
      const wasActive = this.rushActive;
      if (!wasActive) {
        this.rushCasts = 0;
        this.rushStartScore = this.score;
      }
      this.rushActive = true;
      this.rushLeft += rushGain;
      this.fx.setRushLook(true);
      this.snd.bgm("rush");
      this.snd.play("rush_in");
      this.haptics.play({ name: "rushIn", continued: wasActive });
      this.snd.play("shine");
      this.fx.lightPillar([255, 217, 77]);
      this.fx.starShower(24);
      this.fx.setSpeedLines(3);
      this.schedule(1.9, () => this.fx.setSpeedLines(0));
      this.showBanner(wasActive ? "RUSH継続!!" : "RUSH突入!!!", `高確率 ${this.rushLeft}回転`, "rush", 2.2);
      this.schedule(2.2, () => this.toIdle());
    } else {
      this.toIdle();
    }
  },

  // ---- 通常ED ----
  startEnding(replay) {
    this.phase = "ending";
    this.prompt = "";
    this.promptHot = false;
    this.banner = null;
    this.oldManCue = null;
    this.ending = { id: Math.random().toString(36).slice(2), start: this.now,
                    teaserAt: this.now + ENDING.teaserAt, replay, teaserPlayed: false };
    this.snd.stopBGM();
    this.snd.play("fanfare_big");
    this.snd.play("shine");
    const id = this.ending.id;
    this.schedule(2.5, () => { if (this.ending?.id === id) this.snd.bgm("idle"); });
  },

  // 図鑑の「ED再生」ボタン
  replayEnding() {
    if (this.phase !== "idle" || !dex.isComplete) return;
    this.startEnding(true);
  },

  dismissEnding() {
    const e = this.ending;
    if (this.phase !== "ending" || !e) return;
    if (this.now - e.start < ENDING.skipLock) return;
    if (this.now < e.teaserAt) {
      // スタッフロールを飛ばして黒塗りへ
      this.ending = { ...e, teaserAt: this.now, skipped: true };
      return;
    }
    if (this.now - e.teaserAt < ENDING.closeLock) return;
    this.ending = null;
    if (!this.endingSeen) { this.endingSeen = true; store.set("endingSeen", 1); }
    const gain = this.pendingRushGain;
    this.pendingRushGain = 0;
    this.applyRushGain(gain);
    if (this.rushActive && gain === 0) this.snd.bgm("rush"); // RUSH中のED再生から戻る
  },

  escape(reason = "", report = null) {
    this.oldManCue = null;
    this.phase = "escaping";
    this.addOmen(report && report.kind.type === "lineBreak" ? OMEN.escape : OMEN.miss);
    this.day.stats.miss += 1;
    this.saveDay();
    this.prompt = "";
    this.mashTapsLeft = null;
    this.tension = 0;
    this.combo = 0;
    this.snd.play("escape");
    this.snd.play("break");
    this.haptics.play(report === null ? { name: "shortMiss" } : { name: "lineSnap", nearMiss: report.isNearMiss });
    this.fx.setFightLook(false);
    this.fx.setOrbit(0, 0, false);
    this.fx.zoomTo(1);
    this.fx.setSpeedLines(0);
    this.fx.setAura(0);
    this.fx.lineSnap();
    this.doFlash([0, 0, 0], 0.35, 0.3);
    if (!report) {
      this.showBanner(reason, "", "miss", 1.2);
      this.schedule(1.3, () => this.toIdle());
      return;
    }
    this.banner = null;
    this.escapeReport = report;
    this.escapeShownAt = this.now;
    if (report.isNearMiss || report.isBigFish) {
      this.fx.shake(report.isNearMiss ? 6 : 4);
    }
    this.schedule(ESCAPE.displayDuration, () => {
      if (this.escapeReport?.id === report.id) this.dismissEscape(true);
    });
  },

  dismissEscape(force = false) {
    if (this.phase !== "escaping" || !this.escapeReport) return;
    if (!force && this.now - this.escapeShownAt < ESCAPE.skipLockDuration) return;
    this.escapeReport = null;
    this.toIdle();
  },

  endRush() {
    this.phase = "rushEnding";
    this.rushActive = false;
    this.rushLeft = 0;
    const summary = { id: Math.random().toString(36).slice(2), casts: this.rushCasts, score: this.score - this.rushStartScore };
    this.rushSummary = summary;
    this.prompt = "";
    this.promptHot = false;
    this.banner = null;
    this.oldManCue = null;
    this.landed = false;
    this.fx.resetScene();
    this.fx.setRushLook(false);
    this.fx.zoomTo(1);
    this.snd.stopBGM();
    this.snd.play("rush_out");
    this.schedule(RushRules.endingDuration, () => {
      if (this.rushSummary?.id === summary.id) this.dismissRushSummary();
    });
  },

  dismissRushSummary() {
    if (this.phase !== "rushEnding") return;
    this.rushSummary = null;
    this.toIdle();
  },
};
