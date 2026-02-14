#!/usr/bin/env python3
"""
「No.〇〇に同じ」マッピング対応
STAFF/PAの場合:
- 管理No.33の値 → 管理No.37にコピー
- 管理No.34の値 → 管理No.38にコピー
- 管理No.35の値 → 管理No.39にコピー
（両方に同じ値が入る）
"""

import csv
from pathlib import Path

# マッピング: (コピー元, コピー先)
SAME_AS_MAPPING = [
    (34, 37),  # 店長の承認行動 → 上司の承認行動
    (35, 38),  # 店長の育成マインド → 上司の育成マインド
    (36, 39),  # 意見具申 → 上司への意見具申
]

# 対象役職
TARGET_ROLES = ['STAFF', 'PA']

def main():
    input_path = Path(__file__).parent.parent / "clients" / "株式会社サンプル様_組織診断回答データ_202602実施分.csv"

    # CSVを読み込み
    with open(input_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)

    # ヘッダー行のインデックスを確認 (3行目がヘッダー)
    header = rows[2]

    # 列インデックスを取得
    col_format = header.index("アンケートフォーマット")

    # 設問開始列を探す
    question_start_col = None
    for i, h in enumerate(header):
        if h == "1":
            question_start_col = i
            break

    if question_start_col is None:
        print("Error: 設問列が見つかりません")
        return

    print(f"アンケートフォーマット列: {col_format}")
    print(f"設問開始列: {question_start_col} (管理No.1)")

    # 修正カウンタ
    copy_count = 0

    # データ行を処理
    for i, row in enumerate(rows[3:], start=3):
        if len(row) <= col_format:
            continue

        role = row[col_format]
        if role not in TARGET_ROLES:
            continue

        for src_no, dst_no in SAME_AS_MAPPING:
            src_col = question_start_col + src_no - 1
            dst_col = question_start_col + dst_no - 1

            if src_col < len(row) and dst_col < len(row):
                src_val = row[src_col]
                if src_val:  # コピー元に値がある場合のみ
                    row[dst_col] = src_val  # コピー先に値をセット
                    copy_count += 1

    # CSVを書き出し（上書き）
    with open(input_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"修正完了: {input_path}")
    print(f"コピー件数: {copy_count}")

if __name__ == "__main__":
    main()
