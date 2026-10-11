// GameModel — faithful JS port of GameModel.swift
import { Rarity, RARITY_LABEL, RARITY_COLOR, fishPool, secretFishPool, OLD_MAN, OLDMAN_HEAT,
         UPGRADES, UPGRADE_COSTS, RushRules, rushStatus, ESCAPE, makeEscapeReport,
         cardFXSpec, MASH_NEED, BAIT, BAIT_SHOP, rand, randInt, pick } from "./data.js";

const LS = window.localStorage;
const store = {
  getInt(k, d = 0) { const v = LS.getItem(k); return v === null ? d : (parseInt(v, 10) || 0); },
  set(k, v) { LS.setItem(k, String(v)); },
  getJSON(k, d) { try { const v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
};

// 魚図鑑 persistence — name -> [count, maxCm]
// 図鑑初登録の演出タイミング(秒) — ui/css と揃える
const REVEAL_NEW_STAMP_AT = 0.9;
const REVEAL_NEW_LOCK = 1.8;
const REVEAL_CHOICE_LOCK = 0.5; // 換金/餌の選択 — 連打の残りで誤選択しないように

export const dex = {
  records: store.getJSON("fishDex", {}),
  log(name, cm) {
    const e = this.records[name] || [0, 0];
    e[0] += 1; e[1] = Math.max(e[1], cm);
    this.records[name] = e;
    LS.setItem("fishDex", JSON.stringify(this.records));
  },
  entry(name) { const e = this.records[name] || [0, 0]; return { count: e[0], maxCm: e[1] }; },
  // 通常種のみ(シークレットは totalSpecies に含まないので数えない)
  get caughtSpecies() { return fishPool.reduce((a, s) => a + s.filter(f => this.entry(f.name).count > 0).length, 0); },
  get totalSpecies() { return fishPool.reduce((a, s) => a + s.length, 0); },
  get caughtSecrets() { return secretFishPool.filter(f => this.entry(f.name).count > 0).length; },
  // シークレット以外を全種捕獲済み
  get isComplete() { return fishPool.every(s => s.every(f => this.entry(f.name).count > 0)); },
};

// リーチ中の「合わせ」 — 突っ込み(battleLunge)の瞬間にタップ
// cue: 予告リングが縮み始めてから突っ込みまで / great・good: 突っ込み後の受付幅 / early: これより早いと「早い」
export const HOOK = { cue: 0.6, early: 0.08, great: 0.2, good: 0.4, goodGain: 0.6,
                      lv: [0.3, 0.7, 1.0], rankUpMinLunges: 4 };

// 通常ED タイムライン(秒) — ui/css と揃える
export const ENDING = { skipLock: 2.0, teaserAt: 13.5, closeLock: 1.5 };

export class GameModel {
  constructor(fx, snd, haptics) {
    this.fx = fx; this.snd = snd; this.haptics = haptics;

    this.phase = "title";           // title idle charging flying waiting reach mash reveal escaping rushEnding
    this.score = 0;
    this.medals = store.getInt("medals");
    this.combo = 0;
    this.rushLeft = 0;
    this.rushActive = false;
    this.rushSummary = null;
    this.banner = null;             // {id,text,sub,style,ttl}
    this.prompt = "";
    this.promptHot = false;
    this.flash = null;              // {color:[r,g,b], opacity}
    this.reveal = null;             // Caught
    this.ending = null;             // {id, start, teaserAt, replay}
    this.endingSeen = store.getInt("endingSeen") > 0;
    this.pendingRushGain = 0;
    this.bait = store.getJSON("bait", null); // {name, img, grade} 次の1投で使う活き餌
    this.activeBait = null;                   // この投げで泳がせている餌
    this.revealLockUntil = 0;
    this.chargePower = 0;
    this.tension = 0;
    this.mashCount = 0;
    this.mashFill = 0;
    this.mashRemain = 0;
    this.mashTapsLeft = null;
    this.escapeReport = null;
    this.autoCast = false;
    this.autoPower = 0.65;
    this.oldManCue = null;          // {id,line,heat}
    this.bestScore = store.getInt("bestScore");
    this.bestCm = store.getInt("bestCm");

    // upgrades
    this.rareLv = store.getInt("up_rare");
    this.reelLv = store.getInt("up_reel");
    this.rushLv = store.getInt("up_rush");

    // internals
    this.now = 0;
    this.pending = [];
    this.result = null;             // Rarity | null (null = miss)
    this.reachKind = 0;             // 0 normal 1 long 2 super 3 premium 4 rainbow
    this.biteTimer = 0;
    this.landed = false;
    this.battleT = 0;
    this.spike = 0;
    this.mashT = 0;
    this.mashDur = 3;
    this.mashNeed = 12;
    this.hookGauge = 0;             // 0..1 合わせゲージ
    this.hookLunges = 0;            // このリーチの突っ込み回数
    this.hookLunge = null;          // {id, cueAt, at, judged}
    this.hookPop = null;            // {id, text, kind}
    this.hookPerfect = false;       // 合わせLv2以上でPERFECT確定
    this.mashDone = false;
    this.rushCasts = 0;
    this.rushStartScore = 0;
    this.escapeShownAt = 0;
    this.ambientArmed = false;

    // debug: URL params ?rig=ur ?fast ?go ?win ?secret ?mashneed=0.2 ?rush=10 ?ending
    const q = new URLSearchParams(location.search);
    this.rig = q.get("rig");
    this.fast = q.has("fast");
    this.autoStart = q.has("go");
    this.autoWin = q.has("win");
    this.forceSecret = q.has("secret");
    this.forceEnding = q.has("ending");
    this.mashMult = parseFloat(q.get("mashneed") || "1") || 1;
    this.debugRush = parseInt(q.get("rush") || "", 10) || null;
  }

  get rushStatus() { return rushStatus(this.rushLeft); }
  get rushBonusProbability() { return RushRules.bonusProbability(this.rareLv); }

  // ---- shop ----
  level(i) { return [this.rareLv, this.reelLv, this.rushLv][i]; }
  nextCost(i) { const lv = this.level(i); return lv < UPGRADE_COSTS.length ? UPGRADE_COSTS[lv] : null; }
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
  }
  setMedals(v) { this.medals = v; store.set("medals", v); }

  // ---- 活き餌 ----
  setBait(b) {
    this.bait = b;
    if (b) LS.setItem("bait", JSON.stringify(b)); else LS.removeItem("bait");
  }
  buyBait(i) {
    const item = BAIT_SHOP[i];
    if (!item || this.medals < item.cost) return false;
    this.medals -= item.cost;
    store.set("medals", this.medals);
    this.setBait({ name: item.name, img: item.img, grade: item.grade });
    this.snd.play("coin");
    return true;
  }
  applyBait(r) {
    const b = this.activeBait;
    if (!b) return r;
    this.activeBait = null;
    return 1 - (1 - r) * (1 - BAIT[b.grade].power);
  }

  // ---- clock / scheduler ----
  tick(dt) {
    if (this.autoStart && this.phase === "title") this.startGame();
    this.now += dt;
    while (this.pending.length && this.pending[0].t <= this.now) {
      const p = this.pending.shift();
      p.act();
    }
    switch (this.phase) {
      case "charging":
        this.chargePower = Math.min(1, this.chargePower + dt / 0.9);
        break;
      case "reach":
        this.battleT += dt;
        this.spike = Math.max(0, this.spike - dt * 0.5);
        this.tension = Math.min(1.1, 0.32 + 0.28 * Math.sin(this.battleT * 3.2) + this.reachKind * 0.07 + this.spike);
        break;
      case "mash":
        this.mashT += dt;
        this.mashRemain = Math.max(0, this.mashDur - this.mashT);
        if (this.autoWin) this.onMashTap();
        if (this.mashRemain <= 0) this.resolveMash();
        break;
      case "ending":
        if (this.ending && !this.ending.teaserPlayed && this.now >= this.ending.teaserAt) {
          this.ending.teaserPlayed = true;
          this.snd.play("impact");
          this.snd.play("shine");
          this.haptics.play({ name: "bite" });
        }
        break;
    }
  }

  schedule(after, act) {
    this.pending.push({ t: this.now + after, act });
    this.pending.sort((a, b) => a.t - b.t);
  }

  showBanner(text, sub = "", style = "info", ttl = 1.6) {
    const b = { id: Math.random().toString(36).slice(2), text, sub, style, ttl };
    this.banner = b;
    this.schedule(ttl, () => { if (this.banner?.id === b.id) this.banner = null; });
  }

  doFlash(rgb, opacity = 0.55, ttl = 0.18) {
    this.flash = { color: rgb, opacity };
    this.schedule(ttl, () => { this.flash = null; });
  }

  // ---- game flow ----
  startGame() {
    this.snd.prepare();
    if (this.debugRush !== null && this.debugRush >= 1 && this.debugRush <= 99) {
      this.rushActive = true;
      this.rushLeft = this.debugRush;
      this.rushCasts = 0;
      this.rushStartScore = this.score;
    }
    this.snd.bgm(this.rushActive ? "rush" : "idle");
    this.phase = "idle";
    this.prompt = "CASTボタン長押しでキャスト";
    this.fx.resetScene();
    this.fx.setRushLook(this.rushActive);
    this.scheduleAmbient();
    // コンプ済みでED未視聴(既存セーブ含む)なら起動時に一度だけ流す
    if (this.forceEnding || (dex.isComplete && !this.endingSeen)) {
      this.startEnding(this.endingSeen);
      return;
    }
    if (this.autoStart) this.schedule(0.3, () => this.performCast(0.8));
  }

  pressCast() {
    if (this.phase !== "idle") return;
    this.autoCast = false;
    this.phase = "charging";
    this.chargePower = 0;
    this.snd.play("charge");
  }

  releaseCast() {
    if (this.phase !== "charging") return;
    const power = 0.35 + 0.65 * this.chargePower;
    this.autoPower = power;
    this.performCast(power);
  }

  performCast(power) {
    this.phase = "flying";
    this.prompt = "";
    this.chargePower = 0;
    // 活き餌は通常時のみ使う(RUSH中は温存)
    if (this.bait && !this.rushActive) {
      this.activeBait = this.bait;
      this.setBait(null);
      this.showBanner(`${this.activeBait.name}を泳がせた!`, BAIT[this.activeBait.grade].effect, "hot", 1.4);
    }
    this.snd.play("cast");
    this.fx.castLure(power);
    let isLastCast = false;
    if (this.rushActive && this.rushLeft > 0) {
      this.rushLeft -= 1;
      this.rushCasts += 1;
      isLastCast = this.rushLeft === 0;
      if (this.rushLeft <= RushRules.warningSpins) {
        this.snd.play(this.rushLeft === 0 ? "countgo" : "count");
      }
    }
    this.haptics.play({ name: isLastCast ? "lastCast" : "castRelease", power });
    this.schedule(0.45, () => this.land(power));
  }

  toggleAuto() {
    this.autoCast = !this.autoCast;
    if (this.autoCast && this.phase === "idle") {
      this.prompt = `AUTO: 強さ${Math.round(this.autoPower * 100)}%で連投中`;
      this.schedule(0.5, () => this.autoFire());
    }
    if (!this.autoCast && this.phase === "idle") {
      this.prompt = "CASTボタン長押しでキャスト";
    }
  }

  autoFire() {
    if (!this.autoCast || this.phase !== "idle") return;
    this.performCast(this.autoPower);
  }

  land(power) {
    this.landed = true;
    this.snd.play("splash");
    this.fx.lureLanded();
    this.fx.splashFX(power > 0.85);
    this.haptics.play({ name: "lureLanded", big: power > 0.85 });
    this.phase = "waiting";
    this.biteTimer = this.fast ? 0.3 : rand(1.0, 3.0) - power * 0.4;
    this.rollResult();
    this.scheduleTeasers(this.biteTimer);
    this.schedule(this.biteTimer, () => this.bite());
    if (Math.random() < 0.35 && this.biteTimer > 1.2) {
      this.schedule(this.biteTimer * 0.55, () => {
        if (this.phase !== "waiting") return;
        this.fx.bobberDip(0.4);
        this.snd.play("tick");
        this.haptics.play({ name: "nibble" });
      });
    }
  }

  // ---- bite & reach ----
  bite() {
    this.pickReach();
    this.fx.bobberDip(1);
    this.snd.play("bite");
    this.haptics.play({ name: "bite" });
    this.runReach();
  }

  rollResult() {
    if (this.rig) {
      this.result = Object.prototype.hasOwnProperty.call(Rarity, this.rig) ? Rarity[this.rig] : null;
      return;
    }
    let r = Math.random();
    // RUSH中は竿補正なし(RUSH自体が高確率なので、重ねると上乗せが止まらなくなる)
    if (!this.rushActive) r = RushRules.boost(r, this.rareLv);
    r = this.applyBait(r);
    this.result = this.rarityForRoll(r);
    this.applyGearLimits();
  }

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
  }

  get missThreshold() { return this.rushActive ? RushRules.missThreshold : 0.42; }

  applyGearLimits() {
    const cap = RushRules.rarityCap(this.rareLv);
    if (this.result !== null && this.result > cap) this.result = cap;
    // リール救済は通常時のみ(RUSH中に効くと上乗せが止まらない)
    if (this.result === null && !this.rushActive && Math.random() < RushRules.reelRescueProbability(this.reelLv)) {
      let r2 = rand(this.missThreshold, 1.0);
      r2 = RushRules.reelBoost(r2, this.reelLv);
      const res = this.rarityForRoll(r2) ?? Rarity.n;
      this.result = Math.min(res, cap);
    }
  }

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
  }

  // ---- teasers ----
  scheduleTeasers(delay) {
    if (delay <= 0.6) return;
    const roll = Math.random();
    let hot = false, mild = false;
    const res = this.result;
    if (res === null) { hot = roll < 0.05; mild = roll < 0.25; }
    else if (res <= Rarity.r) { hot = roll < 0.10; mild = roll < 0.35; }
    else if (res === Rarity.sr) { hot = roll < 0.20; mild = roll < 0.60; }
    else if (res === Rarity.ssr) { hot = roll < 0.40; mild = roll < 0.80; }
    else if (res === Rarity.ur) { hot = roll < 0.60; mild = roll < 0.92; }
    else { hot = roll < 0.85; mild = true; }

    if (Math.random() < 0.55) {
      const ambient = [
        () => this.fx.teaserFishJump(),
        () => this.fx.teaserBirds(randInt(3, 5), false),
        () => this.fx.teaserBoat(),
        () => { this.fx.teaserCloud(true); this.schedule(4, () => this.fx.teaserCloud(false)); },
        () => this.fx.teaserSchool(),
      ];
      const p = pick(ambient);
      this.schedule(delay * rand(0.25, 0.6), p);
    }

    if (mild) {
      const mildEvents = [
        () => this.fx.teaserBirds(randInt(7, 10), false),
        () => this.fx.teaserWaterGlow(),
        () => this.showOldMan(pick(OLD_MAN.mild), "warm"),
      ];
      const p = pick(mildEvents);
      this.schedule(delay * rand(0.4, 0.7), p);
    }

    if (hot) {
      const r = Math.random();
      this.schedule(delay * rand(0.55, 0.8), () => {
        if (this.result === Rarity.lr && r < 0.5) {
          this.showOldMan(pick(OLD_MAN.premium), "premium");
        } else if (r < 0.4) {
          this.fx.teaserRainbow();
        } else if (r < 0.7) {
          this.fx.teaserBirds(1, true);
        } else if (r < 0.85) {
          this.fx.teaserRain(true);
          this.schedule(2.2, () => this.fx.teaserRain(false));
          this.schedule(2.6, () => this.fx.teaserRainbow());
        } else {
          this.showOldMan(pick(OLD_MAN.hot), "hot");
        }
      });
    }
  }

  showOldMan(line, heat = "normal") {
    if (this.phase !== "idle" && this.phase !== "waiting" && this.phase !== "reach") return;
    if (this.oldManCue && OLDMAN_HEAT[this.oldManCue.heat].isCutIn && !OLDMAN_HEAT[heat].isCutIn) return;
    const cue = { id: Math.random().toString(36).slice(2), line, heat };
    this.oldManCue = cue;
    if (OLDMAN_HEAT[heat].isCutIn) {
      this.snd.play("cutin");
      this.haptics.play({ name: "cutIn", premium: heat === "premium" });
      this.fx.shake(heat === "premium" ? 5 : 3);
    }
    this.schedule(OLDMAN_HEAT[heat].duration, () => {
      if (this.oldManCue?.id === cue.id) this.oldManCue = null;
    });
  }

  scheduleAmbient() {
    if (this.ambientArmed) return;
    this.ambientArmed = true;
    this.schedule(rand(4, 9), () => {
      this.ambientArmed = false;
      if (this.phase !== "idle") return;
      switch (randInt(0, 5)) {
        case 0: this.fx.teaserFishJump(); break;
        case 1: this.fx.teaserBirds(randInt(3, 6), false); break;
        case 2: this.fx.teaserBoat(); break;
        case 3: this.showOldMan(pick(OLD_MAN.idle)); break;
        case 4:
          this.fx.teaserCloud(true);
          this.schedule(4.5, () => this.fx.teaserCloud(false));
          break;
        default: this.fx.teaserSchool();
      }
      this.scheduleAmbient();
    });
  }

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
    this.fx.shadowSize([0.3, 0.45, 0.7, 0.9, 1.1][k]);
    this.fx.setFightLook(true);
    this.fx.setOrbit([1.8, 2.5, 4.2, 4.0, 5.2][k], [42, 55, 70, 80, 90][k], true);
    this.fx.setAura(k);
    this.fx.setSpeedLines(k >= 2 ? k : 0);

    const dur = [2.4, 4.2, 6.2, 8.2, 9.6][k];
    const lunges = [1, 2, 4, 6, 7][k];
    this.hookLunges = lunges;
    for (let i = 0; i < lunges; i++) {
      const t = 0.6 + dur * i / lunges;
      this.schedule(Math.max(0, t - HOOK.cue), () => this.hookCue(t - Math.max(0, t - HOOK.cue)));
      this.schedule(t, () => this.battleLunge(k >= 2));
    }

    if (k === 0) {
      this.showBanner("食いついた!", "", "info", 1.2);
    } else if (k === 1) {
      this.showBanner("引いてる…!", "", "info", 1.4);
      this.schedule(1.6, () => this.showBanner("粘ってるぞ…", "", "info", 1.2));
    } else if (k === 2) {
      this.enterSuperLook();
      this.schedule(0.1, () => this.showBanner("大物の影だ!!", "スーパーバトルリーチ", "hot", 1.8));
      for (let i = 0; i < 7; i++) {
        this.schedule(0.5 + i * 0.7, () => { this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 2 }); });
      }
      this.schedule(3.4, () => this.showBanner("まだ逃げてない…!!", "", "hot", 1.4));
      this.schedule(4.9, () => this.showBanner("手前まで来た!!", "", "hot", 1.2));
    } else if (k === 3) {
      this.enterPremiumLook(false);
      this.schedule(0.1, () => this.showBanner("ゴールデンバトル!!", "確変大物の激闘…!", "gold", 2.2));
      for (let i = 0; i < 8; i++) {
        this.schedule(0.5 + i * 0.65, () => { this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 3 }); });
      }
      this.schedule(3.0, () => this.showBanner("折れそうだ…!!", "", "gold", 1.4));
      for (let i = 0; i < 3; i++) {
        this.schedule(5.4 + i * 0.7, () => {
          this.prompt = `${3 - i}`; this.promptHot = true;
          this.snd.play("count"); this.haptics.play({ name: "countdown", step: i }); this.fx.shake(6);
        });
      }
      this.schedule(7.6, () => { this.prompt = "GO!!"; this.snd.play("countgo"); });
    } else {
      this.enterPremiumLook(true);
      this.schedule(0.1, () => this.showBanner("!?!?", "この引きは…何だ!?", "rainbow", 1.8));
      this.schedule(2.0, () => this.showBanner("虹色バトル!!!", "伝説確定!?", "rainbow", 2.4));
      for (let i = 0; i < 8; i++) {
        this.schedule(0.6 + i * 0.75, () => {
          this.fx.sparkleBurst([255, 255, 255]); this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 4 });
        });
      }
      this.schedule(6.4, () => this.showBanner("伝説が暴れてる!!!", "", "rainbow", 1.6));
      for (let i = 0; i < 3; i++) {
        this.schedule(7.0 + i * 0.7, () => {
          this.prompt = `${3 - i}`; this.promptHot = true;
          this.snd.play("count"); this.haptics.play({ name: "countdown", step: i }); this.fx.shake(7);
        });
      }
      this.schedule(9.1, () => { this.prompt = "GO!!"; this.snd.play("countgo"); });
    }
    this.schedule(dur, () => this.endReach());
  }

  // ---- 合わせ ----
  hookCue(lead) {
    if (this.phase !== "reach") return;
    this.hookLunge = { id: Math.random().toString(36).slice(2), cueAt: this.now, at: this.now + lead, judged: false };
  }

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
  }

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
  }

  // 合わせのレア度UPはSSRまで(UR/LRへの昇格はRUSH突入・上乗せに直結してしまう)
  hookCanRankUp(r) { return r !== null && r < Rarity.ssr; }

  // 0..3 — Lv3(レア度UP)は突っ込みの多い長いリーチだけ
  get hookLevel() {
    const lv = HOOK.lv.filter(v => this.hookGauge >= v - 1e-9).length;
    return this.hookLunges >= HOOK.rankUpMinLunges ? lv : Math.min(2, lv);
  }

  battleLunge(strong) {
    this.spike = Math.min(0.45, this.spike + (strong ? 0.34 : 0.22));
    this.fx.bobberDip(strong ? 1.4 : 0.9);
    this.fx.splashFX(strong);
    this.fx.shake(strong ? 7 : 3);
    if (strong) this.fx.shockwave(false);
    this.snd.play(strong ? "surge" : "bite");
    this.haptics.play({ name: "surge", strong });
  }

  endReach() {
    if (this.phase !== "reach") return;
    if (this.result === null && this.reachKind <= 1) {
      this.escape("逃げられた…");
    } else {
      this.beginMash();
    }
  }

  enterSuperLook() {
    this.snd.bgm("reach");
    this.snd.play("siren");
    this.snd.play("cutin");
    this.snd.play("thunder");
    this.fx.setOrbit(4.5, 70, true);
    this.fx.zoomTo(1.5);
    this.fx.shake(4);
    this.fx.lightningFX();
    this.doFlash([255, 0, 0], 0.35, 0.25);
  }

  enterPremiumLook(rainbow) {
    this.snd.bgm("reach");
    this.snd.play("cutin");
    this.snd.play("riser");
    this.snd.play("thunder");
    this.fx.setOrbit(rainbow ? 5.5 : 4.0, 78, true);
    this.fx.zoomTo(rainbow ? 2.0 : 1.75);
    this.doFlash(rainbow ? [168, 85, 247] : [255, 214, 10], 0.5, 0.35);
    this.fx.shake(8);
    this.fx.lightningFX();
    for (let i = 0; i < 3; i++) {
      this.schedule(0.8 + i * 0.9, () =>
        this.fx.sparkleBurst(rainbow ? [255, 45, 150] : [255, 214, 10]));
    }
    if (rainbow) {
      for (let i = 0; i < 3; i++) {
        this.schedule(2.4 + i * 1.9, () => {
          this.fx.lightningFX();
          this.snd.play("thunder");
          this.fx.shake(5);
        });
      }
    }
  }

  // ---- mash ----
  beginMash() {
    if (this.phase !== "reach") return;
    this.oldManCue = null;
    this.phase = "mash";
    this.mashT = 0;
    this.mashCount = 0;
    this.mashFill = 0;
    this.mashDone = false;
    this.mashDur = 2.4 + 0.32 * this.reachKind + 0.4 * this.reelLv;
    // 合わせの効果: Lv1 連打-20% / Lv2 連打-35%+PERFECT確定 / Lv3(完璧・長いリーチのみ) さらにレア度+1(SSRまで)
    const lv = this.hookLevel;
    this.hookLunge = null;
    const perks = [];
    if (lv >= 3 && this.hookCanRankUp(this.result)) {
      this.result += 1;
      perks.push("レア度UP");
    }
    const cut = lv >= 2 ? 0.65 : lv >= 1 ? 0.8 : 1;
    if (lv >= 1) perks.push(`連打-${Math.round((1 - cut) * 100)}%`);
    this.hookPerfect = lv >= 2 && this.result !== null;
    if (this.hookPerfect) perks.push("PERFECT確定");
    this.mashNeed = this.result === null ? 999 : Math.max(1, Math.floor(MASH_NEED[this.result] * this.mashMult * cut));
    this.mashTapsLeft = this.result === null ? null : this.mashNeed;
    this.prompt = "連打!!";
    this.promptHot = true;
    this.snd.play("cutin");
    this.fx.zoomTo(1.3);
    this.fx.setSpeedLines(Math.max(3, this.reachKind));
    this.fx.setOrbit(3.0, 30, true);
    if (perks.includes("レア度UP")) {
      this.doFlash([255, 214, 10], 0.6, 0.3);
      this.snd.play("perfect");
      this.fx.sparkleBurst([255, 214, 10]);
    }
    this.showBanner(lv >= 1 ? `合わせ Lv${lv}!!` : "連打!!",
                    lv >= 1 ? perks.join(" / ") : "画面を連打で引き上げろ!",
                    lv >= 3 ? "gold" : "hot", 1.3);
  }

  tapScreen() {
    switch (this.phase) {
      case "mash": this.onMashTap(); break;
      case "reach": this.hookTap(); break;
      case "reveal": this.dismissReveal(); break;
      case "title": this.startGame(); break;
      case "rushEnding": this.dismissRushSummary(); break;
      case "escaping": this.dismissEscape(); break;
      case "ending": this.dismissEnding(); break;
    }
  }

  onMashTap() {
    if (this.mashDone) return;
    this.mashCount += 1;
    this.snd.play("reel");
    this.fx.bobberDip(0.5);
    this.fx.shockwave(false);
    if (this.mashCount % 6 === 0) { this.fx.shake(4); this.fx.splashFX(true); }
    const raw = this.mashCount / Math.max(1, this.mashNeed);
    this.mashFill = this.result === null
      ? Math.min(raw, 0.85 + 0.04 * Math.sin(this.mashT * 9))
      : Math.min(1, raw);
    if (this.result !== null) this.mashTapsLeft = Math.max(0, this.mashNeed - this.mashCount);
    this.haptics.play({ name: "mashTap", progress: this.mashFill, closing: (1 <= this.mashTapsLeft && this.mashTapsLeft <= 5) });
    if (this.result !== null && this.mashCount >= this.mashNeed) {
      const perfect = this.hookPerfect || this.mashCount >= Math.floor(this.mashNeed * 1.25);
      this.resolveCatch(perfect);
    }
  }

  resolveMash() {
    if (this.result !== null && this.mashCount >= this.mashNeed) {
      this.resolveCatch(this.hookPerfect);
    } else if (this.result !== null) {
      const fish = pick(fishPool[this.result]);
      const report = makeEscapeReport(
        { type: "lineBreak", rarity: this.result, fishName: fish.name, img: fish.img,
          cm: randInt(fish.cm[0], fish.cm[1]), discovered: dex.entry(fish.name).count > 0 },
        this.mashCount, this.mashNeed);
      this.escape("", report);
    } else {
      this.escape("", makeEscapeReport({ type: "bluff" }, this.mashCount, this.mashNeed));
    }
  }

  resolveCatch(perfect) {
    if (this.phase !== "mash" || this.mashDone) return;
    this.mashDone = true;
    this.prompt = "";
    this.snd.play("hook");
    this.snd.play("impact");
    this.haptics.play({ name: "hook" });
    this.fx.hookLunge();
    this.fx.splashFX(true);
    this.fx.shockwave(true);
    if (perfect) {
      this.showBanner("激連打 PERFECT!!", "", "gold", 1.0);
      this.snd.play("perfect");
    }
    const r = this.result ?? Rarity.n;
    this.schedule(0.55, () => this.caught(perfect, r <= Rarity.r));
  }

  // ---- resolve ----
  caught(perfect, small) {
    this.oldManCue = null;
    const r = this.result ?? Rarity.n;
    let chosen = this.pickSpecies(fishPool[r]);
    let isSecret = false;
    // シークレットは図鑑コンプ + 金の竿MAX で解禁
    const secretOpen = dex.isComplete && this.rareLv >= UPGRADE_COSTS.length;
    if (this.forceSecret || (secretOpen && Math.random() < 0.04)) {
      chosen = pick(secretFishPool);
      isSecret = true;
    }
    const cm = randInt(chosen.cm[0], chosen.cm[1]);
    const isNew = dex.entry(chosen.name).count === 0;
    dex.log(chosen.name, cm);
    let sc = chosen.score;
    if (perfect) sc = Math.floor(sc * 1.5);
    if (this.rushActive) sc *= 2;
    sc = Math.floor(sc * (1 + Math.min(0.5, this.combo * 0.08)));
    const isRecord = cm > this.bestCm;
    if (isRecord) { this.bestCm = cm; store.set("bestCm", cm); }
    const medal = Math.max(1, Math.floor(sc / 12));
    // N・R は「換金」か「餌にする」かを結果カードで選ぶ。換金するまで点数・メダルは入らない
    const baitable = !isSecret && r <= Rarity.r;
    if (!baitable) this.addScore(sc, medal);
    this.combo += 1;

    const rushGain = RushRules.gain(r, this.rushActive, this.rushLv);

    this.reveal = { name: chosen.name, img: chosen.img, rarity: r, cm, score: sc, medals: medal,
                    perfect, isRecord, rushGain, isSmall: small, isSecret, isNew, baitable,
                    rushMissed: !this.rushActive && r === Rarity.ur && rushGain === 0 };
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
  }

  // 同じレア度の中では未登録の魚を3倍出やすくする(図鑑埋めの後押し)
  pickSpecies(pool) {
    const w = pool.map((f) => (dex.entry(f.name).count > 0 ? 1 : 3));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  addScore(sc, medal) {
    this.score += sc;
    if (this.score > this.bestScore) { this.bestScore = this.score; store.set("bestScore", this.score); }
    this.medals += medal;
    store.set("medals", this.medals);
  }

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
  }

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
  }

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
  }

  // 図鑑の「ED再生」ボタン
  replayEnding() {
    if (this.phase !== "idle" || !dex.isComplete) return;
    this.startEnding(true);
  }

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
  }

  escape(reason = "", report = null) {
    this.oldManCue = null;
    this.phase = "escaping";
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
  }

  dismissEscape(force = false) {
    if (this.phase !== "escaping" || !this.escapeReport) return;
    if (!force && this.now - this.escapeShownAt < ESCAPE.skipLockDuration) return;
    this.escapeReport = null;
    this.toIdle();
  }

  toIdle() {
    if (this.rushActive && this.rushLeft <= 0) {
      this.endRush();
      return;
    }
    this.phase = "idle";
    this.landed = false;
    this.prompt = this.autoCast ? `AUTO: 強さ${Math.round(this.autoPower * 100)}%で連投中` : "CASTボタン長押しでキャスト";
    this.promptHot = false;
    this.fx.resetScene();
    this.fx.zoomTo(1);
    this.scheduleAmbient();
    if (this.autoCast) this.schedule(1.0, () => this.autoFire());
    if (!this.rushActive) this.snd.bgm("idle");
  }

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
  }

  dismissRushSummary() {
    if (this.phase !== "rushEnding") return;
    this.rushSummary = null;
    this.toIdle();
  }
}

export { cardFXSpec, RARITY_LABEL, RARITY_COLOR, UPGRADES, UPGRADE_COSTS, dex as fishDex };
