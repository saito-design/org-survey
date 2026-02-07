# 組織診断：ファイル分離（Git側＝原本／Drive側＝実データ）

## 目的
- **実データ（対象者・組織・回答）**はGoogle Driveに置く
- **フォーマット原本／設問マスタ／分析ロジック**はGit（ローカル）に置く

---

## 1) Git側（原本・ロジック）
推奨配置：
- core/questions/questions.json（固定設問セットの正）
- core/excel/組織診断プログラム.xlsm（共通ロジック）
- templates/master_format/v1/
  - org_units_format.csv
  - respondents_format.csv
  - responses_db_format.csv
- docs/（設計メモ、運用ルール）

※このフォルダにあるCSVは「列名と型の正」なので、サンプル2行のみでOK。

---

## 2) Drive側（案件データ）
/組織診断_実データ/{client_code}/{YYYY-MM}/
  master/
    org_units.csv
    respondents.csv
  raw/
    responses_db.csv   ← DBシート形式（縦持ち/long）
  export/
    report_context.md
    summary.csv
    segment_matrix.csv
  meta.json

---

## 3) 年代算出ルール（確定）
- 基準日（as_of）＝診断実施月の月末
- 生年月日から満年齢を算出し、年代（20代/30代…）を付与
- meta.jsonに as_of を必ず保存する

---

## 4) 総合スコア（確定）
- 要素ごとの平均（factor_mean）を算出
- 総合＝要素平均の単純平均（N=0要素は除外）
- 役職別に固定設問セットが異なるため、**全回答の単純平均は禁止**
