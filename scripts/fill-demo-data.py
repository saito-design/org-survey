#!/usr/bin/env python3
"""
デモCSVの不足データを埋めるスクリプト
- 管理者名: 店舗ごとに日本人名を割り当て
- 氏名: 日本人名をランダム生成
- 年代: 生年月日から計算
- アンケートフォーマット: 役職区分から決定
"""

import csv
import random
from datetime import datetime
from pathlib import Path

# 日本人名リスト
LAST_NAMES = [
    "田中", "山田", "佐藤", "鈴木", "高橋", "伊藤", "渡辺", "中村", "小林", "加藤",
    "吉田", "山本", "松本", "井上", "木村", "林", "清水", "山崎", "森", "池田",
    "橋本", "阿部", "石川", "前田", "藤田", "小川", "岡田", "後藤", "長谷川", "村上",
    "近藤", "石井", "斎藤", "坂本", "遠藤", "青木", "藤井", "西村", "福田", "太田"
]

FIRST_NAMES_MALE = [
    "太郎", "一郎", "健二", "誠", "翔太", "大輔", "拓海", "悠真", "蓮", "陽介",
    "隆", "浩", "剛", "亮", "淳", "聡", "真一", "和也", "直樹", "雄一",
    "雅人", "康介", "慎太郎", "英樹", "裕二", "俊介", "大樹", "健太", "達也", "崇"
]

FIRST_NAMES_FEMALE = [
    "花子", "美咲", "結衣", "綾香", "さくら", "七海", "彩花", "優子", "恵子", "理沙",
    "明美", "真由美", "美穂", "愛", "由美", "裕子", "智子", "香織", "麻衣", "奈々",
    "葵", "陽菜", "凛", "杏", "楓", "咲良", "莉子", "紗月", "美月", "遥"
]

def generate_name(gender: str) -> str:
    """日本人名を生成"""
    last = random.choice(LAST_NAMES)
    if gender == "男性":
        first = random.choice(FIRST_NAMES_MALE)
    else:
        first = random.choice(FIRST_NAMES_FEMALE)
    return f"{last}{first}"

def calc_age_band(birth_date: str) -> str:
    """生年月日から年代を計算"""
    if not birth_date:
        return ""

    try:
        # YYYY/M/D または YYYY-MM-DD 形式に対応
        for fmt in ["%Y/%m/%d", "%Y-%m-%d", "%Y/%-m/%-d"]:
            try:
                birth = datetime.strptime(birth_date, fmt)
                break
            except ValueError:
                continue
        else:
            # パースを再試行（柔軟に）
            parts = birth_date.replace("-", "/").split("/")
            if len(parts) == 3:
                birth = datetime(int(parts[0]), int(parts[1]), int(parts[2]))
            else:
                return ""

        today = datetime.now()
        age = today.year - birth.year
        if (today.month, today.day) < (birth.month, birth.day):
            age -= 1

        if age < 20:
            return "10代"
        elif age >= 70:
            return "70代以上"
        else:
            decade = (age // 10) * 10
            return f"{decade}代"
    except Exception:
        return ""

def role_to_format(role: str) -> str:
    """役職区分からアンケートフォーマットを決定"""
    if role == "店長":
        return "MANAGER"
    elif role in ["正社員", "一般社員"]:
        return "STAFF"
    elif "パート" in role or "アルバイト" in role:
        return "PA"
    else:
        return "STAFF"

def main():
    input_path = Path(__file__).parent.parent / "clients" / "株式会社サンプル様_組織診断回答データ_202602実施分.csv"
    output_path = input_path  # 上書き保存

    # 店舗ごとの管理者名を事前に生成
    store_managers = {}

    # CSVを読み込み
    with open(input_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)

    # ヘッダー行のインデックスを確認 (3行目がヘッダー)
    header = rows[2]

    # 列インデックスを取得
    col_manager_name = header.index("管理者名")  # 16
    col_name = header.index("氏名")  # 22
    col_birth = header.index("生年月日")  # 24
    col_age_band = header.index("年代")  # 25
    col_role = header.index("役職区分")  # 19
    col_format = header.index("アンケートフォーマット")  # 30
    col_store = header.index("事業所コード")  # 17

    print(f"列インデックス: 管理者名={col_manager_name}, 氏名={col_name}, 生年月日={col_birth}, 年代={col_age_band}, 役職区分={col_role}, アンケートフォーマット={col_format}, 事業所コード={col_store}")

    # 各店舗の管理者名を先に決定
    for i, row in enumerate(rows[3:], start=3):
        if len(row) > col_store:
            store_code = row[col_store]
            if store_code and store_code not in store_managers:
                store_managers[store_code] = generate_name("男性" if random.random() > 0.5 else "女性")

    # データ行を処理
    random.seed(42)  # 再現性のため

    for i, row in enumerate(rows[3:], start=3):
        if len(row) <= col_format:
            continue

        # 管理者名
        store_code = row[col_store] if len(row) > col_store else ""
        if store_code and not row[col_manager_name]:
            row[col_manager_name] = store_managers.get(store_code, "")

        # 氏名（役職に応じて性別を決定）
        if not row[col_name]:
            role = row[col_role] if len(row) > col_role else ""
            if role == "店長":
                gender = "男性" if random.random() > 0.3 else "女性"
            else:
                gender = "男性" if random.random() > 0.5 else "女性"
            row[col_name] = generate_name(gender)

        # 年代（生年月日から計算）
        if not row[col_age_band]:
            birth = row[col_birth] if len(row) > col_birth else ""
            row[col_age_band] = calc_age_band(birth)

        # アンケートフォーマット（常に再計算）
        role = row[col_role] if len(row) > col_role else ""
        row[col_format] = role_to_format(role)

    # CSVを書き出し
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"出力完了: {output_path}")
    print(f"店舗数: {len(store_managers)}")
    print(f"データ行数: {len(rows) - 3}")

if __name__ == "__main__":
    main()
