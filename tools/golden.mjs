// 振る舞いを固定するゴールデントレース。
// 実際の GameModel を Node で動かし(乱数・時計を固定、演出系はスタブ)、
// いくつかのシナリオを自動プレイして、フェーズ遷移・結果・スコアなどの列を出力する。
// リファクタ前後でこの出力が一致すれば、ゲームの振る舞いは変わっていない。
//
//   node tools/golden.mjs            → トレースを標準出力
//   node tools/golden.mjs --hash     → シナリオごとのハッシュだけ
//   node tools/golden.mjs --check    → tools/golden.expected と比べる(違えば終了コード1)
//   node tools/golden.mjs --update   → tools/golden.expected を書き換える(振る舞いを意図して変えたとき)
import { createHash } from "node:crypto";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// ---- 環境のスタブ ----
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FIXED_NOW = Date.UTC(2026, 9, 22, 3, 0, 0);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
};
const mem = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
};
globalThis.location = { search: "" };
const nop = new Proxy(function () {}, { get: (t, k) => (k === "then" ? undefined : nop), apply: () => nop });

const { GameModel, dex } = await import(pathToFileURL(path.join(ROOT, "js/model.js")).href);
const data = await import(pathToFileURL(path.join(ROOT, "js/data.js")).href);

// ---- シナリオ ----
const ALL_FISH = data.fishPool.flat().map((f) => f.name);
const SCENARIOS = [
  { name: "rod0-free",     seed: 1, storage: {},                                         casts: 70 },
  { name: "rod5-full",     seed: 2, storage: { up_rare: 5, up_reel: 5, up_rush: 5, medals: 9999 }, casts: 90 },
  { name: "complete-dex",  seed: 3, storage: { up_rare: 5, up_reel: 3, endingSeen: 1, dexAll: true }, casts: 90 },
  { name: "daily",         seed: 4, storage: { up_rare: 2 }, daily: true,                 casts: 60 },
  { name: "nushi-secret",  seed: 5, storage: { up_rare: 5, endingSeen: 1, dexAll: true }, search: "?nushi", casts: 12 },
  { name: "rush-start",    seed: 6, storage: { up_rare: 3 }, search: "?rush=12",           casts: 40 },
];

function run(sc) {
  mem.clear();
  for (const [k, v] of Object.entries(sc.storage)) {
    if (k === "dexAll") mem.set("fishDex", JSON.stringify(Object.fromEntries(ALL_FISH.map((n) => [n, [1, 10, 0, 0]]))));
    else mem.set(k, String(v));
  }
  dex.records = JSON.parse(mem.get("fishDex") ?? "{}");
  globalThis.location.search = sc.search ?? "";
  Math.random = mulberry32(sc.seed);

  const m = new GameModel(nop, nop, nop);
  const trace = [];
  const rec = (ev) => trace.push(ev);
  m.autoWin = true;
  m.startGame();
  if (sc.daily) { m.phase = "idle"; m.startNewDay("daily"); }

  let casts = 0, lastPhase = null, guard = 0, choice = 0;
  const dt = 1 / 60;
  while (casts < sc.casts && guard++ < 400000) {
    if (m.phase !== lastPhase) {
      lastPhase = m.phase;
      rec([+m.now.toFixed(3), m.phase, m.result, m.reachKind, m.fightType, m.score, m.medals,
           m.rushActive ? m.rushLeft : -1, m.day.cast, m.omen, m.renzokuStep,
           m.holds.map((h) => h.color).join(""), m.nushiState.idx, +m.nushiState.hp.toFixed(4)]);
      if (m.phase === "reveal") {
        const r = m.reveal;
        rec(["reveal", r.name, r.rarity, r.cm, r.score, r.medals, !!r.perfect, !!r.isSecret, !!r.gold, !!r.crown, r.rushGain, !!r.baitable]);
      }
      if (m.phase === "escaping" && m.escapeReport) rec(["escape", m.escapeReport.headline, m.escapeReport.subline]);
      if (m.phase === "dayEnd") rec(["dayEnd", m.dayResult.rank, m.dayResult.score]);
    }
    switch (m.phase) {
      case "idle":
        m.pressCast(); m.tick(0.5); m.releaseCast(); casts++; break;
      case "reach":
        // 合わせ: 突っ込みの直後に叩く(GREAT)
        if (m.hookLunge && !m.hookLunge.judged && m.now >= m.hookLunge.at + 0.05) m.tapScreen();
        break;
      case "reveal":
        if (m.reveal && m.now >= m.revealLockUntil) m.dismissReveal(m.reveal.baitable && (choice++ % 3 === 0) ? "bait" : "cash");
        break;
      case "escaping": m.dismissEscape(true); break;
      case "rushEnding": m.dismissRushSummary(); break;
      case "ending": m.now = Math.max(m.now, m.ending.teaserAt + 2); m.dismissEnding(); m.dismissEnding(); break;
      case "dayEnd": m.startNewDay(choice++ % 2 ? "daily" : "free"); break;
    }
    m.tick(dt);
  }
  rec(["end", casts, m.score, m.medals, m.bestScore, m.omen, m.day.cast, m.day.seq, dex.caughtSpecies, dex.goldCount, dex.crownCount,
       m.nushiState.idx, mem.get("bait") ?? null]);
  return trace;
}

const mode = ["--hash", "--check", "--update"].find((f) => process.argv.includes(f));
const EXPECTED = path.join(ROOT, "tools/golden.expected");
const lines = [];
for (const sc of SCENARIOS) {
  const trace = run(sc);
  const text = trace.map((e) => JSON.stringify(e)).join("\n");
  const h = createHash("sha256").update(text).digest("hex").slice(0, 16);
  lines.push(`${sc.name.padEnd(14)} ${String(trace.length).padStart(5)} events  ${h}`);
  if (!mode) console.log(`# ${sc.name} ${h}\n${text}`);
}
if (mode === "--hash") console.log(lines.join("\n"));
if (mode === "--update") { fs.writeFileSync(EXPECTED, lines.join("\n") + "\n"); console.log(`wrote ${EXPECTED}`); }
if (mode === "--check") {
  const want = fs.readFileSync(EXPECTED, "utf8").trim().split("\n");
  const bad = lines.filter((l, i) => l !== want[i]);
  for (const l of lines) console.log((want.includes(l) ? "ok   " : "DIFF ") + l);
  if (bad.length || want.length !== lines.length) { console.log("golden: 振る舞いが変わっています"); process.exit(1); }
  console.log("golden: 一致");
}
