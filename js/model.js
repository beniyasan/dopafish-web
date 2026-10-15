// GameModel — faithful JS port of GameModel.swift
import { Rarity, RARITY_LABEL, RARITY_COLOR, fishPool, secretFishPool, OLD_MAN, OLDMAN_HEAT,
         UPGRADES, UPGRADE_COSTS, RushRules, rushStatus, ESCAPE, makeEscapeReport,
         cardFXSpec, MASH_NEED, BAIT, BAIT_SHOP, fightTypeFor, HOLD, RHYTHM,
         HOLD_COLORS, HOLD_SIZE, HOLD_COLOR_TABLE, HOLD_CHANGE, OMEN, DAY, WEATHER,
         SECRET_COND, SECRET_CHANCE, seedFromString, mulberry32, todayKey,
         NUSHI_POOL, NUSHI, VARIANT, OSU,
         rand, randInt, pick } from "./data.js";

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
const REACH_STAGE_SEC = 2.2;    // 発展前の各段階の長さ(秒)
const REACH_DEVELOP_DELAY = 1.3; // 発展バナーの後、最終段階の台本を始めるまでの間(秒)
// 連続予告: 保留ができた時点の結果ごとの発生率(ハズレ・小物はガセ)
const RENZOKU_CHANCE = { miss: 0.025, [Rarity.n]: 0.025, [Rarity.r]: 0.03, [Rarity.sr]: 0.05, [Rarity.ssr]: 0.14, [Rarity.ur]: 0.4, [Rarity.lr]: 0.7 };

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

// リーチ中の「合わせ」 — 突っ込み(battleLunge)の瞬間にタップ
// cue: 予告リングが縮み始めてから突っ込みまで / great・good: 突っ込み後の受付幅 / early: これより早いと「早い」
export const HOOK = { cue: 0.6, early: 0.08, great: 0.2, good: 0.4, goodGain: 0.6,
                      lv: [0.3, 0.7, 1.0], rankUpMinLunges: 4 };

// 通常ED タイムライン(秒) — ui/css と揃える
export const ENDING = { skipLock: 2.0, teaserAt: 13.5, closeLock: 1.5 };

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

  rollResult() {
    if (this.rig) {
      this.result = Object.prototype.hasOwnProperty.call(Rarity, this.rig) ? Rarity[this.rig] : null;
      return;
    }
    const h = this.currentHold ?? this.makeHold(this.day.seq);
    this.result = this.resolveHold(h, true);
  }

  // ---- 保留(先読み) ----
  // 保留は乱数だけを先に引いておき、レア度は投げる時点の状態(RUSH・竿・餌・時間帯)で決める
  holdRng(seq) {
    return this.day.mode === "daily"
      ? mulberry32((this.day.seed ^ Math.imul(seq + 1, 2654435761)) >>> 0)
      : Math.random;
  }

  makeHold(seq) {
    const g = this.holdRng(seq);
    // u: 魚種 / cm: 大きさ / sec, secPick: シークレット抽選 — デイリーでは全部シード由来
    const h = { seq, r: g(), rescue: g(), rescueR: g(), u: g(), c1: g(), c2: g(),
                cm: g(), sec: g(), secPick: g(), gold: g(), rz: g(), forced: false };
    this.colorHold(h);
    this.markRenzoku(h);
    return h;
  }

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
  }

  // この保留を当該とする連続予告を出すか(3投前から段階的に熱くなる)
  markRenzoku(h) {
    if (h.forced) { h.renzoku = true; return; }
    const res = this.resolveHold(h, false);
    h.renzoku = h.rz < RENZOKU_CHANCE[res === null ? "miss" : res];
  }

  fillHolds() {
    while (this.holds.length < HOLD_SIZE) {
      const last = this.holds.at(-1);
      this.holds.push(this.makeHold(last ? last.seq + 1 : this.day.seq));
    }
  }

  get timeBias() {
    const w = WEATHER[this.day.weather[this.slotIdx]] ?? WEATHER.clear;
    return 1 - (1 - DAY.slots[this.slotIdx].bias) * (1 - w.bias);
  }

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
  }

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
  }

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
  }

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
  }
  resetOmen() { this.omen = 0; store.set("omen", 0); }

  // ---- 1日 ----
  loadDay() {
    const d = store.getJSON("day", null);
    if (!d || d.v !== 1) return this.freshDay("free");
    // 日付が変わったデイリーは続けない(シード・天気はその日のもの)
    if (d.mode === "daily" && d.date !== todayKey()) return this.freshDay("free");
    return d;
  }

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
  }

  saveDay() { this.day.score = this.score; LS.setItem("day", JSON.stringify(this.day)); }

  slotFor(castNo) {
    const n = Math.max(1, Math.min(DAY.casts, castNo));
    return DAY.slots.findIndex((sl) => n <= sl.until);
  }
  get slot() { return DAY.slots[this.slotIdx]; }
  get weatherKey() { return this.day.weather[this.slotIdx] ?? "clear"; }

  setSlot(idx) {
    const changed = idx !== this.slotIdx;
    this.slotIdx = idx;
    this.fx.setWeather?.(this.weatherKey);
    return changed;
  }

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
  }

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

  // ---- 連続予告 ----
  playRenzoku(step) {
    if (!step) return;
    const at = (t, f) => this.schedule(t, () => { if (this.phase === "waiting") f(); });
    if (step === 1) {
      at(0.2, () => { this.fx.teaserWaterGlow(); this.snd.play("tick"); });
      at(0.3, () => this.showBanner("…?", "海の様子が…", "info", 1.2));
    } else if (step === 2) {
      at(0.1, () => { this.fx.teaserSchool(); this.fx.teaserBirds(8, false); });
      at(0.2, () => this.showBanner("ざわ…ざわ…", "連続予告", "hot", 1.3));
      for (let i = 0; i < 3; i++) at(0.3 + i * 0.5, () => { this.snd.play("heart"); this.haptics.play({ name: "heartbeat", level: 2 }); });
    } else {
      at(0.05, () => { this.doFlash([0, 0, 0], 0.55, 0.35); this.fx.lightningFX(); this.snd.play("thunder"); this.fx.shake(6); });
      at(0.4, () => this.showBanner("連続予告 MAX!!", "", "gold", 1.4));
      at(0.5, () => this.showOldMan(pick(["…来るぞ、構えろ!!", "この流れ…間違いねえ!!", "3投続けて海が騒いでる…!!"]), "hot"));
    }
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
  }

  // 最終段階 k に至る発展ルート
  reachPath(k) {
    if (this.nushiPending || this.secretPending || k <= 1) return [k];
    const r = Math.random();
    if (k === 2) return r < 0.55 ? [1, 2] : [2];
    if (k === 3) return r < 0.4 ? [1, 2, 3] : r < 0.75 ? [2, 3] : [3];
    return r < 0.25 ? [1, 2, 4] : r < 0.5 ? [2, 3, 4] : r < 0.75 ? [3, 4] : [4];
  }

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
    if (lv >= 1) perks.push(`ノルマ-${Math.round((1 - cut) * 100)}%`);
    this.hookPerfect = lv >= 2 && this.result !== null;
    if (this.hookPerfect) perks.push("PERFECT確定");
    // 外れ(影)は見た目のリーチの大きさに合わせた種類にする
    const asRarity = this.result ?? [Rarity.n, Rarity.n, Rarity.sr, Rarity.ur, Rarity.ur][this.reachKind];
    this.fightType = fightTypeFor(asRarity);
    this.fightProg = 0;
    this.mashNeed = this.result === null ? 999 : Math.max(1, Math.floor(MASH_NEED[this.result] * this.mashMult * cut));
    this.mashTapsLeft = this.result === null || this.fightType !== "mash" ? null : this.mashNeed;
    this.nushiFight = this.nushiPending;
    this.nushiPending = false;
    this.secretFight = !!this.secretPending;
    this.secretFish = this.secretPending;
    this.secretPending = null;
    if (this.secretFight) this.fightType = "osu";
    if (this.nushiFight) this.fightType = "hold";
    if (this.nushiFight) this.setupNushi(cut);
    else if (this.fightType === "hold") this.setupHold(asRarity, cut);
    if (this.fightType === "rhythm") this.setupRhythm(asRarity, cut);
    if (this.fightType === "osu") this.setupOsu(this.secretFight ? "secret" : "lr", cut);
    const intro = {
      mash:   ["連打!!", "連打!!", "画面を連打で引き上げろ!"],
      hold:   this.nushiFight ? ["", "ヌシとの死闘!!", "緑ゾーンで体力を削れ!"] : ["", "テンション勝負!!", "長押しで緑ゾーンを保て!"],
      rhythm: ["", "リズムバトル!!", "円に重なる瞬間にタップ!"],
      osu:    ["", this.secretFight ? "幻との死闘!!!" : "伝説バトル!!!", "円を叩け・なぞれ・回せ!"],
    }[this.fightType];
    // 長押し・リズムはメーター内に操作説明があるので、下の大きな案内は出さない
    this.prompt = this.fightType === "mash" ? intro[0] : "";
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
    this.showBanner(lv >= 1 ? `合わせ Lv${lv}!!` : intro[1],
                    lv >= 1 ? perks.join(" / ") : intro[2],
                    lv >= 3 ? "gold" : "hot", 1.3);
  }

  // ---- 長押し(SR・SSR) ----
  setupHold(r, cut) {
    this.holdZone = HOLD.zone[r];
    this.holdNeed = HOLD.needTime[r] * this.mashMult * cut;
    this.holdSurge = HOLD.surge[r];
    this.holdTension = this.holdZone[0] - 0.08;
    this.holding = false;
    this.holdOver = 0;
    this.holdSurgeAt = this.mashT + rand(0.9, 1.5);
    this.mashDur = this.holdNeed * 2 + 1.2 + 0.4 * this.reelLv;
  }

  // ---- ヌシ ----
  get nushiDef() { return NUSHI_POOL[this.nushiState.idx] ?? null; }

  setupNushi(cut) {
    this.holdZone = NUSHI.zone;
    this.holdSurge = NUSHI.surge;
    this.holdTension = this.holdZone[0] - 0.08;
    this.holding = false;
    this.holdOver = 0;
    this.holdSurgeAt = this.mashT + rand(0.8, 1.3);
    this.mashDur = NUSHI.fightSec + 0.4 * this.reelLv;
    // 合わせのノルマ減は与ダメージ増として効く
    this.nushiDps = 1 / (this.nushiDef.hpSec * cut);
    this.nushiDealt = 0;
    this.fightProg = 1 - this.nushiState.hp;
  }

  saveNushi() { LS.setItem("nushi", JSON.stringify(this.nushiState)); }

  // 逃げられても削った体力は持ち越し
  nushiEscape(snapped) {
    if (this.mashDone) return;
    this.mashDone = true;
    this.nushiFight = false;
    const d = this.nushiDef, hp = this.nushiState.hp;
    this.saveNushi();
    const report = {
      id: Math.random().toString(36).slice(2), fight: "nushi", isNearMiss: hp < 0.15, isBigFish: true,
      kind: { type: "nushi", name: d.name, img: d.img, hp, dealt: this.nushiDealt },
      headline: snapped ? "糸が切れた!!" : "ヌシは深みへ消えた…",
      subline: `体力を ${Math.round(this.nushiDealt * 100)}% 削った! 残り ${Math.round(hp * 100)}% は次回へ持ち越し`,
    };
    this.escape("", report);
  }

  tickHold(dt) {
    if (this.mashDone) return;
    const [lo, hi] = this.holdZone;
    if (this.autoWin) this.holding = this.holdTension < (lo + hi) / 2;
    this.holdTension += (this.holding ? HOLD.rise : -HOLD.fall) * dt;
    if (this.mashT >= this.holdSurgeAt) {
      // 魚が暴れてテンションが跳ね上がる
      this.holdTension += rand(this.holdSurge[0], this.holdSurge[1]);
      this.holdSurgeAt = this.mashT + rand(0.7, 1.4);
      this.fx.bobberDip(1.1); this.fx.shake(4); this.fx.splashFX(true);
      this.snd.play("surge");
      this.haptics.play({ name: "surge", strong: false });
    }
    this.holdTension = Math.max(0, this.holdTension);
    const inZone = this.holdTension >= lo && this.holdTension <= hi;
    if (this.nushiFight) {
      if (inZone) {
        const dmg = Math.min(this.nushiState.hp, dt * this.nushiDps);
        this.nushiState.hp -= dmg;
        this.nushiDealt += dmg;
      }
      this.fightProg = 1 - this.nushiState.hp;
      this.mashFill = this.fightProg;
      if (this.holdTension >= 1) { this.nushiEscape(true); return; }
      if (this.nushiState.hp <= 0) { this.nushiState.hp = 0; this.resolveCatch(this.hookPerfect || this.holdOver < 0.4); }
      return;
    }
    if (inZone) this.fightProg += dt / this.holdNeed;
    else {
      if (this.mashT > 0.8) this.holdOver += dt; // 最初の立ち上がりは見逃す
      if (this.holdTension < lo) this.fightProg = Math.max(0, this.fightProg - HOLD.slip * dt);
    }
    if (this.result === null) this.fightProg = Math.min(this.fightProg, 0.85 + 0.03 * Math.sin(this.mashT * 9));
    this.mashFill = Math.min(1, this.fightProg);
    if (this.holdTension >= 1) { this.fightFail(true); return; }
    if (this.result !== null && this.fightProg >= 1) {
      this.resolveCatch(this.hookPerfect || this.holdOver < 0.4);
    }
  }

  // ---- リズム(UR・LR) ----
  setupRhythm(r, cut) {
    // 間隔を拍の倍率からランダムに選ぶ(一定間隔だと単調なので)
    let t = this.now + RHYTHM.leadIn;
    this.rhythmNotes = [];
    for (let i = 0; i < RHYTHM.notes; i++) {
      this.rhythmNotes.push({ id: i, t, judged: null });
      t += Math.max(RHYTHM.minGap, RHYTHM.beat * pick(RHYTHM.gaps));
    }
    this.rhythmNeed = Math.max(1, RHYTHM.need * this.mashMult * cut);
    this.rhythmScore = 0;
    this.rhythmAllGreat = true;
    this.rhythmBeat = 0;
    this.mashDur = this.rhythmNotes.at(-1).t - this.now + RHYTHM.good + 0.4;
  }

  // ---- osu! 風(LR・シークレット) ----
  // 円(タップ)・スライダー(押したままボールを追う)・最後にスピナー(ぐるぐる回す)
  setupOsu(levelKey, cut) {
    const L = OSU.levels[levelKey], F = OSU.field;
    const inField = (p) => p.x >= F.x0 && p.x <= F.x1 && p.y >= F.y0 && p.y <= F.y1;
    let prev = { x: 195, y: 400 };
    const near = (from, dmin, dmax) => {
      for (let k = 0; k < 30; k++) {
        const a = rand(0, Math.PI * 2), d = rand(dmin, dmax);
        const p = { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d };
        if (inField(p)) return p;
      }
      return { x: rand(F.x0, F.x1), y: rand(F.y0, F.y1) };
    };
    const kinds = [...Array(L.circles).fill("c"), ...Array(L.sliders).fill("s")];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    if (kinds[0] === "s") { const k = kinds.indexOf("c"); [kinds[0], kinds[k]] = [kinds[k], kinds[0]]; }
    const objs = [];
    let t = this.now + RHYTHM.leadIn + 0.2, num = 1;
    for (const k of kinds) {
      const p = near(prev, OSU.jump[0], OSU.jump[1]);
      if (k === "c") {
        objs.push({ id: objs.length, type: "circle", t, x: p.x, y: p.y, num: num++, judged: null });
        prev = p;
        t += Math.max(0.3, L.beat * pick([1, 1, 1, 0.5, 1.5]));
      } else {
        const len = rand(L.sliderLen[0], L.sliderLen[1]);
        const p2 = near(p, 120, 170);
        // 曲がったスライダー: 中点から垂直方向にずらした制御点
        const mx = (p.x + p2.x) / 2, my = (p.y + p2.y) / 2, dx = p2.x - p.x, dy = p2.y - p.y, dl = Math.hypot(dx, dy) || 1;
        const bend = rand(-50, 50);
        objs.push({ id: objs.length, type: "slider", t, t2: t + len, x: p.x, y: p.y, x2: p2.x, y2: p2.y,
                    cx: mx - dy / dl * bend, cy: my + dx / dl * bend, num: num++, head: null, follow: 0, done: false });
        prev = p2;
        t += len + L.beat;
      }
    }
    t += L.beat * 0.5;
    objs.push({ id: objs.length, type: "spinner", t, t2: t + L.spin, x: 195, y: 395, turns: 0, need: L.spinTurns, last: null, done: false });
    this.osuObjs = objs;
    this.osuPtr = { down: false, x: 0, y: 0 };
    this.osuScore = 0;
    const max = L.circles + L.sliders * 1.5 + 2;
    this.osuNeed = Math.max(1, max * OSU.need * this.mashMult * cut);
    this.osuAllGreat = true;
    this.mashDur = objs.at(-1).t2 - this.now + 0.4;
  }

  sliderPos(o, f) {
    const u = 1 - Math.max(0, Math.min(1, f));
    const v = 1 - u;
    return { x: u * u * o.x + 2 * u * v * o.cx + v * v * o.x2, y: u * u * o.y + 2 * u * v * o.cy + v * v * o.y2 };
  }

  osuJudge(d) {
    const ad = Math.abs(d);
    return ad <= OSU.great ? "great" : ad <= OSU.good ? "good" : "miss";
  }

  osuHit(o, kind) {
    if (kind !== "great") this.osuAllGreat = false;
    if (o.type === "circle") { o.judged = kind; this.osuScore += kind === "great" ? 1 : kind === "good" ? 0.6 : 0; }
    else { o.head = kind; this.osuScore += kind === "great" ? 0.5 : kind === "good" ? 0.3 : 0; }
    this.fightPop(kind === "great" ? "GREAT!!" : kind === "good" ? "GOOD!" : "MISS", kind === "miss" ? "early" : kind);
    if (kind !== "miss") {
      this.snd.play("reel");
      this.fx.bobberDip(0.6); this.fx.shockwave(kind === "great");
      this.haptics.play({ name: "mashTap", progress: this.fightProg, closing: false });
    }
    this.syncOsuProg();
  }

  syncOsuProg() {
    this.fightProg = this.osuScore / this.osuNeed;
    this.mashFill = Math.min(1, this.fightProg);
  }

  // 画面(ステージ座標)を押した
  osuDown(x, y) {
    if (this.phase !== "mash" || this.fightType !== "osu" || this.mashDone) return;
    this.osuPtr = { down: true, x, y };
    const R = OSU.radius + OSU.hitSlop, win = OSU.good + 0.05;
    let target = null;
    for (const o of this.osuObjs) {
      const open = o.type === "circle" ? !o.judged : o.type === "slider" ? o.head === null : false;
      if (!open || Math.abs(this.now - o.t) > win) continue;
      if (Math.hypot(x - o.x, y - o.y) > R) continue;
      if (!target || o.t < target.t) target = o;
    }
    if (target) { this.osuHit(target, this.osuJudge(this.now - target.t)); return; }
    const sp = this.osuObjs.find((o) => o.type === "spinner" && this.now >= o.t && this.now <= o.t2);
    if (sp) { sp.last = Math.atan2(y - sp.y, x - sp.x); return; }
    // 何もないところを叩いた・早押し: 減点
    this.osuScore = Math.max(0, this.osuScore - OSU.strayPenalty);
    this.osuAllGreat = false;
    this.fightPop("ミス", "early");
    this.syncOsuProg();
  }

  osuMove(x, y) {
    if (!this.osuPtr.down) return;
    this.osuPtr.x = x; this.osuPtr.y = y;
    const sp = this.osuObjs.find((o) => o.type === "spinner" && this.now >= o.t && this.now <= o.t2);
    if (sp) {
      const a = Math.atan2(y - sp.y, x - sp.x);
      if (sp.last !== null) {
        let da = a - sp.last;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        sp.turns += Math.abs(da) / (Math.PI * 2);
      }
      sp.last = a;
    }
  }

  osuUp() {
    this.osuPtr.down = false;
    for (const o of this.osuObjs) if (o.type === "spinner") o.last = null;
  }

  tickOsu(dt) {
    if (this.mashDone) return;
    const now = this.now;
    for (const o of this.osuObjs) {
      if (o.type === "circle") {
        if (!o.judged && this.autoWin && now >= o.t) this.osuHit(o, "great");
        if (!o.judged && now > o.t + OSU.good) this.osuHit(o, "miss");
      } else if (o.type === "slider") {
        if (o.head === null && this.autoWin && now >= o.t) this.osuHit(o, "great");
        if (o.head === null && now > o.t + OSU.good) this.osuHit(o, "miss");
        if (o.head && o.head !== "miss" && now >= o.t && now <= o.t2) {
          const b = this.sliderPos(o, (now - o.t) / (o.t2 - o.t));
          if (this.autoWin) this.osuPtr = { down: true, x: b.x, y: b.y };
          if (this.osuPtr.down && Math.hypot(this.osuPtr.x - b.x, this.osuPtr.y - b.y) <= OSU.follow) {
            o.follow += dt;
            if (Math.random() < dt * 8) this.snd.play("tick");
          }
        }
        if (!o.done && now > o.t2) {
          o.done = true;
          let ratio = o.head === "miss" ? 0 : o.follow / (o.t2 - o.t);
          if (ratio >= 0.8) ratio = 1;
          this.osuScore += ratio;
          if (ratio < 1) this.osuAllGreat = false;
          this.fightPop(ratio >= 1 ? "SLIDER!!" : ratio >= 0.5 ? "GOOD!" : "MISS", ratio >= 1 ? "great" : ratio >= 0.5 ? "good" : "early");
          if (ratio > 0) { this.snd.play("hook"); this.fx.splashFX(true); }
          if (this.autoWin) this.osuPtr.down = false;
          this.syncOsuProg();
        }
      } else if (o.type === "spinner") {
        if (now >= o.t && now <= o.t2) {
          if (this.autoWin) o.turns += dt * o.need / (o.t2 - o.t) * 1.3;
          if (Math.random() < dt * 6 && o.turns > 0) this.snd.play("reel");
        }
        if (!o.done && now > o.t2) {
          o.done = true;
          const frac = Math.min(1, o.turns / o.need);
          this.osuScore += 2 * frac;
          if (frac < 1) this.osuAllGreat = false;
          this.fightPop(frac >= 1 ? "SPIN CLEAR!!" : `${Math.floor(frac * 100)}%`, frac >= 1 ? "great" : frac >= 0.5 ? "good" : "early");
          if (frac >= 1) { this.snd.play("perfect"); this.fx.shake(6); }
          this.syncOsuProg();
        }
      }
    }
  }

  tickRhythm() {
    if (this.mashDone) return;
    for (const nt of this.rhythmNotes) {
      if (nt.judged) continue;
      if (this.autoWin && this.now >= nt.t) { this.judgeNote(nt, 0); continue; }
      if (this.now > nt.t + RHYTHM.good) { nt.judged = "miss"; this.rhythmAllGreat = false; this.fightPop("MISS", "early"); }
    }
    // メトロノーム
    while (this.rhythmBeat < this.rhythmNotes.length && this.now >= this.rhythmNotes[this.rhythmBeat].t) {
      this.rhythmBeat++;
      this.snd.play("tick");
    }
  }

  rhythmTap() {
    if (this.mashDone) return;
    let best = null;
    for (const nt of this.rhythmNotes) {
      if (nt.judged) continue;
      if (!best || Math.abs(nt.t - this.now) < Math.abs(best.t - this.now)) best = nt;
    }
    if (best && Math.abs(best.t - this.now) <= RHYTHM.good + 0.05) this.judgeNote(best, this.now - best.t);
    else {
      // 闇雲な連打は減点
      this.rhythmScore = Math.max(0, this.rhythmScore - RHYTHM.strayPenalty);
      this.rhythmAllGreat = false;
      this.fightPop("ミス", "early");
      this.syncRhythmProg();
    }
  }

  judgeNote(nt, d) {
    const ad = Math.abs(d);
    if (ad <= RHYTHM.great) { nt.judged = "great"; this.rhythmScore += 1; this.fightPop("GREAT!!", "great"); this.snd.play("reel"); }
    else if (ad <= RHYTHM.good) { nt.judged = "good"; this.rhythmScore += 0.6; this.rhythmAllGreat = false; this.fightPop("GOOD!", "good"); this.snd.play("reel"); }
    else { nt.judged = "miss"; this.rhythmAllGreat = false; this.fightPop("MISS", "early"); }
    if (nt.judged !== "miss") {
      this.fx.bobberDip(0.7); this.fx.shockwave(nt.judged === "great"); this.fx.splashFX(true);
      this.haptics.play({ name: "mashTap", progress: this.fightProg, closing: false });
    }
    this.syncRhythmProg();
    if (this.result !== null && this.fightProg >= 1) this.resolveCatch(this.hookPerfect || this.rhythmAllGreat);
  }

  syncRhythmProg() {
    this.fightProg = this.rhythmScore / (this.result === null ? this.rhythmNeed / 0.85 : this.rhythmNeed);
    if (this.result === null) this.fightProg = Math.min(this.fightProg, 0.85);
    this.mashFill = Math.min(1, this.fightProg);
  }

  fightPop(text, kind) { this.hookPop = { id: Math.random().toString(36).slice(2), text, kind }; }

  // 長押し・リズムの失敗(snapped: 糸切れ)
  fightFail(snapped) {
    if (this.mashDone) return;
    this.mashDone = true;
    const prog = Math.round(Math.min(1, this.fightProg) * 100);
    if (this.result === null) {
      this.escape("", makeEscapeReport({ type: "bluff" }, 0, 0));
      return;
    }
    const secret = this.secretFight;
    const fish = secret ? this.secretFish : pick(fishPool[this.result]);
    this.secretFight = false;
    this.escape("", makeEscapeReport(
      { type: "lineBreak", rarity: this.result, fishName: fish.name, img: fish.img, snapped, secret,
        cm: randInt(fish.cm[0], fish.cm[1]), discovered: dex.entry(fish.name).count > 0 },
      prog, 100, this.fightType));
  }

  // 長押しの入力(画面を押す/離す)
  pressScreen() { if (this.phase === "mash" && this.fightType === "hold") this.holding = true; }
  releaseScreen() { this.holding = false; }

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
    if (this.nushiFight) { this.nushiEscape(false); return; }
    if (this.fightType !== "mash") {
      // 時間切れ: リズムはノーツを叩き切って足りなければ逃げられる
      if (this.result !== null && this.fightProg >= 1) this.resolveCatch(this.hookPerfect || (this.fightType === "osu" && this.osuAllGreat));
      else this.fightFail(false);
      return;
    }
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
    this.holding = false;
    if (perfect) {
      this.showBanner({ mash: "激連打 PERFECT!!", hold: "完璧な駆け引き PERFECT!!", rhythm: "フルコンボ PERFECT!!", osu: "フルコンボ PERFECT!!" }[this.fightType], "", "gold", 1.0);
      this.snd.play("perfect");
    }
    const r = this.result ?? Rarity.n;
    this.schedule(0.55, () => this.caught(perfect, r <= Rarity.r));
  }

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
  }

  // 同じレア度の中では未登録の魚を3倍出やすくする(図鑑埋めの後押し)
  pickSpecies(pool, u = Math.random()) {
    const w = pool.map((f) => (dex.entry(f.name).count > 0 ? 1 : 3));
    let x = u * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x < 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  addScore(sc, medal) {
    this.score += sc;
    if (this.score > this.bestScore) { this.bestScore = this.score; store.set("bestDay", this.score); }
    this.medals += medal;
    store.set("medals", this.medals);
    this.saveDay();
  }

  secretConditionMet(name) {
    const c = SECRET_COND[name];
    if (!c) return true;
    if (c.slot && this.slot.key !== c.slot) return false;
    if (c.weather && this.weatherKey !== c.weather) return false;
    return true;
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
