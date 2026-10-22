// GameModel の一部: ファイト: 連打 / 長押し / ヌシ / リズム / osu! 風
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  Rarity, fishPool, makeEscapeReport, MASH_NEED, fightTypeFor, HOLD,
  RHYTHM, NUSHI_POOL, NUSHI, OSU, rand, randInt,
  pick,
} from "../data.js";
import { LS, dex } from "./store.js";

export const fightMethods = {

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
  },

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
  },

  // ---- ヌシ ----
  get nushiDef() { return NUSHI_POOL[this.nushiState.idx] ?? null; },

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
  },

  saveNushi() { LS.setItem("nushi", JSON.stringify(this.nushiState)); },

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
  },

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
  },

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
  },

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
  },

  sliderPos(o, f) {
    const u = 1 - Math.max(0, Math.min(1, f));
    const v = 1 - u;
    return { x: u * u * o.x + 2 * u * v * o.cx + v * v * o.x2, y: u * u * o.y + 2 * u * v * o.cy + v * v * o.y2 };
  },

  osuJudge(d) {
    const ad = Math.abs(d);
    return ad <= OSU.great ? "great" : ad <= OSU.good ? "good" : "miss";
  },

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
  },

  syncOsuProg() {
    this.fightProg = this.osuScore / this.osuNeed;
    this.mashFill = Math.min(1, this.fightProg);
  },

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
  },

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
  },

  osuUp() {
    this.osuPtr.down = false;
    for (const o of this.osuObjs) if (o.type === "spinner") o.last = null;
  },

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
  },

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
  },

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
  },

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
  },

  syncRhythmProg() {
    this.fightProg = this.rhythmScore / (this.result === null ? this.rhythmNeed / 0.85 : this.rhythmNeed);
    if (this.result === null) this.fightProg = Math.min(this.fightProg, 0.85);
    this.mashFill = Math.min(1, this.fightProg);
  },

  fightPop(text, kind) { this.hookPop = { id: Math.random().toString(36).slice(2), text, kind }; },

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
  },

  // 長押しの入力(画面を押す/離す)
  pressScreen() { if (this.phase === "mash" && this.fightType === "hold") this.holding = true; },
  releaseScreen() { this.holding = false; },

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
  },

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
  },

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
  },
};
