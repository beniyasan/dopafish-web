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

// MARK: RushRules — RUSH 確率・回転ルール (RushStatus.swift)
export const RushRules = {
  missThreshold: 0.18,
  bonusThreshold: 0.66,
  warningSpins: 3,
  endingDuration: 2.4,
  rodBiasPerLevel: 0.08,
  reelBiasPerLevel: 0.10,
  reelRescuePerLevel: 0.15,

  boost(roll, rareLevel) { return 1 - (1 - roll) * (1 - this.rodBiasPerLevel * rareLevel); },
  reelBoost(roll, reelLevel) { return 1 - (1 - roll) * (1 - this.reelBiasPerLevel * reelLevel); },
  reelRescueProbability(reelLevel) { return this.reelRescuePerLevel * reelLevel; },
  rarityCap(rareLevel) { return [Rarity.sr, Rarity.ssr, Rarity.ur, Rarity.lr, Rarity.lr, Rarity.lr][Math.min(rareLevel, 5)]; },
  gain(rarity, active, rushLevel) {
    let spins = rarity === Rarity.lr ? 15 : rarity === Rarity.ur ? 10 : 0;
    if (active && rarity >= Rarity.ssr) spins += 2;
    return spins > 0 ? spins + rushLevel : 0;
  },
  bonusProbability(rareLevel, reelLevel) {
    if (this.rarityCap(rareLevel) < Rarity.ssr) return 0;
    const rareScale = 1 - this.rodBiasPerLevel * rareLevel;
    const direct = Math.min(1, (1 - this.bonusThreshold) / rareScale);
    const miss = Math.max(0, (this.missThreshold - (1 - rareScale)) / rareScale);
    const rescuedBonus = Math.min(1, (1 - this.bonusThreshold)
      / ((1 - this.missThreshold) * (1 - this.reelBiasPerLevel * reelLevel)));
    return Math.min(1, direct + miss * this.reelRescueProbability(reelLevel) * rescuedBonus);
  },
};

export function rushStatus(remaining) {
  const isLast = remaining === 0;
  const isUrgent = remaining <= RushRules.warningSpins;
  return {
    remaining, isLast, isUrgent,
    heading: isLast ? "LAST CAST" : "RUSH",
    hint: isLast ? "最終回転・この一投で上乗せを狙え"
         : isUrgent ? "ラストスパート・SSR以上で上乗せ" : "高確率モード・スコア ×2",
  };
}

// EscapeReport (EscapeReport.swift)
export const ESCAPE = { displayDuration: 2.2, skipLockDuration: 0.6, nearMissTaps: 3 };

export function makeEscapeReport(kind, mashCount, mashNeed) {
  // kind: {type:"lineBreak", rarity, fishName, img, cm, discovered} | {type:"bluff"}
  const r = { id: Math.random().toString(36).slice(2), kind, tapsShort: 0, progress: 0 };
  if (kind.type === "lineBreak") {
    r.tapsShort = Math.max(1, mashNeed - mashCount);
    r.progress = Math.min(1, mashCount / Math.max(1, mashNeed));
  }
  r.isNearMiss = kind.type === "lineBreak" && r.tapsShort <= ESCAPE.nearMissTaps;
  r.isBigFish = kind.type === "lineBreak" && kind.rarity >= Rarity.sr;
  r.headline = kind.type === "bluff" ? "影だけだった…"
             : r.isNearMiss ? `あと${r.tapsShort}回だった!!` : "バラした…";
  r.subline = kind.type === "bluff" ? "魚の姿はなかった"
             : r.isNearMiss ? "惜しい!! 逃げられた…" : `あと${r.tapsShort}回足りなかった`;
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

export function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); } // inclusive
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
