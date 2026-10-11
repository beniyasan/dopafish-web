// GameScene — Canvas 2D port of the SpriteKit scene. Implements the GameFX protocol.
import { tex, buildTextures, tinted, Emitter, rgb, rgba } from "./particles.js";
import { rand, randInt, pick } from "./data.js";

const W = 390, H = 844, WATER_Y = 442;
const ROD_TIP = { x: 55, y: 140 };

function grad(w, h, top, bottom) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d").createLinearGradient(0, 0, 0, h);
  // canvas row 0 = top → when drawn in y-up space, image top = world up
  g.addColorStop(0, rgba(top, 1));
  g.addColorStop(1, rgba(bottom, 1));
  const x = c.getContext("2d");
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}

export class GameScene {
  constructor(canvas, snd) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.snd = snd;
    this.t = 0;

    this.orbitSpeed = 0; this.orbitRadius = 0; this.orbitAngle = 0;
    this.orbitVisible = false;
    this.shadowScale = 0.4;
    this.fightMode = false;
    this.shakeMag = 0;
    this.zoomLevel = 1;
    this.bobberPos = { x: 195, y: 370 };
    this.bobberXY = { x: 195, y: 370 };
    this.bobberAlpha = 0;
    this.bobberTilt = 0;
    this.dipOffset = 0; this.dipVel = 0;
    this.lineAlpha = 0;
    this.cam = { x: 195, y: 422, scale: 1 };
    this.rodRot = 0.5;
    this.rushTintAlpha = 0;
    this.rushOn = false;
    this.flying = false;      // cast tween driving bobberXY
    this.snapping = false;    // lineSnap fling driving bobberXY
    this.shadowAlpha = 0;
    this.shadowXY = { x: 195, y: 315 };
    this.shadowPop = 1;       // hookLunge scale multiplier
    this.sndDelays = [];      // {t, name} coin sounds
    this.emberRate = 0;
    this.rushTintTarget = 0;
    this.lineFlicker = null;
    this.rainEmitter = null;
    this.emberEmitter = null;
    this.coinSeq = 0;
    this.cloudA = 0; this.cloudTarget = 0;
    this.rainA = 0; this.rainTarget = 0;
    this.rainRate = 0;

    this.teasers = [];      // {z, update(dt), draw(ctx), dead}
    this.fxNodes = [];      // {z, update(dt), draw(ctx), dead}
    this.emitters = [];
    this.tweens = [];       // {age, dur, tick(f), done}

    this.speedLines = { alpha: 0, target: 0, mode: 0, hue: 0, beams: null, rot: 0 };
    this.aura = { alpha: 0, mode: 0, hue: 0, target: 0 };

    this.sparkles = [];
    for (let i = 0; i < 14; i++) {
      this.sparkles.push({ x: rand(10, 380), y: rand(60, 420), ph: rand(0, 6), dur: rand(0.8, 2) });
    }

    buildTextures();
    this.rebuildSkySea(false);
  }

  rebuildSkySea(rush) {
    this.skyImg = grad(8, 404,
      rush ? [230, 140, 51] : [102, 184, 255],
      rush ? [255, 217, 128] : [191, 235, 255]);
    this.seaImg = grad(8, 440, [26, 128, 204], [0, 56, 128]);
  }

  tween(dur, tick) { this.tweens.push({ age: 0, dur, tick }); }

  screenToWorld(x, y) {
    const z = 1 / this.cam.scale;
    return {
      x: this.cam.x + (x - 195) / z - (this.cam.jx || 0),
      y: this.cam.y + (422 - y) / z - (this.cam.jy || 0),
    };
  }

  worldToScreen(x, y) {
    const z = 1 / this.cam.scale;
    return {
      x: 195 + (x - this.cam.x - (this.cam.jx || 0)) * z,
      y: 422 - (y - this.cam.y - (this.cam.jy || 0)) * z,
    };
  }

  // draw image upright in y-up world space (ctx already y-flipped)
  img2(img, x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y + h);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
  }

  // centered sprite at world (cx,cy) with world rotation
  img2c(img, cx, cy, w, h, rot = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.scale(1, -1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // ---------- GameFX ----------

  resetScene() {
    this.bobberAlpha = 0;
    this.orbitVisible = false;
    this.fightMode = false;
    this.shadowAlpha = 0;
    this.lineAlpha = 0;
    this.bobberTilt = 0;
    this.flying = false;
    this.snapping = false;
    this.lineFlicker = null;
    this.shadowPop = 1;
    this.setSpeedLines(0);
    this.setAura(0);
  }

  castLure(power) {
    this.bobberAlpha = 1;
    this.lineAlpha = 1;
    this.bobberPos = { x: 195 + rand(-50, 50), y: 320 + 90 * power };
    const c = { x: 195, y: this.bobberPos.y + 260 * power };
    const from = { ...ROD_TIP }, to = this.bobberPos;
    this.flying = true;
    this.tween(0.45, (f) => {
      const u = 1 - f;
      this.bobberXY.x = u * u * from.x + 2 * u * f * c.x + f * f * to.x;
      this.bobberXY.y = u * u * from.y + 2 * u * f * c.y + f * f * to.y;
    });
  }

  lureLanded() { this.flying = false; this.bobberXY = { ...this.bobberPos }; }

  bobberDip(strength) {
    this.dipVel += 60 * strength;
    this.splashFX(strength > 0.7);
  }

  setOrbit(speed, radius, visible) {
    this.orbitSpeed = speed; this.orbitRadius = radius; this.orbitVisible = visible;
  }
  shadowSize(s) { this.shadowScale = 0.35 + s * 0.9; }
  zoomTo(level) { this.zoomLevel = level; }
  shake(m) { this.shakeMag = m; }

  splashFX(big) {
    this.burst(tex.circle, this.bobberXY.x, WATER_Y, big ? 22 : 10, [255, 255, 255],
      { speed: big ? 220 : 120, life: 0.6, scale: 0.35, spread: Math.PI, angle: Math.PI / 2, blend: "alpha" });
    // ripple ring
    const ring = { z: 19, age: 0, dead: false };
    ring.update = (dt) => { ring.age += dt; if (ring.age > 0.7) ring.dead = true; };
    ring.draw = (ctx) => {
      const f = ring.age / 0.7;
      ctx.globalAlpha = 0.9 * (1 - f);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.bobberXY.x, WATER_Y, 6 * (1 + (big ? 9 : 5) * f - f), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    this.fxNodes.push(ring);
  }

  sparkleBurst(color) {
    this.burst(tex.star, this.bobberXY.x, this.bobberXY.y, 26, color,
      { speed: 200, life: 0.9, scale: 0.28, spread: Math.PI * 2, angle: Math.PI / 2, blend: "add" });
  }

  coinRain(n) {
    this.emitters.push(new Emitter(
      { image: tex.coin, count: n, color: null, speed: 260, life: 1.8, scale: 0.5,
        spread: Math.PI / 2, angle: -Math.PI / 2, blend: "alpha",
        range: { dx: 300, dy: 0 }, rotSpeed: 6, rotRange: Math.PI, ttl: 2.2 + 1.8 },
      195, 844));
    for (let i = 0; i < Math.min(6, Math.floor(n / 4)); i++) {
      this.sndDelays.push({ t: this.t + i * 0.12, name: "coin" });
    }
  }

  hookLunge() {
    this.orbitVisible = false;
    const sx = this.bobberXY.x, sy = this.bobberXY.y - 50;
    this.shadowXY = { x: sx, y: sy };
    this.shadowAlpha = 0.9;
    this.tween(0.42, (f) => {
      if (f < 0.29) { // 0.12s move up + scale to 1.4x
        const u = f / 0.29;
        this.shadowXY = { x: sx, y: sy + 20 * u };
        this.shadowPop = 1 + 0.4 * u;
      } else {
        this.shadowPop = 1.4 - 0.4 * (f - 0.29) / 0.71;
      }
    });
    this.dipVel += 90;
  }

  lineSnap() {
    this.lineFlicker = { age: 0, dur: 0.36 };
    this.snapping = true;
    const dir = Math.random() < 0.5 ? -170 : 170;
    const bx = this.bobberXY.x, by = this.bobberXY.y;
    this.tween(0.18, (f) => {
      this.bobberXY.x = bx + dir * f;
      this.bobberXY.y = by;
      this.bobberAlpha = 1 - f;
    });
    this.burst(tex.star, bx, by, 16, [255, 255, 255],
      { speed: 220, life: 0.5, scale: 0.3, spread: Math.PI * 2, angle: 0, blend: "add" });
    this.shockwave(false);
  }

  setFightLook(struggling) {
    this.fightMode = struggling;
    if (struggling) { this.orbitVisible = true; this.shadowAlpha = 0.9; }
  }

  setRushLook(on) {
    this.rushOn = on;
    this.rushTintTarget = on ? 0.12 : 0;
    this.emberRate = on ? 8 : 0;
    this.rebuildSkySea(on);
  }

  // ---------- teasers ----------

  fishNode(color) {
    return (ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(-2, 7, 8, 0);
      ctx.quadraticCurveTo(-2, -7, -10, 0);
      ctx.lineTo(-15, 5); ctx.lineTo(-15, -5);
      ctx.closePath(); ctx.fill();
    };
  }

  teaserFishJump() {
    const x = rand(60, 330), y = WATER_Y, h = rand(60, 110);
    const node = { z: 9, age: 0, dead: false };
    node.update = (dt) => {
      node.age += dt;
      if (node.age > 0.75 + 0.0 && !node.splashed) {
        node.splashed = true;
        this.burst(tex.circle, x + 30, y, 6, [255, 255, 255],
          { speed: 90, life: 0.4, scale: 0.22, spread: Math.PI, angle: Math.PI / 2, blend: "alpha" });
      }
      if (node.age > 1.0) node.dead = true;
    };
    const draw = this.fishNode("rgb(128,179,230)");
    node.draw = (ctx) => {
      const f = Math.min(1, node.age / 0.75);
      const u = 1 - f;
      const px = u * u * x + 2 * u * f * (x + 15) + f * f * (x + 30);
      const py = u * u * y + 2 * u * f * (y + h * 2) + f * f * y;
      // derivative for orientation
      const dx = 2 * u * ((x + 15) - x) + 2 * f * ((x + 30) - (x + 15));
      const dy = 2 * u * (h * 2) + 2 * f * (y - (y + h * 2));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = node.age < 0.05 ? node.age / 0.05
        : node.age > 0.55 ? Math.max(0, 1 - (node.age - 0.55) / 0.2) : 1;
      draw(ctx);
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    this.teasers.push(node);
  }

  birdNode(golden) {
    return (ctx, flap) => {
      ctx.strokeStyle = golden ? "rgb(255,204,51)" : "rgba(51,51,51,0.9)";
      ctx.lineWidth = golden ? 3 : 2;
      if (golden) { ctx.shadowColor = "rgb(255,204,51)"; ctx.shadowBlur = 8; }
      ctx.save(); ctx.scale(1.3, 1.3 * flap);
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.quadraticCurveTo(-3.5, 6, 0, 3);
      ctx.quadraticCurveTo(3.5, 6, 7, 0);
      ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 0;
    };
  }

  teaserBirds(count, golden) {
    const node = { z: 5, age: 0, dead: false, baseY: rand(560, 740), dur: golden ? 7.0 : 5.0 };
    const birds = [];
    for (let i = 0; i < count; i++) {
      const col = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(Math.abs(i - 1) / 2) + 1;
      birds.push({ x: -row * 26, y: col * row * 14, ph: i * 0.13 });
    }
    const draw = this.birdNode(golden);
    let trail;
    if (golden) {
      trail = new Emitter({ image: tex.star, color: [255, 204, 51], rate: 40, life: 0.8, speed: 0,
        scale: 0.35, spread: 0, angle: 0, blend: "add", alphaSpeed: -1.1, scaleSpeed: -0.4 * 0.35, ttl: 8 });
      trail.y = node.baseY;
      this.emitters.push(trail);
    }
    node.update = (dt) => {
      node.age += dt;
      node.x = -60 + (500 + 60) * (node.age / node.dur);
      if (trail) { trail.x = node.x - 20; trail.y = node.baseY; if (node.age >= node.dur) trail.rate = 0, trail.ttl = Math.min(trail.ttl, node.age + 1); }
      if (node.age > node.dur) node.dead = true;
    };
    node.draw = (ctx) => {
      for (const b of birds) {
        const flap = 1.3 - 0.4 * Math.abs(Math.sin((node.age + b.ph) / 0.28 * Math.PI));
        ctx.save(); ctx.translate(node.x + b.x, node.baseY + b.y);
        draw(ctx, flap);
        ctx.restore();
      }
    };
    this.teasers.push(node);
  }

  teaserRainbow() {
    const node = { z: 4, age: 0, dead: false };
    node.update = (dt) => { node.age += dt; if (node.age > 5.4) node.dead = true; };
    node.draw = (ctx) => {
      const a = node.age < 1.2 ? node.age / 1.2 : node.age > 4.2 ? Math.max(0, 1 - (node.age - 4.2) / 1.2) : 1;
      const cols = [[255, 59, 48], [255, 149, 0], [255, 204, 0], [52, 199, 89], [0, 122, 255]];
      ctx.save(); ctx.globalAlpha = a;
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = rgba(cols[i], 0.75);
        ctx.lineWidth = 9; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(90, WATER_Y, 170 - i * 10, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }
      ctx.restore();
    };
    this.teasers.push(node);
  }

  // 予告の雨・雲は、天気(常時)と重ねる。予告が終わっても天気の分は残す
  teaserRain(on) {
    const r = on || this.weather === "rain";
    this.rainRate = r ? (on ? 160 : 110) : 0; this.rainTarget = r ? 0.25 : 0;
  }
  teaserCloud(on) { this.cloudTarget = on ? 0.3 : this.weather === "fog" ? 0.22 : this.weather === "rain" ? 0.12 : 0; }
  setWeather(kind) {
    this.weather = kind;
    this.teaserRain(false);
    this.teaserCloud(false);
  }

  teaserBoat() {
    const fromLeft = Math.random() < 0.5;
    const node = { z: 2.5, age: 0, dead: false };
    node.update = (dt) => { node.age += dt; if (node.age > 9) node.dead = true; };
    node.draw = (ctx) => {
      const x = (fromLeft ? -40 : 430) + (fromLeft ? 470 : -470) * (node.age / 9);
      ctx.fillStyle = "rgba(38,38,38,0.75)";
      ctx.fillRect(x - 23, 446, 46, 10);
      ctx.fillStyle = "rgba(51,51,51,0.75)";
      ctx.fillRect(x - 16, 456, 16, 12);
    };
    this.teasers.push(node);
  }

  teaserSchool() {
    for (let i = 0; i < 6; i++) {
      const y = rand(250, 400);
      const dur = rand(1.0, 1.6);
      const node = { z: 2, age: -i * 0.12, dead: false, dur };
      node.update = (dt) => { node.age += dt; if (node.age > dur + 0.4) node.dead = true; };
      node.draw = (ctx) => {
        if (node.age < 0) return;
        const x = -20 - i * 22 + 470 * Math.min(1, node.age / dur);
        const a = node.age > dur ? Math.max(0, 1 - (node.age - dur) / 0.4) : 1;
        ctx.fillStyle = `rgba(0,0,0,${0.25 * a})`;
        ctx.beginPath(); ctx.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      };
      this.teasers.push(node);
    }
  }

  teaserWaterGlow() {
    this.emitters.push(new Emitter(
      { image: tex.star, color: [153, 242, 255], rate: 24, count: 60, speed: 14, life: 1.6,
        scale: 0.3, spread: Math.PI * 2, angle: Math.PI / 2, blend: "add",
        range: { dx: 240, dy: 60 }, duration: 3, ttl: 4.5 },
      195, 430));
  }

  // ---------- showtime fx ----------

  setSpeedLines(mode) {
    this.speedLines.mode = mode;
    this.speedLines.target = mode === 0 ? 0 : 1;
    if (!this.speedLines.beams && mode > 0) {
      this.speedLines.beams = [];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + rand(-0.08, 0.08);
        this.speedLines.beams.push({
          a, r0: rand(380, 570), w: rand(150, 270), h: rand(6, 13),
          travel: rand(130, 250), dur: rand(0.35, 0.7), peak: rand(0.45, 0.85),
          wait: rand(0, 0.35), ph: rand(0, 10),
        });
      }
    }
  }

  setAura(mode) { this.aura.mode = mode; this.aura.target = mode === 0 ? 0 : 1; }

  lightningFX() {
    const end = { x: this.bobberXY.x + rand(-30, 30), y: this.bobberXY.y + 12 };
    const start = { x: end.x + rand(-130, 130), y: 880 };
    const pts = [start];
    for (let i = 1; i <= 9; i++) {
      const f = i / 9;
      pts.push({ x: start.x + (end.x - start.x) * f + (i === 9 ? 0 : rand(-26, 26)),
                 y: start.y + (end.y - start.y) * f });
    }
    const branches = [];
    for (let b = 0; b < randInt(1, 3); b++) {
      let cur = { ...pts[randInt(3, 6)] };
      const bp = [{ ...cur }];
      const dx = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 3; j++) {
        cur = { x: cur.x + dx * rand(15, 42), y: cur.y - rand(20, 50) };
        bp.push(cur);
      }
      branches.push(bp);
    }
    // prerender bolt image in WORLD coords (y-up → draw with flipped coords)
    const img = document.createElement("canvas");
    img.width = W; img.height = H;
    const c2 = img.getContext("2d");
    const toC = (p) => [p.x, H - p.y];
    c2.lineCap = "round"; c2.lineJoin = "round";
    for (const [w2, a2] of [[9, 0.18], [4.5, 0.42], [1.6, 1]]) {
      c2.strokeStyle = rgba([255, 255, 217], a2);
      c2.lineWidth = w2;
      const stroke = (list) => {
        c2.beginPath();
        list.forEach((p, i) => { const [x, y] = toC(p); i === 0 ? c2.moveTo(x, y) : c2.lineTo(x, y); });
        c2.stroke();
      };
      stroke(pts); branches.forEach(stroke);
    }
    const node = { z: 19, age: 0, dead: false, img };
    node.update = (dt) => { node.age += dt; if (node.age > 0.57) node.dead = true; };
    node.draw = (ctx) => {
      const seq = [[0, 0.15], [0.05, 1], [0.09, 0.3], [0.15, 0.95], [0.19, 0]];
      let a = 0;
      for (let i = 0; i < seq.length; i++) {
        const [t0, v] = seq[i];
        const t1 = i + 1 < seq.length ? seq[i + 1][0] : 0.57;
        const v1 = i + 1 < seq.length ? seq[i + 1][1] : 0;
        if (node.age >= t0 && node.age < t1) { a = v + (v1 - v) * (node.age - t0) / (t1 - t0); break; }
      }
      if (node.age >= 0.57) a = 0;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      this.img2(img, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    this.fxNodes.push(node);
    this.burst(tex.circle, end.x, 445, 14, [255, 255, 217],
      { speed: 240, life: 0.45, scale: 0.4, spread: Math.PI, angle: Math.PI / 2, blend: "add" });
  }

  lightPillar(color) {
    const node = { z: 19, age: 0, dead: false, x: this.bobberXY.x };
    node.update = (dt) => { node.age += dt; if (node.age > 1.2) node.dead = true; };
    node.draw = (ctx) => {
      const t = node.age;
      let alpha, sy;
      if (t < 0.09) { alpha = t / 0.09; sy = 0.05 + (1.18 - 0.05) * (t / 0.09); }
      else if (t < 0.23) { alpha = 1; sy = 1.18; }
      else if (t < 0.35) { alpha = 1; sy = 1.18 - 0.18 * ((t - 0.23) / 0.12); }
      else if (t < 0.9) { alpha = 1; sy = 1; }
      else { alpha = Math.max(0, 1 - (t - 0.9) / 0.4); sy = 1; }
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      this.img2(tinted(tex.pillar, color), node.x - 70, 442, 140, 430 * sy);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    this.fxNodes.push(node);
    this.emitters.push(new Emitter(
      { image: tex.star, color, count: 22, speed: 300, life: 0.9, scale: 0.3,
        spread: 0.25, angle: Math.PI / 2, blend: "add", range: { dx: 90, dy: 0 }, ttl: 1.3 },
      this.bobberXY.x, 450));
  }

  shockwave(big) {
    const at = { x: this.bobberXY.x, y: Math.max(445, this.bobberXY.y) };
    for (let i = 0; i < (big ? 3 : 1); i++) {
      const node = { z: 21, age: -i * 0.09, dead: false };
      node.update = (dt) => { node.age += dt; if (node.age > 0.5) node.dead = true; };
      node.draw = (ctx) => {
        if (node.age < 0) return;
        const f = node.age / 0.5;
        ctx.globalAlpha = 0.95 * (1 - f);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = big ? 5 : 3;
        ctx.shadowColor = "#fff"; ctx.shadowBlur = big ? 10 : 5;
        ctx.beginPath(); ctx.arc(at.x, at.y, 10 * (1 + ((big ? 16 : 9) - 1) * f), 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      };
      this.fxNodes.push(node);
    }
  }

  confettiRain(n) {
    const colors = [[255, 59, 48], [255, 204, 0], [52, 199, 89], [0, 199, 255], [255, 45, 150], [255, 149, 0]];
    for (let i = 0; i < 6; i++) {
      this.emitters.push(new Emitter(
        { image: tex.rect, color: colors[i], count: Math.max(4, Math.floor(n / 6)), speed: 210, life: 2.5,
          scale: 0.55, spread: 0.55, angle: -Math.PI / 2, blend: "alpha",
          range: { dx: 100, dy: 0 }, rotSpeed: 7, rotRange: Math.PI, alphaSpeed: -0.25,
          scaleSpeed: 0, ttl: 3.4 },
        55 + i * 56, 850));
    }
  }

  starShower(n) {
    this.emitters.push(new Emitter(
      { image: tex.star, color: [255, 242, 153], count: n, speed: 330, life: 1.7, scale: 0.45,
        spread: Math.PI / 3, angle: -Math.PI / 2, blend: "add",
        range: { dx: 370, dy: 0 }, rotSpeed: 5, ttl: 2.4 },
      195, 845));
  }

  tapRipple(x, y) {
    const node = { z: 22, age: 0, dead: false };
    node.update = (dt) => { node.age += dt; if (node.age > 0.28) node.dead = true; };
    node.draw = (ctx) => {
      const f = node.age / 0.28;
      ctx.globalAlpha = 0.9 * (1 - f);
      ctx.strokeStyle = "rgb(255,230,102)"; ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgb(255,230,102)"; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(x, y, 5 * (1 + (4.5 - 1) * f), 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    };
    this.fxNodes.push(node);
    this.burst(tex.star, x, y, 5, [255, 214, 10],
      { speed: 130, life: 0.35, scale: 0.18, spread: Math.PI * 2, angle: Math.PI / 2, blend: "add" });
  }

  burst(image, x, y, count, color, cfg) {
    this.emitters.push(new Emitter({ image, count, color, ...cfg, ttl: cfg.life + 0.4 }, x, y));
  }

  // ---------- frame ----------

  update(dt, logic) {
    this.t += dt;

    // cast tween etc
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.age += dt;
      const f = Math.min(1, tw.age / tw.dur);
      tw.tick(f);
      if (f >= 1) this.tweens.splice(i, 1);
    }

    // bobber bob + dip spring (skipped while cast/snap tweens drive it)
    this.dipVel += -this.dipOffset * 140 * dt - this.dipVel * 8 * dt;
    this.dipOffset += this.dipVel * dt;
    const submerge = this.fightMode ? (logic?.tension ?? 0) * 10 : 0;
    if (!this.flying && !this.snapping) {
      this.bobberXY.y = this.bobberPos.y + Math.sin(this.t * 3) * 2.5 - this.dipOffset - submerge;
      this.bobberXY.x = this.bobberPos.x;
    }
    this.bobberTilt = this.fightMode ? (logic?.tension ?? 0) * 0.4 * ((this.t * 8) % 2) - 0.2 : 0;
    const targetBend = this.fightMode ? 0.5 - (logic?.tension ?? 0) * 0.55 : 0.5;
    this.rodRot += (targetBend - this.rodRot) * Math.min(1, dt * 5);

    // orbit shadow
    this.shadowAlpha = this.shadowAlpha ?? 0;
    if (this.orbitVisible) {
      this.orbitAngle += this.orbitSpeed * dt;
      this.shadowAlpha = Math.min(0.85, this.shadowAlpha + dt * 2);
      if (this.fightMode) {
        const pull = Math.sin(this.t * 1.7) * 120 + Math.sin(this.t * 4.3) * 30;
        this.shadowXY = { x: this.bobberXY.x + pull, y: this.bobberXY.y - 60 - Math.sin(this.t * 2.3) * 25 };
      } else {
        this.shadowXY = {
          x: this.bobberXY.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          y: this.bobberXY.y - 55 + Math.sin(this.orbitAngle) * this.orbitRadius * 0.35,
        };
      }
    } else {
      this.shadowAlpha = Math.max(0, this.shadowAlpha - dt * 3);
    }

    // line flicker after snap
    if (this.lineFlicker) {
      this.lineFlicker.age += dt;
      const a = this.lineFlicker.age;
      if (a < 0.24) this.lineAlpha = (Math.floor(a / 0.04) % 2 === 0) ? 0.9 : 0.15;
      else if (a < 0.36) this.lineAlpha = 0.9 * (1 - (a - 0.24) / 0.12);
      else { this.lineAlpha = 0; this.lineFlicker = null; }
    }

    // camera zoom toward bobber + shake
    const targetScale = 1.0 / this.zoomLevel;
    const k = Math.min(1, (this.zoomLevel - 1) * 1.2);
    const zt = { x: 195 + (this.bobberXY.x - 195) * k, y: 422 + (this.bobberXY.y - 422) * k };
    this.cam.x += (zt.x - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (zt.y - this.cam.y) * Math.min(1, dt * 6);
    this.cam.scale += (targetScale - this.cam.scale) * Math.min(1, dt * 4);
    if (this.shakeMag > 0.05) {
      this.cam.jx = rand(-1, 1) * this.shakeMag;
      this.cam.jy = rand(-1, 1) * this.shakeMag;
      this.shakeMag *= Math.pow(0.02, dt);
    } else { this.cam.jx = this.cam.jy = 0; }

    // tints
    const tRate = dt / 0.8;
    this.rushTintAlpha += Math.max(-tRate, Math.min(tRate, (this.rushTintTarget ?? 0) - this.rushTintAlpha));
    this.cloudA += Math.max(-dt / 1.2, Math.min(dt / 1.2, this.cloudTarget - this.cloudA));
    this.rainA += Math.max(-tRate, Math.min(tRate, this.rainTarget - this.rainA));

    // speed lines
    this.speedLines.alpha += Math.max(-dt / 0.25, Math.min(dt / 0.25, this.speedLines.target - this.speedLines.alpha));
    this.speedLines.rot += dt * 0.22;
    if (this.speedLines.mode === 4) this.speedLines.hue = (this.speedLines.hue + dt * 0.4) % 1;

    // aura
    this.aura.alpha += Math.max(-dt / 0.3, Math.min(dt / 0.3, (this.aura.target ?? 0) - this.aura.alpha));
    if (this.aura.mode === 4) this.aura.hue = (this.aura.hue + dt * 0.5) % 1;

    // emitters
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      this.emitters[i].update(dt);
      if (this.emitters[i].isDead) this.emitters.splice(i, 1);
    }

    // delayed scene sounds (coin rain ticks)
    for (let i = this.sndDelays.length - 1; i >= 0; i--) {
      if (this.t >= this.sndDelays[i].t) { this.snd.play(this.sndDelays[i].name); this.sndDelays.splice(i, 1); }
    }

    // rain continuous emitter
    if (this.rainRate > 0) {
      if (!this.rainEmitter) {
        this.rainEmitter = new Emitter(
          { image: tex.circle, color: [217, 217, 217], rate: 160, life: 1.1, speed: 500,
            scale: 0.10, spread: 0.08, angle: -Math.PI / 2 - 0.15, blend: "alpha",
            alpha: 0.5, range: { dx: 480, dy: 0 }, yScale: 7, ttl: 1e9 },
          165, 844);
        this.emitters.push(this.rainEmitter);
      }
      this.rainEmitter.rate = this.rainRate;
    } else if (this.rainEmitter) {
      this.rainEmitter.rate = 0;
      this.rainEmitter.duration = 0;
      this.rainEmitter.ttl = this.rainEmitter.age + 1.6;
      this.rainEmitter = null;
    }

    // embers
    if (this.emberRate > 0) {
      if (!this.emberEmitter) {
        this.emberEmitter = new Emitter(
          { image: tex.star, color: [255, 217, 77], rate: 8, life: 3.5, speed: 40,
            scale: 0.12, spread: 0.6, angle: Math.PI / 2, blend: "add",
            alpha: 0.8, range: { dx: 390, dy: 0 }, ttl: 1e9 },
          195, 0);
        this.emitters.push(this.emberEmitter);
      }
      this.emberEmitter.rate = this.emberRate;
    } else if (this.emberEmitter) {
      this.emberEmitter.rate = 0; this.emberEmitter.duration = 0;
      this.emberEmitter.ttl = this.emberEmitter.age + 4;
      this.emberEmitter = null;
    }

    for (const arr of [this.teasers, this.fxNodes]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].update(dt);
        if (arr[i].dead) arr.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    const camX = this.cam.x + (this.cam.jx || 0), camY = this.cam.y + (this.cam.jy || 0);
    ctx.save();
    ctx.translate(195, 422);
    const z = 1 / this.cam.scale;
    ctx.scale(z, -z);          // world y-up → canvas y-down + camera zoom
    ctx.translate(-camX, -camY);

    // sky & sun & sea
    this.img2(this.skyImg, 0, 440, 390, 404);
    ctx.globalCompositeOperation = "lighter";
    this.img2c(tinted(tex.circle, [255, 242, 179]), 330, 740, 90, 90);
    ctx.globalCompositeOperation = "source-over";
    this.img2(this.seaImg, 0, 0, 390, 440);

    // teasers under wave line (z<=3: school 2, boat 2.5)
    for (const n of this.teasers) if (n.z <= 3) n.draw(ctx);

    // fish shadow (z2) + aura (z2.1)
    if (this.shadowAlpha > 0.01 && this.shadowXY) {
      const xs = this.shadowScale * this.shadowPop * (1 + 0.06 * Math.sin(this.t * 7));
      const ys = this.shadowScale * this.shadowPop;
      ctx.globalAlpha = Math.min(0.85, this.shadowAlpha);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(this.shadowXY.x, this.shadowXY.y, 35 * xs, 11 * ys, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // aura follows shadow
    if (this.aura.alpha > 0.01 && this.aura.mode > 0 && this.shadowAlpha > 0.05 && this.shadowXY) {
      const cols = [[255, 255, 255], [255, 255, 255], [255, 59, 48], [255, 204, 0], null];
      const col = this.aura.mode === 4
        ? hslToRgb(this.aura.hue, 0.95, 0.5) : cols[this.aura.mode];
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, this.shadowAlpha * (0.4 + 0.18 * Math.sin(this.t * 9))) * this.aura.alpha;
      this.img2c(tinted(tex.circle, col), this.shadowXY.x, this.shadowXY.y,
                 175 * this.shadowScale, 55 * this.shadowScale);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // wave line (z3)
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 3;
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, 440);
    for (let x = 0; x <= 390; x += 10) {
      const y = 440 + Math.sin(x * 0.03 + this.t * 2.2) * 5 + Math.sin(x * 0.011 + this.t * 1.3) * 3;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // water sparkles
    for (const s of this.sparkles) {
      const a = 0.4 + 0.3 * Math.sin(this.t * (Math.PI / s.dur) + s.ph);
      ctx.globalAlpha = Math.max(0.1, a);
      this.img2c(tex.circle, s.x, s.y, 6, 6);
    }
    ctx.globalAlpha = 1;

    // teasers z 4..11 (rainbow 4, birds 5, fishJump 9)
    for (const n of this.teasers) if (n.z > 3 && n.z < 12) n.draw(ctx);

    // rod (z6)
    ctx.save();
    ctx.translate(48, 95);
    ctx.rotate(this.rodRot);
    ctx.fillStyle = "rgb(89,51,26)";
    roundRect(ctx, -2.5, -55, 5, 110, 2); ctx.fill();
    ctx.restore();

    // line (z7)
    if (this.lineAlpha > 0.01) {
      ctx.globalAlpha = this.lineAlpha;
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.2;
      const sag = this.fightMode ? -6 : 10;
      ctx.beginPath();
      ctx.moveTo(ROD_TIP.x, ROD_TIP.y);
      ctx.quadraticCurveTo((ROD_TIP.x + this.bobberXY.x) / 2,
        Math.max(ROD_TIP.y, this.bobberXY.y) + sag, this.bobberXY.x, this.bobberXY.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // bobber (z8)
    if (this.bobberAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.bobberAlpha;
      ctx.translate(this.bobberXY.x, this.bobberXY.y);
      ctx.rotate(this.bobberTilt);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, -4, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e33";
      ctx.beginPath(); ctx.arc(0, 5, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#444";
      ctx.fillRect(-1, -18, 2, 12);
      ctx.restore();
    }

    // cloud tint (z12)
    if (this.cloudA > 0.01) {
      ctx.fillStyle = `rgba(64,64,64,${this.cloudA})`;
      ctx.fillRect(0, 0, W, H);
    }
    // rain tint (z13) — rain particles themselves are in emitters (z14)
    if (this.rainA > 0.01) {
      ctx.fillStyle = `rgba(38,51,77,${this.rainA})`;
      ctx.fillRect(0, 0, W, H);
    }

    // rush tint (z15, add)
    if (this.rushTintAlpha > 0.005) {
      const a = this.rushOn ? (0.10 + 0.06 * Math.sin(this.t * 4)) * (this.rushTintAlpha / 0.12) : this.rushTintAlpha;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,204,51,${Math.max(0, a)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }

    // speed lines (z18)
    if (this.speedLines.alpha > 0.01 && this.speedLines.mode > 0 && this.speedLines.beams) {
      const cols = [null, [255, 255, 255], [255, 59, 48], [255, 204, 0], null];
      ctx.save();
      ctx.translate(195, 430);
      ctx.rotate(this.speedLines.rot);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.speedLines.beams.length; i++) {
        const b = this.speedLines.beams[i];
        const cyc = (this.t + b.ph) % (b.dur + b.wait);
        if (cyc > b.dur) continue;
        const f = cyc / b.dur;
        const a = (f < 0.3 ? f / 0.3 : 1 - (f - 0.3) / 0.7) * b.peak * this.speedLines.alpha;
        const col = this.speedLines.mode === 4
          ? hslToRgb((this.speedLines.hue + i * 0.11) % 1, 0.85, 0.5)
          : cols[this.speedLines.mode];
        ctx.save();
        ctx.rotate(b.a);
        const r = b.r0 - b.travel * f;
        ctx.globalAlpha = a;
        ctx.drawImage(tinted(tex.beam, col), r - b.w, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }

    // fx nodes (z19-21: rings, pillar, lightning)
    for (const n of this.fxNodes) n.draw(ctx);

    // particle emitters (fxLayer ~z20-21)
    for (const e of this.emitters) e.draw(ctx);

    ctx.restore();
  }

  handleTap(x, y, wasMash) {
    if (wasMash) this.tapRipple(x, y);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
