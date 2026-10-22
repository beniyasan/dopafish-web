// GameModel — faithful JS port of GameModel.swift
import {
  Rarity, RARITY_LABEL, RARITY_COLOR, secretFishPool, UPGRADES, UPGRADE_COSTS,
  RushRules, rushStatus, cardFXSpec, BAIT, HOLD_COLORS, OMEN,
  DAY, WEATHER, SECRET_CHANCE, NUSHI, rand, pick,
} from "./data.js";
import { store, dex } from "./model/store.js";
import { shopMethods } from "./model/shop.js";
import { holdsMethods } from "./model/holds.js";
import { dayMethods } from "./model/day.js";
import { omensMethods } from "./model/omens.js";
import { reachMethods, HOOK } from "./model/reach.js";
import { fightMethods } from "./model/fight.js";
import { catchMethods, ENDING } from "./model/catch.js";

export class GameModel {
  constructor(fx, snd, haptics) {
    this.fx = fx; this.snd = snd; this.haptics = haptics;

    this.phase = "title";           // title idle charging flying waiting reach mash reveal escaping rushEnding ending dayEnd
    // 1日(30投)の進行。score はその日のスコア
    this.day = this.loadDay();
    this.score = this.day.score;
    this.dayResult = null;
    this.slotIdx = this.slotFor(this.day.cast + 1);
    // 保留(先読み)と天井
    this.holds = [];                // [{seq, r, rescue, rescueR, u, forced, color, target}]
    this.currentHold = null;
    this.holdChange = null;         // {id, seq} 保留変化の演出用
    this.omen = store.getInt("omen");
    // ヌシ: idx 番目と戦闘中、hp は残り体力(0..1)。倒すと次のヌシへ
    this.nushiState = store.getJSON("nushi", { idx: 0, hp: 1 });
    this.nushiPending = false;      // この投げでヌシに遭遇
    this.nushiFight = false;        // ヌシとファイト中
    this.nushiDealt = 0;            // このファイトで削った量
    // シークレット: 投げた時点で決め、専用の予告と osu! 風の高難度ファイトにする
    this.secretPending = null;      // この投げのシークレット魚
    this.renzokuStep = 0;           // 連続予告の段階(0なし/1/2/3=当該)
    this.secretFight = false;
    this.secretFish = null;
    // osu! 風ファイト
    this.osuObjs = [];
    this.osuPtr = { down: false, x: 0, y: 0 };
    this.osuScore = 0;
    this.osuNeed = 1;
    this.osuAllGreat = true;
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
    this.bestScore = store.getInt("bestDay"); // 1日のベスト(以前の bestScore は累計だったので引き継がない)
    if (this.day.prevBest === undefined) this.day.prevBest = this.bestScore; // その日が始まった時点の記録
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
    this.fightType = "mash";        // mash | hold | rhythm
    this.fightProg = 0;             // hold/rhythm の引き寄せ 0..1
    this.holding = false;           // hold: 押している
    this.holdTension = 0;
    this.holdZone = [0.4, 0.7];
    this.holdOver = 0;              // hold: ゾーン外にいた秒数(PERFECT判定)
    this.holdSurgeAt = 0;
    this.rhythmNotes = [];          // [{t, judged}] t は this.now 基準
    this.rhythmScore = 0;
    this.rhythmAllGreat = true;
    this.rushCasts = 0;
    this.rushStartScore = 0;
    this.escapeShownAt = 0;
    this.ambientArmed = false;

    // debug: URL params ?rig=ur ?fast ?go ?win ?secret ?mashneed=0.2 ?rush=10 ?ending ?daycast=29 ?omen=90 ?nushi ?gold ?hold=3
    const q = new URLSearchParams(location.search);
    this.rig = q.get("rig");
    this.fast = q.has("fast");
    this.autoStart = q.has("go");
    this.autoWin = q.has("win");
    this.forceSecret = q.has("secret");
    this.forceEnding = q.has("ending");
    this.forceNushi = q.has("nushi");
    this.forceGold = q.has("gold");
    // ?hold=3 保留の表示色を固定(0白〜5虹)。激アツ時・虹保留の見た目確認用
    this.debugHold = q.has("hold") ? Math.max(0, Math.min(HOLD_COLORS.length - 1, parseInt(q.get("hold"), 10) || 0)) : null;
    // ?daycast=29 その日の投数 / ?omen=90 海の気配
    if (q.has("daycast")) { this.day.cast = Math.min(DAY.casts, parseInt(q.get("daycast"), 10) || 0); this.slotIdx = this.slotFor(this.day.cast + 1); }
    if (q.has("omen")) this.omen = Math.min(OMEN.max - 1, parseInt(q.get("omen"), 10) || 0);
    this.mashMult = parseFloat(q.get("mashneed") || "1") || 1;
    this.debugRush = parseInt(q.get("rush") || "", 10) || null;
  }

  get rushStatus() { return rushStatus(this.rushLeft); }
  get rushBonusProbability() { return RushRules.bonusProbability(this.rareLv); }

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
        if (this.fightType === "hold") this.tickHold(dt);
        else if (this.fightType === "rhythm") this.tickRhythm();
        else if (this.fightType === "osu") this.tickOsu(dt);
        else if (this.autoWin) this.onMashTap();
        if (this.phase === "mash" && !this.mashDone && this.mashRemain <= 0) this.resolveMash();
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
    this.fillHolds();
    this.setSlot(this.slotFor(this.day.cast + 1));
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
    // 30投を終えた日のまま再読み込みしたら、追加で投げさせずにリザルトへ
    if (this.day.cast >= DAY.casts && !this.rushActive) { this.endDay(); return; }
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
    this.currentHold = this.rig ? null : this.consumeHold();
    // 連続予告の段階: 当該保留が 2投先=1 / 次=2 / 今回=3。RUSH中は出さない
    const seq = this.currentHold ? [this.currentHold, ...this.holds] : [];
    const idx = seq.findIndex((h) => h.renzoku);
    this.renzokuStep = !this.rushActive && idx >= 0 && idx <= 2 ? 3 - idx : 0;
    // RUSH中の投げは1日の投数に数えない(時間が止まる)
    if (!this.rushActive) {
      this.day.cast += 1;
      if (this.setSlot(this.slotFor(this.day.cast))) {
        const w = WEATHER[this.weatherKey];
        this.schedule(0.5, () => this.showBanner(this.slot.name, `${w.icon}${w.name}`, "info", 1.4));
      }
    }
    this.saveDay();
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
    // ヌシとの遭遇(通常時のみ)
    this.nushiPending = !!this.nushiDef && !this.rushActive && (!this.rig || this.forceNushi)
      && (this.forceNushi || Math.random() < NUSHI.encounter);
    if (this.nushiPending) this.result = Rarity.lr;
    // シークレットは図鑑コンプ + 金の竿MAX で解禁。さらに魚ごとの時間帯・天気の条件を満たすものだけ
    this.secretPending = null;
    const hr = this.currentHold;
    const secretOpen = dex.isComplete && this.rareLv >= UPGRADE_COSTS.length;
    const eligible = secretFishPool.filter((f) => this.secretConditionMet(f.name));
    if (!this.nushiPending && (!this.rig || this.forceSecret) && (this.forceSecret
        || (secretOpen && eligible.length && this.result !== null && (hr?.sec ?? Math.random()) < SECRET_CHANCE))) {
      const pool = this.forceSecret ? secretFishPool : eligible;
      this.secretPending = pool[Math.floor((hr?.secPick ?? Math.random()) * pool.length)];
      this.result = Rarity.lr;
    }
    this.scheduleTeasers(this.biteTimer);
    this.playRenzoku(this.renzokuStep);
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
    this.renzokuStep = 0; // 連続予告(海の色)は待ち時間だけ。アタリが来たら戻す
    this.pickReach();
    if (this.nushiPending) {
      this.reachKind = 4;
      this.showOldMan(this.nushiDef.line, "nushi");
    } else if (this.secretPending) {
      this.reachKind = 4;
      this.showOldMan(pick(["…この気配、ただの魚じゃねえ", "50年通って一度も見たことのない影だ…!!", "まさか…幻の…!?"]), "secret");
    }
    this.fx.bobberDip(1);
    this.snd.play("bite");
    this.haptics.play({ name: "bite" });
    this.runReach();
  }

  tapScreen() {
    switch (this.phase) {
      case "mash":
        if (this.fightType === "hold") this.pressScreen();
        else if (this.fightType === "rhythm") this.rhythmTap();
        else if (this.fightType === "osu") { /* 位置が要るので osuDown(x, y) で受ける */ }
        else this.onMashTap();
        break;
      case "reach": this.hookTap(); break;
      case "reveal": this.dismissReveal(); break;
      case "title": this.startGame(); break;
      case "rushEnding": this.dismissRushSummary(); break;
      case "escaping": this.dismissEscape(); break;
      case "ending": this.dismissEnding(); break;
    }
  }

  toIdle() {
    if (this.rushActive && this.rushLeft <= 0) {
      this.endRush();
      return;
    }
    if (this.day.cast >= DAY.casts && !this.rushActive) {
      this.endDay();
      return;
    }
    this.setSlot(this.slotFor(this.day.cast + 1));
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
}

// 機能ごとのメソッドを取り込む(getter もそのまま移すため defineProperties)
for (const methods of [shopMethods, holdsMethods, dayMethods, omensMethods, reachMethods, fightMethods, catchMethods]) {
  Object.defineProperties(GameModel.prototype, Object.getOwnPropertyDescriptors(methods));
}

export { dex, HOOK, ENDING };
export { cardFXSpec, RARITY_LABEL, RARITY_COLOR, UPGRADES, UPGRADE_COSTS, dex as fishDex };
