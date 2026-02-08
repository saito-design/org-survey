/**
 * スコア信号判定ユーティリティ
 *
 * 判定基準（Excel「調査概要」シートより）:
 * - 良好（青）: 平均得点 ≧ 3.8 かつ Bottom2比率 < 10%
 * - 注意（黄）: どちらか一方のみ満たす
 * - 要改善（赤）: 平均得点 < 3.8 かつ Bottom2比率 ≧ 10%
 */

export type Signal = "good" | "warn" | "bad";

/**
 * 信号判定の閾値
 */
export const SIGNAL_THRESHOLDS = {
  score: 3.8,      // 平均得点の閾値
  bottom2: 0.10,   // Bottom2比率の閾値（10%）
} as const;

/**
 * スコアとBottom2比率に応じた信号を判定する
 * @param score - 平均得点
 * @param bottom2Rate - Bottom2比率（0-1の小数）。省略時はスコアのみで判定
 * @returns "good" | "warn" | "bad"
 */
export const getSignal = (
  score: number | string | null | undefined,
  bottom2Rate?: number | null
): Signal => {
  const num = typeof score === 'string' ? Number(score) : score;

  if (num == null || !Number.isFinite(num)) {
    return "warn"; // データ欠損や異常値は暫定的に「注意」
  }

  const scoreOk = num >= SIGNAL_THRESHOLDS.score;

  // Bottom2比率が指定されていない場合はスコアのみで判定（後方互換）
  if (bottom2Rate == null) {
    return scoreOk ? "good" : "bad";
  }

  const bottom2Ok = bottom2Rate < SIGNAL_THRESHOLDS.bottom2;

  // 両方OK → 良好（青）
  if (scoreOk && bottom2Ok) {
    return "good";
  }
  // 両方NG → 要改善（赤）
  if (!scoreOk && !bottom2Ok) {
    return "bad";
  }
  // 片方だけOK → 注意（黄）
  return "warn";
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
