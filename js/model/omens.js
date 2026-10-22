// GameModel の一部: 予告演出: 連続予告・予告(鳥や魚群)・じいさん・リーチの見た目
// model.js で GameModel.prototype に取り込む(this は GameModel)
import {
  Rarity, OLD_MAN, OLDMAN_HEAT, rand, randInt, pick,
} from "../data.js";

export const omensMethods = {

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};
