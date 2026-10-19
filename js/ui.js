// DOM UI — SwiftUI ContentView equivalent. All copy/layout ported 1:1.
import { Rarity, RARITY_LABEL, RARITY_COLOR, fishPool, secretFishPool,
         OLDMAN_HEAT, UPGRADES, UPGRADE_COSTS, BAIT, BAIT_SHOP, cardFXSpec,
         HOLD_COLORS, OMEN, DAY, WEATHER, SECRET_COND, NUSHI_POOL, GOLD_FILTER, OSU } from "./data.js";
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
    this.root = root;
    this._c = {}; // change cache

    root.insertAdjacentHTML("beforeend", `
      <div id="tod-tint"></div>
      <div id="sea-stage"></div>
      <div id="hot-tint"></div>
      <div id="fog-layer" class="hidden"></div>
      <div id="vignette" class="hidden"></div>
      <div id="vignette-hot" class="hidden"></div>
      <div id="flash"></div>
      <div id="rush-frame"></div>

      <div id="hold-row" class="hidden"><span class="hold-label">保留</span><div id="hold-icons"></div></div>
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
          <div id="day-hud">
            <div id="day-line"></div>
            <div class="omen"><span>海の気配</span><div class="omen-bar"><div id="omen-fill"></div></div></div>
          </div>
          <div id="hud-auto" class="hidden"></div>
          <div id="rush-hud" class="hidden"></div>
        </div>
      </div>

      <div id="prompt"></div>

      <div id="cast-zone" class="hidden">
        <div id="cast-btn">
          <svg viewBox="0 0 130 130" width="130" height="130">
            <circle cx="65" cy="65" r="59" fill="rgba(0,24,70,.55)" stroke="rgba(255,255,255,.85)" stroke-width="3"/>
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
        <div class="fight-label" id="hold-label">テンション</div>
        <div class="hold-track"><div id="hold-zone"></div><div class="hold-red"></div><div id="hold-needle"></div></div>
        <div class="fight-bar"><div id="hold-fill"></div></div>
        <div class="fight-row"><span class="fight-cap" id="hold-cap">長押しで緑をキープ</span><span class="fight-remain" id="hold-remain">0.0</span></div>
      </div>

      <div id="osu-layer" class="hidden"><svg id="osu-svg" width="390" height="844"></svg><div id="osu-objs"></div></div>
      <div id="osu-meter" class="hidden">
        <div class="fight-bar"><div id="osu-fill"></div></div>
        <div class="fight-row"><span class="fight-cap" id="osu-cap">円を叩け!</span><span class="fight-remain" id="osu-remain">0.0</span></div>
      </div>

      <div id="rhythm-meter" class="hidden">
        <div class="rhythm-lane"><div class="rhythm-hit"></div><div id="rhythm-notes"></div></div>
        <div class="fight-bar"><div id="rhythm-fill"></div></div>
        <div class="fight-row"><span class="fight-cap">円に重なる瞬間にタップ</span><span class="fight-remain" id="rhythm-remain">0.0</span></div>
      </div>

      <div id="oldman-callout" class="hidden"></div>
      <div id="oldman-cutin" class="hidden"></div>
      <div id="cutin" class="hidden"></div>
      <div id="rush-cutin" class="hidden"></div>
      <div id="banner" class="hidden"></div>
      <div id="reveal" class="hidden"></div>
      <div id="escape-card" class="hidden"></div>
      <div id="rush-end" class="hidden"></div>
      <div id="ending" class="hidden"></div>
      <div id="day-end" class="hidden"></div>
      <div id="dex-overlay" class="hidden"></div>
      <div id="shop-overlay" class="hidden"></div>
      <div id="title" class="hidden">
        <div class="title-inner">
          <div class="title-main">DOPA</div>
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
    this.$("day-end").addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-day]");
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.day === "copy") this._copyDayResult(b);
      else m.startNewDay(b.dataset.day);
    });

    // any other tap on the stage → model.tapScreen + mash ripple
    document.getElementById("app").addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("#cast-btn") ||
          e.target.closest("#dex-overlay") || e.target.closest("#shop-overlay") ||
          e.target.closest("#title") || e.target.closest("#reveal") ||
          e.target.closest("#escape-card") || e.target.closest("#rush-end") ||
          e.target.closest("#ending") || e.target.closest("#day-end")) return;
      const { x, y } = this._stagePos(e);
      if (m.phase === "mash" && m.fightType === "osu") { m.osuDown(x, y); return; }
      if (m.phase === "mash") {
        const w = this.scene.screenToWorld(x, y);
        this.scene.tapRipple(w.x, w.y);
      }
      m.tapScreen();
    });

    // 長押しファイト: どこで離しても解除
    const up = () => { m.releaseScreen(); m.osuUp(); };
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    // osu! のスライダー・スピナーは指の動きを追う
    document.getElementById("app").addEventListener("pointermove", (e) => {
      if (m.phase === "mash" && m.fightType === "osu") { const p = this._stagePos(e); m.osuMove(p.x, p.y); }
    });

    this._syncIcons();
  }

  // 一定時間だけ出して消すカットイン(出し直すとアニメーションを頭から再生)
  _cutin(id, html, ms) {
    const el = this.$(id);
    el.innerHTML = html;
    el.className = "";
    void el.offsetWidth;
    el.className = "show";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = "hidden"; }, ms);
  }

  _stagePos(e) {
    const r = document.getElementById("app").getBoundingClientRect();
    return { x: (e.clientX - r.left) * 390 / r.width, y: (e.clientY - r.top) * 844 / r.height };
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
      for (const f of secretFishPool) rows += this._dexRow(f, 5, true, SECRET_COND[f.name]?.hint);
      if (dex.caughtSecrets < secretFishPool.length) {
        rows += `<div class="dex-secret-note">金の竿を極めし者の前にのみ現れる…</div>`;
      }
    }
    // ヌシ: 倒したもの / 戦闘中(体力表示) / まだ見ぬもの
    const ns = this.model.nushiState;
    rows += `<div class="dex-sec nushi-sec">ヌシ — ${Math.min(ns.idx, NUSHI_POOL.length)}/${NUSHI_POOL.length} 討伐</div>`;
    NUSHI_POOL.forEach((n, i) => {
      const beaten = i < ns.idx, current = i === ns.idx;
      const e = dex.entry(n.name);
      rows += `<div class="dex-row ${beaten ? "caught" : ""}" style="${beaten ? "border:1px solid #ff2d9673" : ""}">
        <div class="dex-thumb">${beaten || current
          ? `<img class="${beaten ? "" : "sil"}" src="${ASSET(n.img)}" alt="">` : "?"}</div>
        <div class="dex-info">
          <div class="dex-name">${beaten ? n.name : "？？？"}<span class="nushi-badge">主</span></div>
          <div class="dex-cm">${beaten ? `最大 ${e.maxCm}cm`
            : current ? `<span class="nushi-hp"><i style="width:${ns.hp * 100}%"></i></span> 残り体力 ${Math.round(ns.hp * 100)}%`
            : "まだ姿を見せていない"}</div>
        </div>
      </div>`;
    });
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
        <div class="dex-variants">
          <span class="vb gold on">金</span> 金色個体 ${dex.goldCount}/${dex.totalSpecies}
          <span class="vb crown on">👑</span> サイズ王冠 ${dex.crownCount}/${dex.totalSpecies}
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

  _dexRow(f, r, secret, hint) {
    const e = dex.entry(f.name);
    const caught = e.count > 0;
    return `<div class="dex-row ${caught ? "caught" : ""}" style="${caught ? `border:1px solid ${RARITY_COLOR[r]}73` : ""}">
      <div class="dex-thumb">${caught ? `<img src="${ASSET(f.img)}" alt="${f.name}">`
        : secret ? `<img class="sil" src="${ASSET(f.img)}" alt="">` : "?"}</div>
      <div class="dex-info">
        <div class="dex-name">${caught ? f.name : "？？？"}${secret ? '<span class="secret-badge">幻</span>' : ""}</div>
        <div class="dex-cm">${caught ? `最大 ${e.maxCm}cm` : hint ? `未捕獲・${hint}` : "未捕獲"}</div>
      </div>
      ${caught && !secret ? `<div class="dex-vars"><span class="vb gold ${e.gold ? "on" : ""}">金</span><span class="vb crown ${e.crown ? "on" : ""}">👑</span></div>` : ""}
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

    // スコアは一気に変えず、毎フレーム差の一部ずつ数え上げる(0.5秒ほどで追いつく)
    if (this._shownScore === undefined || m.score < this._shownScore) this._shownScore = m.score;
    if (this._shownScore !== m.score) this._shownScore += Math.ceil((m.score - this._shownScore) * 0.15);
    if (c.score !== this._shownScore) {
      $("hud-score").textContent = this._shownScore; c.score = this._shownScore;
      $("hud-score").classList.toggle("counting", this._shownScore !== m.score);
    }
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

    // 1日・時間帯・天気
    const w = WEATHER[m.weatherKey] ?? WEATHER.clear;
    const dayKey = `${m.day.mode}:${m.day.cast}:${m.slotIdx}:${m.weatherKey}`;
    if (c.dayKey !== dayKey) {
      c.dayKey = dayKey;
      $("day-line").innerHTML = `${m.day.mode === "daily" ? '<b class="daily">DAILY</b> ' : ""}${w.icon} ${m.slot.name}`
        + ` <span class="day-cast">${Math.min(m.day.cast, DAY.casts)}/${DAY.casts}投</span>`;
      $("tod-tint").className = m.slot.key;
      $("fog-layer").classList.toggle("hidden", m.weatherKey !== "fog");
    }
    if (c.omen !== m.omen) {
      c.omen = m.omen;
      $("omen-fill").style.width = `${100 * m.omen / OMEN.max}%`;
      $("omen-fill").classList.toggle("hot", m.omen >= OMEN.max * 0.75);
    }
    // 連続予告: 段階ごとに海が暗く荒れていく
    if (c.rz !== m.renzokuStep) { c.rz = m.renzokuStep; $("sea-stage").className = m.renzokuStep ? `s${m.renzokuStep}` : ""; }

    // 保留
    const showHolds = ["idle", "charging", "flying", "waiting"].includes(m.phase);
    const holdKey = showHolds ? m.holds.map((h) => `${h.seq}:${h.color}`).join(",") : "";
    if (c.holdKey !== holdKey) {
      c.holdKey = holdKey;
      $("hold-row").classList.toggle("hidden", !showHolds);
      $("hold-icons").innerHTML = m.holds.map((h, i) =>
        `<i class="hb ${HOLD_COLORS[h.color]} ${i === 0 ? "next" : ""}" data-seq="${h.seq}"></i>`).join("");
    }
    if (c.holdChange !== m.holdChange?.id) {
      c.holdChange = m.holdChange?.id;
      const el = m.holdChange && $("hold-icons").querySelector(`[data-seq="${m.holdChange.seq}"]`);
      if (el) { el.classList.remove("changed"); void el.offsetWidth; el.classList.add("changed"); }
    }

    // 待機中の常時演出: 激アツ(赤以上の保留・連続予告) / RUSH / 虹保留
    const idleish = ["idle", "charging", "flying", "waiting"].includes(m.phase);
    // 投げた保留は m.holds から m.currentHold に移るので、投げている最中はそちらも見る
    const inCast = m.phase === "flying" || m.phase === "waiting";
    const rainbowHold = idleish && !m.rushActive
      && (m.holds.some((h) => h.color >= 5) || (inCast && (m.currentHold?.color ?? 0) >= 5));
    const nowHot = inCast && (m.currentHold?.color ?? 0) >= 3;
    const hotLook = idleish && !m.rushActive && !rainbowHold
      && ((m.holds[0]?.color ?? 0) >= 3 || m.renzokuStep >= 2 || nowHot);
    const lookKey = `${hotLook}:${m.rushActive}:${rainbowHold}:${idleish}`;
    if (c.look !== lookKey) {
      c.look = lookKey;
      this.root.classList.toggle("hot", hotLook);
      this.root.classList.toggle("rush", m.rushActive);
      this.root.classList.toggle("rainbow", rainbowHold);
      this.scene.setAmbient(m.rushActive && idleish ? 3 : rainbowHold ? 4 : hotLook ? 2 : 0);
    }
    // 激アツのカットイン: 同じ保留では1回だけ(投げるたびに出し直さない)
    // 連続予告の最終段(renzokuStep 3)は今投げている保留が当該なので、色が赤未満でもそちらに付ける
    const currentIsHot = nowHot || (inCast && m.renzokuStep === 3);
    const hotSeq = hotLook ? (currentIsHot ? m.currentHold?.seq : m.holds[0]?.seq) ?? -1 : null;
    // 新しい1日は保留の seq が 0 から振り直されるので、前日の記録は捨てる
    if (this._hotDay !== m.day) { this._hotDay = m.day; this._hotSeq = undefined; }
    if (hotSeq !== null && hotSeq !== this._hotSeq) {
      this._hotSeq = hotSeq;
      this._cutin("cutin", `<div class="ci-main">激アツ</div><div class="ci-sub">CHANCE UP</div>`, 1500);
      this.model.doFlash([255, 255, 255], 0.7, 0.12);
      this.scene.shake(6);
      this.snd.play("cutin");
      this.haptics.play({ name: "cutIn" });
    }

    // 1日のリザルト
    if (c.dayRes !== m.dayResult?.id) {
      c.dayRes = m.dayResult?.id;
      this._renderDayEnd(m.dayResult);
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
      const gained = rushOn && c.rushOn && m.rushLeft > c.rushLeft ? m.rushLeft - c.rushLeft : 0;
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
        // 上乗せ: 残り回転数の横に +N を跳ねさせる
        if (gained) {
          h.querySelector(".rush-line")?.insertAdjacentHTML("beforeend", `<span class="rush-plus">+${gained}</span>`);
          this._cutin("rush-cutin", `<div class="rc-main">上乗せ!!</div><div class="rc-sub">RUSH +${gained}回転</div>`, 1900);
        }
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
      $("osu-layer").classList.toggle("hidden", fightKey !== "osu");
      $("osu-meter").classList.toggle("hidden", fightKey !== "osu");
      if (fightKey === "osu") this._buildOsu();
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
      // ヌシ戦はバーが「残り体力」(減っていく赤)
      $("hold-fill").style.width = `${(m.nushiFight ? m.nushiState.hp : Math.min(1, m.fightProg)) * 100}%`;
      $("hold-fill").classList.toggle("nushi", m.nushiFight);
      const lbl = m.nushiFight ? `ヌシの体力 ${Math.ceil(m.nushiState.hp * 100)}%` : "テンション";
      if (c.holdLbl !== lbl) { c.holdLbl = lbl; $("hold-label").textContent = lbl; }
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

    if (fightKey === "osu") this._updateOsu();

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
        const premium = cue.heat === "premium" || cue.heat === "nushi" || cue.heat === "secret";
        cutin.innerHTML = `
          <div class="om-cut ${cue.heat === "nushi" || cue.heat === "secret" ? `premium ${cue.heat}` : premium ? "premium" : "hot"}">
            <div class="om-cut-lines"></div>
            <img class="om-cut-img" src="${ASSET("OldManHot")}" alt="">
            <div class="om-cut-text">
              <span class="om-cut-tag">${cue.heat === "nushi" ? "ヌシ出現!!" : cue.heat === "secret" ? "幻の気配" : premium ? "伝説の気配" : "大物の予感"}</span>
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
    // 金色の色替えは初登録のカラー化アニメの終点にも効くよう CSS 変数で渡す
    const artFilter = r.gold ? GOLD_FILTER : "none";
    const artStyle = `--art-filter:${artFilter};filter:${artFilter}`;
    const artImg = `<img class="fish-art ${r.gold ? "gold-art" : ""}" src="${ASSET(r.img)}" style="${artStyle}" alt="${r.name}">`;
    const aura = r.nushi ? "nushi" : r.gold ? "gold" : "";
    const art = aura ? `<div class="art-aura ${aura}">${artImg}<div class="art-sheen"></div>
      ${aura === "gold" ? '<i class="spk"></i>'.repeat(7) : '<div class="nushi-stamp">討伐</div>'}</div>` : artImg;

    o.className = "show";
    o.innerHTML = `
      <div class="reveal-dim" style="opacity:${spec.dimOpacity}"></div>
      ${fx}
      <div class="reveal-scroll">
        <div class="reveal-card tier${spec.tier} ${spec.hueCycle ? "huecycle" : ""} ${r.isNew ? "is-new" : ""} ${aura ? `${aura}-card` : ""}"
             style="--accent:${spec.accent};--entry-scale:${spec.entryScale};--entry-spin:${spec.entrySpin}deg;--entry-delay:${spec.entryDelay}s">
          <div class="rarity ${spec.labelPulse ? "pulse" : ""}"
               style="${spec.hueCycle
                 ? "background-image:linear-gradient(90deg,#ff3b30,#ff9500,#ffd60a,#34c759,#007aff,#af52de)"
                 : `color:${spec.accent}`};text-shadow:0 0 16px ${spec.accent}">${label}</div>
          ${r.isSecret ? '<div class="secret-label">✦ シークレット!! ✦</div>' : ""}
          ${r.nushi ? '<div class="nushi-label">★ ヌシ討伐!!! ★</div>' : ""}
          ${r.gold ? `<div class="gold-label">✦ 金色個体 ✦${r.newGold ? " <small>図鑑に登録!</small>" : ""}</div>` : ""}
          ${r.crown ? `<div class="crown-label">👑 サイズ王冠!${r.newCrown ? " <small>図鑑に登録!</small>" : ""}</div>` : ""}
          ${r.isNew ? `
          <div class="new-art">
            <div class="new-burst"></div>
            ${art}
            <div class="new-q">？</div>
            <div class="new-stamp">図鑑<br>NEW!</div>
          </div>
          <div class="new-dex-line">${r.nushi ? "📖 ヌシを図鑑に登録!" : r.isSecret ? "📖 幻の魚を図鑑に登録!"
            : `📖 図鑑に新登録!  ${dex.caughtSpecies} / ${dex.totalSpecies} 種`}</div>`
          : art}
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

  // ---------- osu! 風ファイト ----------

  _buildOsu() {
    const m = this.model, R = OSU.radius;
    const svg = this.$("osu-svg"), box = this.$("osu-objs");
    svg.innerHTML = m.osuObjs.filter((o) => o.type === "slider").map((o) =>
      `<path data-o="${o.id}" d="M${o.x},${o.y} Q${o.cx},${o.cy} ${o.x2},${o.y2}" />`).join("");
    box.innerHTML = m.osuObjs.map((o) => {
      if (o.type === "circle") {
        return `<div class="osu-c" data-o="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${R * 2}px;height:${R * 2}px">
          <b>${o.num}</b><i class="osu-ap"></i></div>`;
      }
      if (o.type === "slider") {
        return `<div class="osu-c slider" data-o="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${R * 2}px;height:${R * 2}px">
          <b>${o.num}</b><i class="osu-ap"></i></div>
          <div class="osu-tail" data-tail="${o.id}" style="left:${o.x2}px;top:${o.y2}px"></div>
          <div class="osu-ball" data-ball="${o.id}"></div>`;
      }
      return `<div class="osu-spin" data-o="${o.id}" style="left:${o.x}px;top:${o.y}px">
        <div class="spin-meter" data-meter="${o.id}"></div><span>回せ!!</span></div>`;
    }).join("");
  }

  _updateOsu() {
    const m = this.model, now = m.now, svg = this.$("osu-svg"), box = this.$("osu-objs");
    let cap = "円を叩け!";
    for (const o of m.osuObjs) {
      const end = o.t2 ?? o.t;
      const visible = now >= o.t - OSU.approach && now <= end + 0.25;
      const el = box.querySelector(`[data-o="${o.id}"]`);
      if (o.type === "circle" || o.type === "slider") {
        const judged = o.type === "circle" ? o.judged : o.head;
        el.style.display = visible && (!judged || now <= o.t + 0.25) ? "" : "none";
        el.className = `osu-c ${o.type === "slider" ? "slider" : ""} ${judged ?? ""}`;
        const ap = el.querySelector(".osu-ap");
        ap.style.transform = `scale(${1 + 2.2 * Math.max(0, (o.t - now) / OSU.approach)})`;
        ap.style.opacity = judged ? 0 : 1;
      }
      if (o.type === "slider") {
        const path = svg.querySelector(`[data-o="${o.id}"]`);
        path.style.display = visible ? "" : "none";
        path.classList.toggle("dead", o.head === "miss");
        box.querySelector(`[data-tail="${o.id}"]`).style.display = visible ? "" : "none";
        const ball = box.querySelector(`[data-ball="${o.id}"]`);
        const active = now >= o.t && now <= o.t2 && o.head && o.head !== "miss";
        ball.style.display = active ? "" : "none";
        if (active) {
          const b = m.sliderPos(o, (now - o.t) / (o.t2 - o.t));
          ball.style.transform = `translate(${b.x}px, ${b.y}px)`;
          const following = m.osuPtr.down && Math.hypot(m.osuPtr.x - b.x, m.osuPtr.y - b.y) <= OSU.follow;
          ball.classList.toggle("on", following);
          cap = following ? "そのまま追え!" : "ボールを指で追え!";
        }
      }
      if (o.type === "spinner") {
        el.style.display = visible ? "" : "none";
        const frac = Math.min(1, o.turns / o.need);
        box.querySelector(`[data-meter="${o.id}"]`).style.background =
          `conic-gradient(#ffd60a ${frac * 360}deg, rgba(255,255,255,.12) 0)`;
        el.classList.toggle("clear", frac >= 1);
        if (now >= o.t && now <= o.t2) cap = frac >= 1 ? "CLEAR!!" : "ぐるぐる回せ!!";
      }
    }
    this.$("osu-fill").style.width = `${Math.min(1, m.fightProg) * 100}%`;
    this.$("osu-remain").textContent = m.mashRemain.toFixed(1);
    if (this._c.osuCap !== cap) { this._c.osuCap = cap; this.$("osu-cap").textContent = cap; }
  }

  // ---------- 1日のリザルト ----------

  _renderDayEnd(d) {
    const o = this.$("day-end");
    if (!d) { o.className = "hidden"; o.innerHTML = ""; return; }
    const st = d.stats;
    const counts = RARITY_LABEL.map((l, r) =>
      `<span class="de-r" style="color:${RARITY_COLOR[r]}">${l}<b>${st.byR[r]}</b></span>`).join("")
      + (st.secrets ? `<span class="de-r secret">幻<b>${st.secrets}</b></span>` : "");
    const best = st.best
      ? `<div class="de-best"><img src="${ASSET(st.best.img)}" alt=""><div><small>今日の一匹</small><br>${st.best.name}<br><b>${st.best.cm}cm</b></div></div>`
      : `<div class="de-best none">今日は大物に出会えなかった…</div>`;
    const today = new Date();
    o.className = "show";
    o.innerHTML = `
      <div class="de-card rank-${d.rank}">
        <div class="de-title">${d.mode === "daily" ? `デイリーチャレンジ ${d.date}` : "1日の釣果"}</div>
        <div class="de-rank">${d.rank}</div>
        <div class="de-score">${d.score.toLocaleString()} pt</div>
        <div class="de-sub">${d.isBest ? "🏆 自己ベスト更新!!" : `ベスト ${d.best.toLocaleString()} pt`}
          ${d.dailyBest !== null ? ` ・ 今日のデイリー最高 ${d.dailyBest.toLocaleString()} pt` : ""}</div>
        <div class="de-counts">${counts}</div>
        <div class="de-misc">バラし・ハズレ ${st.miss}回 ・ 図鑑新登録 ${st.newCount}種</div>
        ${best}
        <div class="de-btns">
          <button class="de-btn next" data-day="free">次の日へ</button>
          <button class="de-btn daily" data-day="daily">デイリー<br><small>${today.getMonth() + 1}/${today.getDate()} の海</small></button>
        </div>
        <button class="de-copy" data-day="copy">📋 結果をコピー</button>
      </div>`;
  }

  _dayShareText(d) {
    const st = d.stats;
    const fish = RARITY_LABEL.map((l, r) => st.byR[r] ? `${l}×${st.byR[r]}` : "").filter(Boolean).join(" ");
    return `🎣 DOPA FISHING ${d.mode === "daily" ? `デイリー ${d.date}` : "1日の釣果"}\n`
      + `ランク${d.rank} ${d.score.toLocaleString()}pt\n${fish}${st.secrets ? ` 幻×${st.secrets}` : ""}\n`
      + (st.best ? `今日の一匹: ${st.best.name} ${st.best.cm}cm` : "");
  }

  _copyDayResult(btn) {
    const text = this._dayShareText(this.model.dayResult);
    const done = () => { btn.textContent = "✅ コピーしました"; };
    try {
      navigator.clipboard.writeText(text).then(done, () => { window.prompt("コピーしてね", text); });
    } catch { window.prompt("コピーしてね", text); }
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
    } else if (k.type === "nushi") {
      border = "#ff2d96";
      silhouette = `<div class="esc-sil"><img src="${ASSET(k.img)}" alt=""></div>`;
      details = `
        <div class="esc-details"><span class="esc-rarity" style="background:#ff2d96">ヌシ</span><span class="esc-name">${k.name}</span></div>
        <div class="esc-progress">
          <div class="esc-bar nushi"><div style="width:${k.hp * 100}%"></div></div>
          <div class="esc-taps">残り体力 ${Math.round(k.hp * 100)}%(今回 -${Math.round(k.dealt * 100)}%)</div>
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
