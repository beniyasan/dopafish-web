// Game data — ported 1:1 from GameModel.swift / RushStatus.swift / EscapeReport.swift

export const Rarity = { n: 0, r: 1, sr: 2, ssr: 3, ur: 4, lr: 5 };
export const RARITY_LABEL = ["N", "R", "SR", "SSR", "UR", "LR"];
export const RARITY_COLOR = ["#bfbfbf", "#00d5ff", "#3b82f6", "#a855f7", "#ffd60a", "#ff66cc"];

export const fishPool = [
  // n
  [{ name: "ワカサギ", img: "FishWakasagi", cm: [6, 14], score: 100 },
   { name: "メダカ", img: "FishMedaka", cm: [3, 8], score: 80 },
   { name: "ハゼ", img: "FishHaze", cm: [8, 15], score: 120 }],
  // r
  [{ name: "アジ", img: "FishAji", cm: [15, 35], score: 250 },
   { name: "メバル", img: "FishMebaru", cm: [15, 30], score: 300 },
   { name: "サバ", img: "FishSaba", cm: [25, 45], score: 280 }],
  // sr
  [{ name: "シーバス", img: "FishSeabass", cm: [50, 90], score: 700 },
   { name: "マダイ", img: "FishMadai", cm: [40, 80], score: 900 },
   { name: "ブリ", img: "FishBuri", cm: [60, 110], score: 800 }],
  // ssr
  [{ name: "ヒラマサ", img: "FishHiramasa", cm: [100, 180], score: 2200 },
   { name: "カジキ", img: "FishKajiki", cm: [200, 350], score: 3000 },
   { name: "キハダマグロ", img: "FishYellowfinTuna", cm: [120, 200], score: 2600 }],
  // ur
  [{ name: "黄金龍魚", img: "FishGoldenDragonfish", cm: [300, 500], score: 6000 },
   { name: "伝説の巨鯛", img: "FishLegendaryBream", cm: [150, 250], score: 5000 }],
  // lr
  [{ name: "虹神クジラ", img: "FishRainbowWhale", cm: [800, 1200], score: 15000 }],
];

export const secretFishPool = [
  { name: "真夜中の星メダカ", img: "FishMidnightStarMedaka", cm: [5, 12], score: 4000 },
  { name: "白銀の幻鮫", img: "FishSilverShark", cm: [250, 420], score: 8000 },
  { name: "古代龍リュウグウノツカイ", img: "FishOarfish", cm: [450, 700], score: 11000 },
];

export const OLD_MAN = {
  idle: ["お、いい天気だな", "昔はもっと釣れたんだよ", "そろそろ帰るか…",
         "向こうの方が釣れそうだぞ", "餌は撒いておいたのかい?", "今日はここまでかな",
         "この釣り場は50年通ってるんだ", "お互いゆっくりやろうや"],
  mild: ["いい引きをしてそうだ", "ウキの動きが良いぞ", "今日はツいてるな", "その場所、魚の通り道だよ"],
  hot: ["…大物の気配がする", "静かすぎる…何か来るぞ", "俺のカンは当たるんだ", "おいおい、鳥が騒いでるぞ"],
  premium: ["……あれは、伝説のヤツだ", "50年で2度しか見てないぞ、あれを"],
};

// heat: normal/warm = callout, hot/premium = cut-in
export const OLDMAN_HEAT = {
  normal: { isCutIn: false, duration: 2.8 },
  warm:   { isCutIn: false, duration: 2.8 },
  hot:    { isCutIn: true,  duration: 3.6 },
  premium:{ isCutIn: true,  duration: 3.6 },
};

export const UPGRADES = [
  { key: "up_rare", title: "金の竿",   icon: "🎣", effect: "高レア魚が釣れる" },
  { key: "up_reel", title: "強化リール", icon: "⚙️", effect: "逃げ→再抽選で大物化" },
  { key: "up_rush", title: "RUSH券",   icon: "🔥", effect: "RUSH突入+1回転/Lv" },
];
export const UPGRADE_COSTS = [300, 600, 1100, 1700, 2500]; // Lv1..5

// 泳がせ釣りの活き餌 — 次の1投(RUSH中は温存)の抽選値を r' = 1-(1-r)(1-power) で底上げ
// grade は餌にした魚のレア度(N/R)
export const BAIT = [
  { grade: Rarity.n, power: 0.35, effect: "大物率UP・小" },
  { grade: Rarity.r, power: 0.55, effect: "大物率UP・大" },
];
export const BAIT_SHOP = [
  { grade: Rarity.n, name: "小魚の活き餌", img: "FishMedaka", cost: 40 },
  { grade: Rarity.r, name: "活きアジ",     img: "FishAji",    cost: 90 },
];

// MARK: RushRules — RUSH 確率・回転ルール (RushStatus.swift)
export const RushRules = {
  missThreshold: 0.15,
  rushTable: { n: 0.33, r: 0.50, sr: 0.70, ur: 0.97 }, // RUSH中の各レア度の上限(累積)
  extendThreshold: 0.90,  // RUSH中の UR 以上(上乗せ対象) = 10%
  warningSpins: 3,
  endingDuration: 2.4,
  rodBiasPerLevel: 0.08,
  reelBiasPerLevel: 0.10,
  reelRescuePerLevel: 0.15,

  boost(roll, rareLevel) { return 1 - (1 - roll) * (1 - this.rodBiasPerLevel * rareLevel); },
  reelBoost(roll, reelLevel) { return 1 - (1 - roll) * (1 - this.reelBiasPerLevel * reelLevel); },
  reelRescueProbability(reelLevel) { return this.reelRescuePerLevel * reelLevel; },
  rarityCap(rareLevel) { return [Rarity.sr, Rarity.ssr, Rarity.ur, Rarity.lr, Rarity.lr, Rarity.lr][Math.min(rareLevel, 5)]; },
  // 突入: UR 7 / LR 10 (+RUSH券Lv)。RUSH中の上乗せは UR +2 / LR +4 のみ。
  // 上乗せの期待値を1回転未満に抑えないとRUSHが終わらなくなる(以前は竿Lv2以上でほぼ無限)
  // 通常時の突入は LR 確定 / UR は 1/4 の突入抽選(全UR突入だと再突入が早すぎて大半の時間がRUSHになる)
  urEntryChance: 1 / 4,
  gain(rarity, active, rushLevel, roll = Math.random()) {
    if (active) return rarity === Rarity.lr ? 4 : rarity === Rarity.ur ? 2 : 0;
    if (rarity === Rarity.lr) return 10 + rushLevel;
    if (rarity === Rarity.ur && roll < this.urEntryChance) return 7 + rushLevel;
    return 0;
  },
  // RUSH中は竿補正・リール救済・合わせのUR昇格がかからないので、素の UR 以上率そのもの
  bonusProbability(rareLevel) {
    if (this.rarityCap(rareLevel) < Rarity.ur) return 0;
    return 1 - this.extendThreshold;
  },
};

export function rushStatus(remaining) {
  const isLast = remaining === 0;
  const isUrgent = remaining <= RushRules.warningSpins;
  return {
    remaining, isLast, isUrgent,
    heading: isLast ? "LAST CAST" : "RUSH",
    hint: isLast ? "最終回転・この一投で上乗せを狙え"
         : isUrgent ? "ラストスパート・UR以上で上乗せ" : "高確率モード・スコア ×2",
  };
}

// EscapeReport (EscapeReport.swift)
export const ESCAPE = { displayDuration: 2.2, skipLockDuration: 0.6, nearMissTaps: 3 };

// fight: "mash" は count/need が連打回数。"hold"/"rhythm" は count/need を進捗(0..1 → 0..100)で渡す
export function makeEscapeReport(kind, mashCount, mashNeed, fight = "mash") {
  // kind: {type:"lineBreak", rarity, fishName, img, cm, discovered, snapped?} | {type:"bluff"}
  const r = { id: Math.random().toString(36).slice(2), kind, tapsShort: 0, progress: 0, fight };
  if (kind.type === "lineBreak") {
    r.tapsShort = Math.max(1, mashNeed - mashCount);
    r.progress = Math.min(1, mashCount / Math.max(1, mashNeed));
  }
  r.isNearMiss = kind.type === "lineBreak" &&
    (fight === "mash" ? r.tapsShort <= ESCAPE.nearMissTaps : r.progress >= 0.85);
  r.isBigFish = kind.type === "lineBreak" && kind.rarity >= Rarity.sr;
  const pct = Math.floor(r.progress * 100);
  r.headline = kind.type === "bluff" ? "影だけだった…"
             : kind.snapped ? "糸が切れた!!"
             : r.isNearMiss ? (fight === "mash" ? `あと${r.tapsShort}回だった!!` : "あと少しだった!!") : "バラした…";
  r.subline = kind.type === "bluff" ? "魚の姿はなかった"
             : kind.snapped ? "テンションを上げすぎた…"
             : r.isNearMiss ? "惜しい!! 逃げられた…"
             : fight === "mash" ? `あと${r.tapsShort}回足りなかった` : `引き寄せ ${pct}% で逃げられた`;
  r.displayName = kind.type === "bluff" ? "？？？" : (kind.discovered ? kind.fishName : "？？？");
  r.isUndiscovered = kind.type === "lineBreak" && !kind.discovered;
  return r;
}

// CardFXSpec (RevealCardFX.swift) — pure data, tier 0..4
export function cardFXSpec(caught) {
  const base = Math.max(0, caught.rarity - 1);
  const tier = caught.isSecret ? Math.max(2, base) : base;
  const accent = RARITY_COLOR[caught.rarity];
  const T = [
    { tier: 0, dimOpacity: 0.50, rayCount: 0,  raySpeed: 0,  rayRainbow: false, sparkleCount: 0,  ringCount: 0, entryFlash: false, entryShine: false, shinePeriod: 0,   border: "plain",    entryDelay: 0,    entryScale: 0.40, entrySpin: -8,  labelPulse: false, hueCycle: false },
    { tier: 1, dimOpacity: 0.55, rayCount: 0,  raySpeed: 0,  rayRainbow: false, sparkleCount: 12, ringCount: 0, entryFlash: true,  entryShine: true,  shinePeriod: 0,   border: "glow",     entryDelay: 0,    entryScale: 0.38, entrySpin: -10, labelPulse: false, hueCycle: false },
    { tier: 2, dimOpacity: 0.60, rayCount: 10, raySpeed: 16, rayRainbow: false, sparkleCount: 20, ringCount: 0, entryFlash: true,  entryShine: true,  shinePeriod: 2.8, border: "glow",     entryDelay: 0.05, entryScale: 0.34, entrySpin: -14, labelPulse: true,  hueCycle: false },
    { tier: 3, dimOpacity: 0.64, rayCount: 14, raySpeed: 26, rayRainbow: false, sparkleCount: 32, ringCount: 1, entryFlash: true,  entryShine: true,  shinePeriod: 1.8, border: "shimmer",  entryDelay: 0.12, entryScale: 0.26, entrySpin: -20, labelPulse: true,  hueCycle: false },
    { tier: 4, dimOpacity: 0.68, rayCount: 18, raySpeed: 34, rayRainbow: true,  sparkleCount: 46, ringCount: 2, entryFlash: true,  entryShine: true,  shinePeriod: 1.2, border: "rainbow",  entryDelay: 0.22, entryScale: 0.18, entrySpin: -26, labelPulse: true,  hueCycle: true },
  ][tier];
  return { ...T, accent };
}

export const MASH_NEED = [8, 10, 14, 18, 22, 28]; // taps required per rarity (n..lr)

// ファイトの種類: N・R は連打 / SR・SSR はテンションを保つ長押し / UR・LR はリズム
export function fightTypeFor(rarity) {
  return rarity >= Rarity.ur ? "rhythm" : rarity >= Rarity.sr ? "hold" : "mash";
}
// 長押し: 押すとテンション上昇・離すと下降。緑ゾーン内の時間だけ引き寄せが進む。1.0で糸切れ
export const HOLD = {
  rise: 0.75, fall: 0.6,
  zone: { [Rarity.sr]: [0.34, 0.72], [Rarity.ssr]: [0.40, 0.68] },
  needTime: { [Rarity.sr]: 2.0, [Rarity.ssr]: 2.6 },   // ゾーン内に必要な秒数
  slip: 0.15,                                           // ゾーン下: 引き寄せが戻る速さ(割合/秒)
  surge: { [Rarity.sr]: [0.14, 0.24], [Rarity.ssr]: [0.18, 0.3] }, // 魚の暴れ(テンション急上昇)
};
// リズム: 一定拍でノーツが流れてくる。判定窓は ±秒
export const RHYTHM = {
  interval: { [Rarity.ur]: 0.5, [Rarity.lr]: 0.43 },
  notes: { [Rarity.ur]: 12, [Rarity.lr]: 16 },
  need: { [Rarity.ur]: 8, [Rarity.lr]: 11 },            // GREAT=1 / GOOD=0.6 の合計
  leadIn: 1.0, great: 0.10, good: 0.20, strayPenalty: 0.3,
};

export function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); } // inclusive
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
