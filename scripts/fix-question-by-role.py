#!/usr/bin/env python3
"""
役職ごとに回答対象外の設問を空にする
- MANAGER: 全65問回答
- STAFF: 管理No 43, 44, 45 は空
- PA: 管理No 6, 17, 18, 19, 26, 29, 30, 43, 44, 45, 49, 51, 54, 55, 56, 57, 58, 59, 60 は空
"""

import csv
from pathlib import Path

# 各役職で空にする管理No（設問番号）
EMPTY_QUESTIONS = {
    'MANAGER': [],  # 全問回答
    'STAFF': [43, 44, 45],
    'PA': [6, 17, 18, 19, 26, 29, 30, 43, 44, 45, 49, 51, 54, 55, 56, 57, 58, 59, 60],
}

def main():
    input_path = Path(__file__).parent.parent / "clients" / "株式会社サンプル様_組織診断回答データ_202602実施分.csv"

    # CSVを読み込み
    with open(input_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)

    # ヘッダー行のインデックスを確認 (3行目がヘッダー)
    header = rows[2]

    # 列インデックスを取得
    col_format = header.index("アンケートフォーマット")  # 30 (0-indexed)

    # 設問1はヘッダー行で "1" となっている列
    # メタ列の後に設問列が始まる
    # ヘッダー行で "1" を探す
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
    fix_counts = {'MANAGER': 0, 'STAFF': 0, 'PA': 0}

    # データ行を処理
    for i, row in enumerate(rows[3:], start=3):
        if len(row) <= col_format:
            continue

        role = row[col_format]
        if role not in EMPTY_QUESTIONS:
            continue

        empty_nos = EMPTY_QUESTIONS[role]
        for q_no in empty_nos:
            col_idx = question_start_col + q_no - 1  # 管理No.1 = question_start_col
            if col_idx < len(row) and row[col_idx]:
                row[col_idx] = ""
                fix_counts[role] += 1

    # CSVを書き出し（上書き）
    with open(input_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"修正完了: {input_path}")
    print(f"修正件数:")
    for role, count in fix_counts.items():
        print(f"  {role}: {count} セル")

if __name__ == "__main__":
    main()
