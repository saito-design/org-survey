/**
 * 文字列の正規化ユーティリティ
 */

/**
 * ラベル文字列を正規化する
 * - null/undefined ガード
 * - 改行（\r\n, \n）を半角スペースに置換
 * - 連続する空白を1つの半角スペースに圧縮
 * - 前後の空白をトリム
 */
export const normalizeLabel = (s?: string | null): string => {
  if (s == null) return "";
  return s
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};
