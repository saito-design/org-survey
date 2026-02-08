/**
 * スコア信号判定ユーティリティ
 */

export type Signal = "good" | "warn" | "bad";

/**
 * 信号判定の閾値
 * - good: 3.8以上 (良好)
 * - warn: 3.4以上 (注意)
 * - bad: 3.4未満 (要改善)
 */
export const SIGNAL_THRESHOLDS = {
  good: 3.8,
  warn: 3.4,
} as const;

/**
 * スコアに応じた信号を判定する
 * @param score - 判定対象のスコア
 * @returns "good" | "warn" | "bad"
 */
export const getSignal = (score: number | string | null | undefined): Signal => {
  const num = typeof score === 'string' ? Number(score) : score;
  
  if (num == null || !Number.isFinite(num)) {
    return "warn"; // データ欠損や異常値は暫定的に「注意」
  }

  if (num >= SIGNAL_THRESHOLDS.good) {
    return "good";
  }
  if (num >= SIGNAL_THRESHOLDS.warn) {
    return "warn";
  }
  return "bad";
};

/**
 * 信号の種類に応じた表示ラベルを取得する
 */
export const getSignalLabel = (signal: Signal): string => {
  switch (signal) {
    case "good": return "良好";
    case "warn": return "注意";
    case "bad": return "要改善";
  }
};

/**
 * 信号の種類に応じた背景色クラスを取得する（Tailwind用）
 */
export const getSignalBgClass = (signal: Signal): string => {
  switch (signal) {
    case "good": return "bg-blue-50 border-blue-200 text-blue-900";
    case "warn": return "bg-yellow-50 border-yellow-200 text-yellow-900";
    case "bad": return "bg-red-50 border-red-200 text-red-900";
  }
};
