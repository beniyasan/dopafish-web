// DOM UI — SwiftUI ContentView equivalent. All copy/layout ported 1:1.
import { Rarity, RARITY_LABEL, RARITY_COLOR, fishPool, secretFishPool,
         OLDMAN_HEAT, UPGRADES, UPGRADE_COSTS, BAIT, BAIT_SHOP, cardFXSpec } from "./data.js";
import { dex } from "./model.js";

const ASSET = (name) => `assets/${name}.webp`;
const el = (tag, cls, html) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  return d;
};

const BANNER_STYLE = {
  small:   { size: 26, fill: "#fff",                                             shadow: "rgba(0,0,0,.6)" },
  miss:    { size: 34, fill: "#999",                                             shadow: "rgba(0,0,0,.6)" },
  info:    { size: 34, fill: "#fff",                                             shadow: "rgba(0,0,0,.6)" },
  hot:     { size: 52, fill: "linear-gradient(#ffd60a,#ff3b30)",                  shadow: "#ff3b30" },
  gold:    { size: 56, fill: "linear-gradient(#fff,#ffd60a,#ff9500)",             shadow: "#ffd60a" },
  rush:    { size: 56, fill: "linear-gradient(#fff,#ffd60a,#ff9500)",             shadow: "#ffd60a" },
  rainbow: { size: 58, fill: "linear-gradient(90deg,#ff3b30,#ff9500,#ffd60a,#34c759,#007aff,#af52de)", shadow: "#af52de" },
};

export class UI {
  constructor(root, model, snd, haptics, scene) {
    this.model = model; this.snd = snd; this.haptics = haptics; this.scene = scene;
    this._c = {}; // change cache

    root.insertAdjacentHTML("beforeend", `
      <div id="vignette" class="hidden"></div>
      <div id="vignette-hot" class="hidden"></div>
      <div id="flash"></div>

      <div id="hud">
        <div class="hud-left">
          <div class="hud-label">SCORE</div>
          <div id="hud-score">0</div>
          <div id="hud-medals">🪙 0</div>
        </div>
        <div class="hud-right">
          <div id="hud-combo" class="hidden"></div>
          <div id="hud-best"></div>
          <div id="hud-maxcm"></div>
        </div>
        <div class="hud-center">
          <div id="hud-auto" class="hidden"></div>
          <div id="rush-hud" class="hidden"></div>
        </div>
      </div>

      <div id="prompt"></div>

      <div id="cast-zone" class="hidden">
        <div id="cast-btn">
          <svg viewBox="0 0 130 130" width="130" height="130">
            <circle cx="65" cy="65" r="59" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
            <circle id="charge-ring" cx="65" cy="65" r="59" fill="none" stroke="url(#chargeGrad)"
                    stroke-width="7" stroke-linecap="round" stroke-dasharray="370.7"
                    stroke-dashoffset="370.7" transform="rotate(-90 65 65)"/>
            <defs><linearGradient id="chargeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#00d5ff"/><stop offset="50%" stop-color="#ffd60a"/><stop offset="100%" stop-color="#ff3b30"/>
            </linearGradient></defs>
          </svg>
          <div class="cast-label"><span style="font-size:34px">🎣</span><span class="cast-text">CAST</span></div>
        </div>
        <div id="cast-side-r">
          <button id="btn-auto" class="pill">AUTO<span class="sub">OFF</span></button>
          <button id="btn-shop" class="pill dim">釣具<span class="sub">強化</span></button>
        </div>
        <div id="cast-side-l"><button id="btn-dex" class="pill dim">図鑑<span class="sub" id="dex-count">0/0</span></button>
          <div id="bait-tag" class="hidden"></div></div>
      </div>

      <div id="hook-cue" class="hidden"></div>
      <div id="hook-pop" class="hidden"></div>
      <div id="hook-gauge" class="hidden">
        <span class="gauge-label">合わせ</span>
        <div class="hook-bar"><div id="hook-fill"></div>
          <i style="left:30%"></i><i style="left:70%"></i></div>
        <span id="hook-lv">Lv0</span>
      </div>
      <div id="battle-gauge" class="hidden">
        <span class="gauge-label">糸</span><div class="gauge"><div id="gauge-fill"></div></div>
      </div>

      <div id="mash-meter" class="hidden">
        <div id="mash-left"></div>
        <div class="mash-bar"><div id="mash-fill"></div></div>
        <div id="mash-row"><span id="mash-count">0</span><span class="mash-cap">連打!</span><span id="mash-remain">0.0</span></div>
      </div>

      <div id="hold-meter" class="hidden">
        <div class="fight-label">テンション</div>
        <div class="hold-track"><div id="hold-zone"></div><div class="hold-red"></div><div id="hold-needle"></div></div>
        <div class="fight-bar"><div id="hold-fill"></div></div>
        <div class="fight-row"><span class="fight-cap" id="hold-cap">長押しで緑をキープ</span><span class="fight-remain" id="hold-remain">0.0</span></div>
      </div>

      <div id="rhythm-meter" class="hidden">
        <div class="rhythm-lane"><div class="rhythm-hit"></div><div id="rhythm-notes"></div></div>
        <div class="fight-bar"><div id="rhythm-fill"></div></div>
        <div class="fight-row"><span class="fight-cap">円に重なる瞬間にタップ</span><span class="fight-remain" id="rhythm-remain">0.0</span></div>
      </div>

      <div id="oldman-callout" class="hidden"></div>
      <div id="oldman-cutin" class="hidden"></div>
      <div id="banner" class="hidden"></div>
      <div id="reveal" class="hidden"></div>
      <div id="escape-card" class="hidden"></div>
      <div id="rush-end" class="hidden"></div>
      <div id="ending" class="hidden"></div>
      <div id="dex-overlay" class="hidden"></div>
      <div id="shop-overlay" class="hidden"></div>
      <div id="title" class="hidden">
        <div class="title-inner">
          <div class="title-main">DOPAGAKI</div>
          <div class="title-sub">Fishing Collection</div>
          <div class="title-note">大当たりでRUSH突入!<br>音量・脳汁注意</div>
          <div class="title-tap">TAP TO START</div>
        </div>
      </div>

      <div id="top-btns">
        <button id="btn-mute" class="icon-btn" aria-label="ミュート"></button>
        <button id="btn-haptics" class="icon-btn" aria-label="触覚"></button>
      </div>
    `);

    this.$ = (id) => document.getElementById(id);
    this._bind();
  }

  _bind() {
    const m = this.model;

    // CAST button: hold to charge
    const castBtn = this.$("cast-btn");
    castBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      castBtn.setPointerCapture(e.pointerId);
      m.pressCast();
    });
    const release = (e) => { e.stopPropagation(); m.releaseCast(); };
    castBtn.addEventListener("pointerup", release);
    castBtn.addEventListener("pointercancel", release);

    this.$("btn-auto").addEventListener("click", (e) => { e.stopPropagation(); this.snd.prepare(); m.toggleAuto(); });
    this.$("btn-dex").addEventListener("click", (e) => { e.stopPropagation(); this.showDex(); });
    this.$("btn-shop").addEventListener("click", (e) => { e.stopPropagation(); this.showShop(); });
    this.$("btn-mute").addEventListener("click", (e) => {
      e.stopPropagation(); this.snd.prepare();
      this.snd.muted = !this.snd.muted; this.snd.applyMute(); this._syncIcons();
    });
    this.$("btn-haptics").addEventListener("click", (e) => {
      e.stopPropagation();
      this.haptics.setEnabled(!this.haptics.enabled);
      if (this.haptics.enabled) this.haptics.play({ name: "bite" });
      this._syncIcons();
    });

    this.$("title").addEventListener("pointerdown", () => m.startGame());
    this.$("reveal").addEventListener("pointerdown", () => m.dismissReveal());
    this.$("escape-card").addEventListener("pointerdown", () => m.dismissEscape());
    this.$("rush-end").addEventListener("pointerdown", () => m.dismissRushSummary());
    this.$("ending").addEventListener("pointerdown", () => m.dismissEnding());

    // any other tap on the stage → model.tapScreen + mash ripple
    document.getElementById("app").addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("#cast-btn") ||
          e.target.closest("#dex-overlay") || e.target.closest("#shop-overlay") ||
          e.target.closest("#title") || e.target.closest("#reveal") ||
          e.target.closest("#escape-card") || e.target.closest("#rush-end") ||
          e.target.closest("#ending")) return;
      const r = document.getElementById("app").getBoundingClientRect();
      const x = (e.clientX - r.left) * 390 / r.width;
      const y = (e.clientY - r.top) * 844 / r.height;
      if (m.phase === "mash") {
        const w = this.scene.screenToWorld(x, y);
        this.scene.tapRipple(w.x, w.y);
      }
      m.tapScreen();
    });

    // 長押しファイト: どこで離しても解除
    const up = () => m.releaseScreen();
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);

    this._syncIcons();
  }

  _syncIcons() {
    this.$("btn-mute").textContent = this.snd.muted ? "🔇" : "🔊";
    this.$("btn-haptics").textContent = this.haptics.enabled ? "📳" : "📴";
  }

  // ---------- overlays ----------

  showDex() {
    const o = this.$("dex-overlay");
    const sections = [["N — 小物", 0], ["R — 並", 1], ["SR — 大物", 2], ["SSR — 超大物", 3], ["UR — 激レア", 4], ["LR — 伝説", 5]];
    let rows = "";
    for (const [title, r] of sections) {
      rows += `<div class="dex-sec" style="color:${RARITY_COLOR[r]}">${title}</div>`;
      for (const f of fishPool[r]) rows += this._dexRow(f, r, false);
    }
    rows += `<div class="dex-sec secret-sec">??? — 幻</div>`;
    if (!this.model.endingSeen && dex.caughtSecrets === 0) {
      rows += `<div class="dex-secret-note">まだ見ぬ魚がいるという噂がある…</div>`;
    } else {
      // ED後は黒塗りの枠で存在だけ見せる
      for (const f of secretFishPool) rows += this._dexRow(f, 5, true);
      if (dex.caughtSecrets < secretFishPool.length) {
        rows += `<div class="dex-secret-note">金の竿を極めし者の前にのみ現れる…</div>`;
      }
    }
    o.innerHTML = `
      <div class="overlay-bg" data-close></div>
      <div class="overlay-panel dex-panel">
        <div class="overlay-head">
          <span class="overlay-title">📖 魚図鑑</span>
          <button class="close-btn" data-close>✕</button>
        </div>
        <div class="dex-progress">
          <span>捕獲 ${dex.caughtSpecies} / ${dex.totalSpecies} 種</span>
          ${dex.isComplete ? '<span class="complete">🏆 コンプリート!!</span>' : ""}
        </div>
        ${dex.isComplete ? '<button class="ed-replay" data-replay>🎬 ED再生</button>' : ""}
        <div class="dex-bar"><div style="width:${100 * dex.caughtSpecies / Math.max(1, dex.totalSpecies)}%"></div></div>
        <div class="dex-list">${rows}</div>
      </div>`;
    o.classList.remove("hidden"); o.classList.add("show");
    o.querySelectorAll("[data-close]").forEach((n) =>
      n.addEventListener("pointerdown", () => o.classList.remove("show")));
    o.querySelector("[data-replay]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      o.classList.remove("show");
      this.model.replayEnding();
    });
  }

  _dexRow(f, r, secret) {
    const e = dex.entry(f.name);
    const caught = e.count > 0;
    return `<div class="dex-row ${caught ? "caught" : ""}" style="${caught ? `border:1px solid ${RARITY_COLOR[r]}73` : ""}">
      <div class="dex-thumb">${caught ? `<img src="${ASSET(f.img)}" alt="${f.name}">`
        : secret ? `<img class="sil" src="${ASSET(f.img)}" alt="">` : "?"}</div>
      <div class="dex-info">
        <div class="dex-name">${caught ? f.name : "？？？"}${secret ? '<span class="secret-badge">幻</span>' : ""}</div>
        <div class="dex-cm">${caught ? `最大 ${e.maxCm}cm` : "未捕獲"}</div>
      </div>
      ${caught ? `<div class="dex-count">×${e.count}</div>` : ""}
    </div>`;
  }

  showShop() {
    const m = this.model, o = this.$("shop-overlay");
    const rows = UPGRADES.map((u, i) => {
      const lv = m.level(i), cost = m.nextCost(i);
      const canBuy = cost !== null && m.medals >= cost;
      const pips = Array.from({ length: UPGRADE_COSTS.length }, (_, j) =>
        `<span class="pip ${j < lv ? "on" : ""}"></span>`).join("");
      return `<div class="shop-row" data-buy="${i}">
        <div class="shop-icon">${u.icon}</div>
        <div class="shop-info">
          <div class="shop-name">${u.title} <span class="pips">${pips}</span></div>
          <div class="shop-eff">${u.effect}</div>
        </div>
        <button class="buy ${canBuy ? "can" : ""}" ${cost === null || !canBuy ? "disabled" : ""}>
          ${cost === null ? "MAX" : `🪙${cost}`}</button>
      </div>`;
    }).join("");
    const baitRows = BAIT_SHOP.map((b, i) => {
      const canBuy = m.medals >= b.cost;
      return `<div class="shop-row" data-bait="${i}">
        <div class="shop-icon"><img class="bait-img" src="${ASSET(b.img)}" alt=""></div>
        <div class="shop-info">
          <div class="shop-name">${b.name}</div>
          <div class="shop-eff">${BAIT[b.grade].effect}${m.bait ? ` ・ 今の餌(${m.bait.name})と交換` : ""}</div>
        </div>
        <button class="buy ${canBuy ? "can" : ""}" ${canBuy ? "" : "disabled"}>🪙${b.cost}</button>
      </div>`;
    }).join("");
    o.innerHTML = `
      <div class="overlay-bg" data-close></div>
      <div class="overlay-panel shop-panel">
        <div class="overlay-head">
          <span class="overlay-title">🛒 釣具屋</span>
          <button class="close-btn" data-close>✕</button>
        </div>
        <div class="shop-medals">🪙 ${m.medals}</div>
        ${rows}
        <div class="shop-note">強化はずっと続く。釣って稼いで強くしよう</div>
        <div class="shop-sec">🐟 活き餌 <small>次の1投だけ大物率UP・1つまで</small></div>
        ${baitRows}
      </div>`;
    o.classList.remove("hidden"); o.classList.add("show");
    o.querySelectorAll("[data-close]").forEach((n) =>
      n.addEventListener("pointerdown", () => o.classList.remove("show")));
    o.querySelectorAll("[data-bait]").forEach((row) => {
      row.querySelector(".buy")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (m.buyBait(+row.dataset.bait)) this.showShop();
      });
    });
    o.querySelectorAll("[data-buy]").forEach((row) => {
      row.querySelector(".buy")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = +row.dataset.buy;
        if (m.buyUpgrade(i)) {
          row.classList.add("bought");
          this.showShop(); // refresh levels/costs
        }
      });
    });
  }

  // ---------- per-frame ----------

  update() {
    const m = this.model, c = this._c, $ = this.$;

    if (c.score !== m.score) { $("hud-score").textContent = m.score; c.score = m.score; }
    if (c.medals !== m.medals) { $("hud-medals").textContent = `🪙 ${m.medals}`; c.medals = m.medals; }
    if (c.combo !== m.combo) {
      $("hud-combo").textContent = `COMBO ×${m.combo}`;
      $("hud-combo").classList.toggle("hidden", m.combo <= 1);
      c.combo = m.combo;
    }
    if (c.best !== m.bestScore) { $("hud-best").textContent = `BEST ${m.bestScore}`; c.best = m.bestScore; }
    if (c.bestCm !== m.bestCm) {
      $("hud-maxcm").textContent = m.bestCm > 0 ? `最大 ${m.bestCm}cm` : "";
      c.bestCm = m.bestCm;
    }
    if (c.auto !== m.autoCast || c.autoPower !== Math.round(m.autoPower * 100)) {
      c.auto = m.autoCast; c.autoPower = Math.round(m.autoPower * 100);
      $("hud-auto").classList.toggle("hidden", !m.autoCast);
      $("hud-auto").textContent = `⚡ AUTO 強さ${c.autoPower}%`;
      const b = $("btn-auto");
      b.className = `pill ${m.autoCast ? "on" : "dim"}`;
      b.innerHTML = `AUTO<span class="sub">${m.autoCast ? `強さ${c.autoPower}%` : "OFF"}</span>`;
    }

    // 活き餌
    const baitKey = m.bait ? `${m.bait.name}:${m.rushActive}` : null;
    if (c.bait !== baitKey) {
      c.bait = baitKey;
      const t = $("bait-tag");
      t.className = m.bait ? "pill on" : "hidden";
      if (m.bait) t.innerHTML = `🐟餌<span class="sub">${m.rushActive ? "RUSH後" : "次の1投"}</span>`;
    }

    // rush HUD
    const rushOn = m.rushActive;
    if (c.rushOn !== rushOn || c.rushLeft !== m.rushLeft) {
      c.rushOn = rushOn; c.rushLeft = m.rushLeft;
      const h = $("rush-hud");
      h.classList.toggle("hidden", !rushOn);
      if (rushOn) {
        const s = m.rushStatus;
        h.className = s.isUrgent ? "urgent" : "";
        h.innerHTML = `
          <div class="rush-line">
            <span class="rush-heading ${s.isUrgent ? "" : "gold"}">${s.heading}</span>
            ${s.isLast ? `<span class="rush-last">最終回転</span>`
              : `<span class="rush-remain"><small>残り</small><b>${s.remaining}</b><small>回転</small></span>`}
          </div>
          <div class="rush-hint">${s.hint}</div>
          <div class="rush-prob">上乗せ抽選 ${(m.rushBonusProbability * 100).toFixed(1)}% / 投</div>
          <div class="rush-note">当選後の連打成功が必要</div>`;
      }
    }

    // prompt
    if (c.prompt !== m.prompt || c.promptHot !== m.promptHot) {
      c.prompt = m.prompt; c.promptHot = m.promptHot;
      const p = $("prompt");
      p.textContent = m.prompt;
      p.classList.toggle("hot", !!m.promptHot);
      p.style.opacity = m.prompt ? 1 : 0;
    }

    // phase-driven widgets
    const phaseChanged = c.phase !== m.phase;
    c.phase = m.phase;
    if (phaseChanged) {
      const casting = m.phase === "idle" || m.phase === "charging";
      $("cast-zone").classList.toggle("hidden", !casting);
      $("prompt").classList.toggle("above-cast", casting); // CASTボタンと重ならないよう上へ
      $("battle-gauge").classList.toggle("hidden", m.phase !== "reach");
      $("hook-gauge").classList.toggle("hidden", m.phase !== "reach");
      if (m.phase !== "reach") $("hook-cue").className = "hidden";
    }
    const fightKey = m.phase === "mash" ? m.fightType : null;
    if (c.fightKey !== fightKey) {
      c.fightKey = fightKey;
      $("mash-meter").classList.toggle("hidden", fightKey !== "mash");
      $("hold-meter").classList.toggle("hidden", fightKey !== "hold");
      $("rhythm-meter").classList.toggle("hidden", fightKey !== "rhythm");
      if (fightKey === "hold") {
        const [lo, hi] = m.holdZone;
        Object.assign($("hold-zone").style, { left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` });
      }
      if (fightKey === "rhythm") {
        $("rhythm-notes").innerHTML = m.rhythmNotes.map((n) => `<i data-n="${n.id}"></i>`).join("");
      }
    }
    if (phaseChanged) {
      $("title").classList.toggle("hidden", m.phase !== "title");
      const inBattle = m.phase === "reach" || m.phase === "mash";
      $("vignette").classList.toggle("hidden", !inBattle);
      const hot = (m.phase === "reach" && m.reachKind >= 2) || m.phase === "mash";
      $("vignette-hot").classList.toggle("hidden", !hot);
      $("dex-count").textContent = `${dex.caughtSpecies}/${dex.totalSpecies}`;
    }

    // charge ring
    if (m.phase === "charging" || c.charge !== m.chargePower) {
      c.charge = m.chargePower;
      $("charge-ring").style.strokeDashoffset = 370.7 * (1 - m.chargePower);
    }

    // battle gauge
    if (m.phase === "reach") {
      const t = Math.min(1, m.tension);
      const f = $("gauge-fill");
      f.style.width = `${t * 100}%`;
      f.style.background = t > 0.85 ? "#ff3b30" : t > 0.6 ? "#ff9500" : "#34c759";
      f.style.boxShadow = t > 0.85 ? "0 0 6px #ff3b30" : "none";
    }

    // 合わせ: 予告リング(ウキに追従) / 判定ポップ / ゲージ
    if (m.phase === "reach") {
      const l = m.hookLunge, cue = $("hook-cue");
      if (c.hookCue !== l?.id) {
        c.hookCue = l?.id;
        if (l) {
          cue.className = "";
          cue.style.setProperty("--lead", `${l.at - l.cueAt}s`);
          cue.innerHTML = `<div class="hc-target"></div><div class="hc-ring"></div>`;
        } else cue.className = "hidden";
      }
      if (l) {
        const b = this.scene.bobberXY, p = this.scene.worldToScreen(b.x, b.y);
        cue.style.transform = `translate(${p.x}px, ${p.y}px)`;
        if (l.judged || m.now > l.at + 0.4) cue.className = "done";
      }
      if (c.hookGauge !== m.hookGauge) {
        c.hookGauge = m.hookGauge;
        $("hook-fill").style.width = `${m.hookGauge * 100}%`;
        const lv = m.hookLevel;
        $("hook-lv").textContent = `Lv${lv}`;
        $("hook-gauge").dataset.lv = lv;
      }
    }
    if (c.hookPop !== m.hookPop?.id) {
      c.hookPop = m.hookPop?.id;
      const hp = $("hook-pop");
      if (m.hookPop) {
        hp.className = `show ${m.hookPop.kind}`;
        hp.textContent = m.hookPop.text;
        void hp.offsetWidth;
      } else hp.className = "hidden";
    }

    // 長押しメーター
    if (fightKey === "hold") {
      const t = Math.min(1, m.holdTension), [lo, hi] = m.holdZone;
      const st = t > hi ? "over" : t >= lo ? "ok" : "under";
      const nd = $("hold-needle");
      nd.style.left = `${t * 100}%`;
      nd.className = st;
      $("hold-fill").style.width = `${Math.min(1, m.fightProg) * 100}%`;
      $("hold-remain").textContent = m.mashRemain.toFixed(1);
      if (c.holdSt !== st) {
        c.holdSt = st;
        $("hold-cap").textContent = st === "over" ? "緩めて!! 糸が切れる!" : st === "ok" ? "そのままキープ!" : "長押しで巻け!";
        $("hold-cap").className = `fight-cap ${st}`;
      }
    }
    // リズムレーン: ノーツは判定円(左)へ 200px/秒 で流れる
    if (fightKey === "rhythm") {
      for (const n of m.rhythmNotes) {
        const el = $("rhythm-notes").querySelector(`[data-n="${n.id}"]`);
        if (!el) continue;
        const x = 36 + (n.t - m.now) * 200;
        el.style.transform = `translateX(${x}px)`;
        el.className = n.judged ?? (x < 360 ? "on" : "");
      }
      $("rhythm-fill").style.width = `${Math.min(1, m.fightProg) * 100}%`;
      $("rhythm-remain").textContent = m.mashRemain.toFixed(1);
    }

    // mash meter
    if (fightKey === "mash") {
      $("mash-fill").style.width = `${Math.max(0, Math.min(1, m.mashFill)) * 100}%`;
      if (c.mashCount !== m.mashCount) { $("mash-count").textContent = m.mashCount; c.mashCount = m.mashCount; }
      $("mash-remain").textContent = m.mashRemain.toFixed(1);
      const left = m.mashTapsLeft ?? 0;
      const ml = $("mash-left");
      const showLeft = left >= 1 && left <= 5;
      if (c.mashLeft !== left || c.mashLeftShow !== showLeft) {
        c.mashLeft = left; c.mashLeftShow = showLeft;
        ml.textContent = `あと${left}回!!`;
        ml.style.opacity = showLeft ? 1 : 0;
      }
    }

    // flash
    if (c.flash !== m.flash) {
      c.flash = m.flash;
      const f = $("flash");
      if (m.flash) {
        const [r, g, b] = m.flash.color;
        f.style.background = `rgba(${r},${g},${b},${m.flash.opacity})`;
        f.classList.add("on");
      } else f.classList.remove("on");
    }

    // banner
    if (c.bannerId !== m.banner?.id) {
      c.bannerId = m.banner?.id;
      const b = $("banner");
      if (m.banner) {
        const s = BANNER_STYLE[m.banner.style] || BANNER_STYLE.info;
        b.className = "show";
        b.innerHTML = `<div class="banner-text" style="font-size:${s.size}px;background-image:${s.fill};text-shadow:0 0 14px ${s.shadow}">${m.banner.text}</div>`
          + (m.banner.sub ? `<div class="banner-sub" style="font-size:${Math.round(s.size * 0.45)}px">${m.banner.sub}</div>` : "");
        void b.offsetWidth; // restart animation
      } else b.className = "hidden";
    }

    // old man
    if (c.oldman !== m.oldManCue?.id) {
      c.oldman = m.oldManCue?.id;
      const cue = m.oldManCue;
      const callout = $("oldman-callout"), cutin = $("oldman-cutin");
      if (!cue) { callout.className = "hidden"; cutin.className = "hidden"; }
      else if (!OLDMAN_HEAT[cue.heat].isCutIn) {
        cutin.className = "hidden";
        callout.className = "show";
        const warm = cue.heat === "warm";
        callout.innerHTML = `
          <img class="om-img" src="${ASSET("OldManNormal")}" alt="">
          <div class="om-bubble ${warm ? "warm" : ""}">
            <div class="om-title">常連のおじさん</div>
            <div class="om-line">${cue.line}</div>
          </div>`;
      } else {
        callout.className = "hidden";
        cutin.className = "show";
        const premium = cue.heat === "premium";
        cutin.innerHTML = `
          <div class="om-cut ${premium ? "premium" : "hot"}">
            <div class="om-cut-lines"></div>
            <img class="om-cut-img" src="${ASSET("OldManHot")}" alt="">
            <div class="om-cut-text">
              <span class="om-cut-tag">${premium ? "伝説の気配" : "大物の予感"}</span>
              <div class="om-cut-line">${cue.line}</div>
              <div class="om-cut-name">常連のおじさん</div>
            </div>
            <div class="om-cut-edge top"></div><div class="om-cut-edge bottom"></div>
          </div>`;
      }
    }

    // ending
    const endKey = m.ending ? `${m.ending.id}:${m.ending.teaserAt}` : null;
    if (c.endKey !== endKey) {
      c.endKey = endKey;
      this._renderEnding(m.ending);
    }

    // reveal card
    if (c.reveal !== m.reveal) {
      c.reveal = m.reveal;
      this._renderReveal(m.reveal);
    }

    // escape card
    if (c.esc !== m.escapeReport?.id) {
      c.esc = m.escapeReport?.id;
      this._renderEscape(m.escapeReport);
    }

    // rush end
    if (c.rushSum !== m.rushSummary?.id) {
      c.rushSum = m.rushSummary?.id;
      const e = $("rush-end");
      if (m.rushSummary) {
        e.className = "show";
        e.innerHTML = `
          <div class="rush-end-card">
            <div class="rush-end-title">RUSH FINISH</div>
            <div class="rush-end-sub">RUSH終了</div>
            <div class="rush-end-stats">
              <div><div class="stat">${m.rushSummary.casts}</div><div class="stat-label">消化回転</div></div>
              <div><div class="stat">+${m.rushSummary.score}</div><div class="stat-label">RUSH獲得pt</div></div>
            </div>
            <button class="rush-end-btn">通常モードへ</button>
            <div class="rush-end-note">まもなく通常モードへ戻ります</div>
          </div>`;
      } else e.className = "hidden";
    }
  }

  // ---------- reveal card ----------

  _renderReveal(r) {
    const o = this.$("reveal");
    if (!r) { o.className = "hidden"; o.innerHTML = ""; return; }
    const spec = cardFXSpec(r);
    const label = RARITY_LABEL[r.rarity];
    const fx = this._cardFX(spec);

    o.className = "show";
    o.innerHTML = `
      <div class="reveal-dim" style="opacity:${spec.dimOpacity}"></div>
      ${fx}
      <div class="reveal-scroll">
        <div class="reveal-card tier${spec.tier} ${spec.hueCycle ? "huecycle" : ""} ${r.isNew ? "is-new" : ""}"
             style="--accent:${spec.accent};--entry-scale:${spec.entryScale};--entry-spin:${spec.entrySpin}deg;--entry-delay:${spec.entryDelay}s">
          <div class="rarity ${spec.labelPulse ? "pulse" : ""}"
               style="${spec.hueCycle
                 ? "background-image:linear-gradient(90deg,#ff3b30,#ff9500,#ffd60a,#34c759,#007aff,#af52de)"
                 : `color:${spec.accent}`};text-shadow:0 0 16px ${spec.accent}">${label}</div>
          ${r.isSecret ? '<div class="secret-label">✦ シークレット!! ✦</div>' : ""}
          ${r.isNew ? `
          <div class="new-art">
            <div class="new-burst"></div>
            <img class="fish-art" src="${ASSET(r.img)}" alt="${r.name}">
            <div class="new-q">？</div>
            <div class="new-stamp">図鑑<br>NEW!</div>
          </div>
          <div class="new-dex-line">📖 図鑑に新登録!  ${dex.caughtSpecies} / ${dex.totalSpecies} 種</div>`
          : `<img class="fish-art" src="${ASSET(r.img)}" alt="${r.name}">`}
          ${r.isSmall ? '<div class="small-note">…実は小物だった</div>' : ""}
          <div class="fish-name">${r.name}</div>
          <div class="fish-cm">${r.cm} cm</div>
          ${r.isRecord ? '<div class="new-record">✨ NEW RECORD! ✨</div>' : ""}
          ${r.perfect ? '<div class="perfect-note">PERFECT BONUS ×1.5</div>' : ""}
          ${r.baitable ? `
          <div class="bait-choice">
            <button class="bc cash" data-choice="cash">💰 換金<span>+${r.score}pt 🪙+${r.medals}</span></button>
            <button class="bc bait" data-choice="bait">🎣 餌にする<span>${BAIT[r.rarity].effect}</span></button>
          </div>
          <div class="tap-note">${this.model.bait ? `※餌にすると今の${this.model.bait.name}と交換` : "カードをタップでも換金"}</div>`
          : `<div class="fish-pt">+${r.score} pt   🪙+${r.medals}</div>
          ${r.rushGain > 0 ? `<div class="rush-gain">RUSH +${r.rushGain} 回転!!</div>` : ""}
          ${r.rushMissed ? `<div class="rush-missed">RUSH突入ならず…(UR突入率 1/4)</div>` : ""}
          <div class="tap-note">タップで続く</div>`}
        </div>
      </div>`;
    o.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        this.model.dismissReveal(btn.dataset.choice);
      }));
  }

  _cardFX(spec) {
    let rays = "", sparkles = "", rings = "";
    for (let i = 0; i < spec.rayCount; i++) {
      rays += `<div class="ray ${spec.rayRainbow ? "rainbow" : ""}" style="transform:rotate(${360 * i / spec.rayCount}deg);animation-duration:${spec.raySpeed / 10}s;--accent:${spec.accent}"></div>`;
    }
    if (spec.rayCount) rays = `<div class="rays">${rays}</div>`;
    for (let i = 0; i < spec.sparkleCount; i++) {
      sparkles += `<div class="spark" style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;
        animation-delay:${Math.random() * 1.6}s;animation-duration:${0.7 + Math.random() * 0.9}s"></div>`;
    }
    if (spec.sparkleCount) sparkles = `<div class="sparks">${sparkles}</div>`;
    for (let i = 0; i < spec.ringCount; i++) {
      rings += `<div class="ring" style="animation-delay:${i * 0.5}s;--accent:${spec.accent}"></div>`;
    }
    if (spec.ringCount) rings = `<div class="rings">${rings}</div>`;
    return `${rays}${sparkles}${rings}
      ${spec.entryFlash ? '<div class="entry-flash"></div>' : ""}
      ${spec.entryShine ? `<div class="shine" style="animation-duration:${spec.shinePeriod || 0.001}s"></div>` : ""}`;
  }

  // ---------- 通常ED ----------

  _renderEnding(e) {
    const o = this.$("ending");
    if (!e) { o.className = "hidden"; o.innerHTML = ""; return; }
    const all = fishPool.flatMap((pool, r) => pool.map((f) => ({ f, r })));
    const roll = all.map(({ f, r }) => `
      <div class="end-fish">
        <img src="${ASSET(f.img)}" alt="">
        <div><span class="end-rar" style="color:${RARITY_COLOR[r]}">${RARITY_LABEL[r]}</span>
             <span class="end-name">${f.name}</span></div>
      </div>`).join("");
    const left = secretFishPool.length - dex.caughtSecrets;
    const sils = secretFishPool.map((f, i) => {
      const caught = dex.entry(f.name).count > 0;
      return `<img class="end-sil ${caught ? "caught" : ""}" style="animation-delay:calc(var(--t0) + ${0.3 + i * 0.35}s)" src="${ASSET(f.img)}" alt="">`;
    }).join("");
    o.className = `show ${e.skipped ? "skipped" : ""}`;
    o.innerHTML = `
      <div class="end-bg"></div>
      ${e.skipped ? "" : `
      <div class="end-title"><div class="end-main">図鑑コンプリート!!</div>
        <div class="end-sub">全${all.length}種 制覇</div></div>
      <div class="end-roll"><div class="end-roll-inner">
        <div class="end-roll-head">— 釣り上げた魚たち —</div>${roll}</div></div>
      <div class="end-theend">THE END</div>
      <div class="end-skip">タップでスキップ</div>`}
      <div class="end-teaser">
        <div class="end-sils">${sils}</div>
        ${left > 0
          ? `<div class="end-tease-line">…まだ見ぬ魚が、あと${left}匹いるらしい</div>
             <div class="end-tease-hint">金の竿を極めし者の前にのみ現れる</div>`
          : `<div class="end-tease-line">幻の魚も、すべて釣り上げた!</div>`}
        <div class="end-tap">タップで閉じる</div>
      </div>`;
  }

  // ---------- escape card ----------

  _renderEscape(rep) {
    const o = this.$("escape-card");
    if (!rep) { o.className = "hidden"; o.innerHTML = ""; return; }
    const k = rep.kind;
    const near = rep.isNearMiss;
    let silhouette, details, border;
    if (k.type === "lineBreak") {
      border = near ? "#ff3b30" : RARITY_COLOR[k.rarity] + "b3";
      const disc = k.discovered;
      silhouette = `
        <div class="esc-sil">
          <img src="${ASSET(k.img)}" class="${disc ? "sil-known" : "sil-unknown"}" alt="">
          ${disc ? "" : '<div class="sil-q">？</div>'}
        </div>`;
      details = `
        <div class="esc-details">
          <span class="esc-rarity" style="background:${RARITY_COLOR[k.rarity]}">${RARITY_LABEL[k.rarity]}級</span>
          <span class="esc-name">${rep.displayName}</span>
          <span class="esc-cm">推定${k.cm}cm</span>
        </div>
        ${rep.isUndiscovered ? '<div class="esc-undiscovered">図鑑未登録の魚だった…</div>' : ""}
        <div class="esc-progress">
          <div class="esc-bar"><div style="width:${rep.progress * 100}%"></div></div>
          <div class="esc-taps">${rep.fight === "mash" ? `連打 ${Math.floor(rep.progress * 100)}%・あと${rep.tapsShort}回`
            : `引き寄せ ${Math.floor(rep.progress * 100)}%`}</div>
        </div>`;
    } else {
      border = "rgba(153,153,153,.5)";
      silhouette = `<div class="esc-sil bluff"><div class="bluff-fish">🐟</div></div>`;
      details = `<div class="esc-bluff-note">大物の影は消えた…</div>`;
    }
    o.className = "show";
    o.innerHTML = `
      <div class="esc-card ${near ? "near" : ""}" style="border-color:${border}">
        <div class="esc-headline ${near ? "near" : ""}">${rep.headline}</div>
        <div class="esc-subline">${rep.subline}</div>
        ${silhouette}
        ${details}
        <div class="esc-tap">タップで次へ</div>
      </div>`;
  }
}
