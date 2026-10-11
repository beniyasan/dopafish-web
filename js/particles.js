// Texture prerender + particle system — Canvas 2D equivalents of GameScene's SKTexture/SKEmitterNode.
// All coordinates use the SpriteKit convention: 390x844 world, y grows UP (transform applied by scene).

function makeTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  // canvas y is down; our art is symmetric enough that drawing in canvas space is fine
  draw(ctx, w, h);
  return c;
}

function rgb(c) { return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
function rgba(c, a) { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }

export const tex = {};

export function buildTextures() {
  tex.circle = makeTex(32, 32, (ctx, s) => {
    const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  tex.star = makeTex(48, 48, (ctx, s) => {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    const c = s / 2;
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? s * 0.48 : s * 0.14;
      const a = i * Math.PI / 4 - Math.PI / 2;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  });
  tex.coin = makeTex(40, 40, (ctx, s) => {
    ctx.fillStyle = "rgb(255,209,38)";
    ctx.beginPath(); ctx.arc(s/2, s/2, s/2 - 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgb(191,128,13)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s/2, s/2, s/2 - 6, 0, Math.PI * 2); ctx.stroke();
  });
  tex.beam = makeTex(32, 32, (ctx, s) => {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(s/2, s/2, s/2, s * 0.26, 0, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.62, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.restore();
  });
  tex.pillar = makeTex(64, 128, (ctx) => {
    // horizontal gradient alpha mask, then vertical alpha ramp
    const g1 = ctx.createLinearGradient(0, 0, 64, 0);
    g1.addColorStop(0, "rgba(255,255,255,0)");
    g1.addColorStop(0.3, "rgba(255,255,255,1)");
    g1.addColorStop(0.7, "rgba(255,255,255,1)");
    g1.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g1; ctx.fillRect(0, 0, 64, 128);
    ctx.globalCompositeOperation = "destination-in";
    const g2 = ctx.createLinearGradient(0, 0, 0, 128);
    g2.addColorStop(0, "rgba(255,255,255,0.25)"); // top fades out
    g2.addColorStop(0.3, "rgba(255,255,255,1)");
    g2.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = g2; ctx.fillRect(0, 0, 64, 128);
  });
  tex.rect = makeTex(12, 7, (ctx) => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 12, 7); });
}

// ---- tinted sprite cache ----
const tintCache = new Map();
export function tinted(image, color) {
  const key = `${image.width}x${image.height}:${color[0]},${color[1]},${color[2]}`;
  let c = tintCache.get(key);
  if (c && c.src === image) return c;
  c = makeTex(image.width, image.height, (ctx) => {
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = rgb(color);
    ctx.fillRect(0, 0, image.width, image.height);
  });
  c.src = image;
  tintCache.set(key, c);
  return c;
}

// ---- particles ----
// cfg mirrors SKEmitterNode fields used by the app:
// { image, count, color, speed, life, scale, spread, angle, blend("alpha"|"add"),
//   range:{dx,dy}, rotSpeed, rotRange, yScale, alphaSpeed, scaleSpeed, rate, duration }
export class Emitter {
  constructor(cfg, x, y) {
    this.cfg = cfg;
    this.x = x; this.y = y;
    this.age = 0;
    this.remaining = cfg.count ?? -1;        // finite burst count, or -1 = unlimited while rate>0
    this.rate = cfg.rate ?? 0;               // continuous spawn/sec
    this.budget = 0;
    this.alive = true;
    this.particles = [];
    this.duration = cfg.duration ?? Infinity; // how long emission lasts
    this.ttl = cfg.ttl ?? (cfg.life + 0.5);   // how long the emitter object lives
  }
  spawnOne() {
    const c = this.cfg;
    // SKEmitterNode: range fields are FULL ranges, value uniform in ±range/2
    const ang = c.angle + (Math.random() - 0.5) * c.spread;
    const sp = c.speed + (Math.random() - 0.5) * (c.speedRange ?? c.speed * 0.5);
    const life = c.life + (Math.random() - 0.5) * (c.lifeRange ?? c.life * 0.4);
    const sc = c.scale + (Math.random() - 0.5) * (c.scaleRange ?? c.scale * 0.6);
    this.particles.push({
      x: this.x + (Math.random() - 0.5) * (c.range?.dx ?? 0),
      y: this.y + (Math.random() - 0.5) * (c.range?.dy ?? 0),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      age: 0, life: Math.max(0.05, life),
      scale: Math.max(0.02, sc),
      rot: c.rotRange ? (Math.random() - 0.5) * c.rotRange : 0,
      rotV: (c.rotSpeed ?? 0) * (0.6 + Math.random() * 0.8),
    });
  }
  update(dt) {
    this.age += dt;
    if (this.age < this.duration) {
      if (this.rate > 0) {
        this.budget += this.rate * dt;
        while (this.budget >= 1 && (this.remaining > 0 || this.remaining === -1)) {
          this.spawnOne();
          this.budget -= 1;
          if (this.remaining > 0) this.remaining -= 1;
        }
      } else {
        while (this.remaining > 0) { this.spawnOne(); this.remaining -= 1; }
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.rotV * dt;
      p.scale += (this.cfg.scaleSpeed ?? -this.cfg.scale * 0.4) * dt;
      if (p.scale < 0.01) p.scale = 0.01;
    }
    if (this.age >= this.ttl && this.particles.length === 0) this.alive = false;
    if (this.age >= this.ttl + Math.max(1, this.cfg.life)) this.alive = false;
  }
  draw(ctx) {
    const c = this.cfg;
    ctx.globalCompositeOperation = c.blend === "add" ? "lighter" : "source-over";
    const img = c.color ? tinted(c.image, c.color) : c.image;
    for (const p of this.particles) {
      const f = p.age / p.life;
      let a = 1 + (c.alphaSpeed ?? -1 / c.life) * p.age;
      a = Math.max(0, Math.min(1, a)) * (c.alpha ?? 1);
      ctx.globalAlpha = a;
      const w = img.width * p.scale * (c.yScaleX ?? 1);
      const h = img.height * p.scale * (c.yScale ?? 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, -1); // ctx space is y-up world; un-mirror the sprite itself
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  get isDead() {
    // count-bursts die once their finite spawn is exhausted and all particles faded;
    // rate emitters go via alive=false (ttl) in update()
    return !this.alive
      || (this.remaining === 0 && this.particles.length === 0 && this.age > 0.1);
  }
}

export { rgb, rgba };
