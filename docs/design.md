# 組織診断Webアプリ 設計メモ

## 1. 概要

Excel「組織診断プログラム.xlsm」の分析思想をWeb化し、企業ごとに集計軸を使い分けられる柔軟なシステムを構築する。

### ゴール
- 社員番号+パスワードでログイン → role自動判定 → 該当フォームで回答
- 回答データはGoogle Driveに追記型で保存
- 管理画面から分類ごとにPDF一括生成 → Drive保存
- NotebookLM用ソースパックも同梱可能

---

## 2. 技術スタック

| 項目 | 選定 |
|------|------|
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript 5 |
| セッション | iron-session |
| PDF生成 | @react-pdf/renderer |
| Google API | googleapis + google-auth-library |
| スタイリング | Tailwind CSS |

---

## 3. データモデル

### 3.1 Respondent（対象者）
```typescript
interface Respondent {
  respondent_id: string;     // 内部ID
  emp_no: string;            // 社員番号（ログインID）
  password_hash: string;     // SHA256ハッシュ
  role: 'MANAGER' | 'STAFF' | 'PA';
  store_code: string;        // 所属店舗コード
  name?: string;             // 表示名（匿名時は非表示）
  email?: string;
  join_year?: number;
  gender?: string;
  age_band?: string;
  anonymous?: boolean;       // 匿名希望フラグ
  active: boolean;
}
```

### 3.2 OrgUnit（組織単位）
```typescript
interface OrgUnit {
  store_code: string;        // JOIN用キー
  store_name: string;
  active: boolean;
  // 可変列（企業ごと）
  area?: string;
  manager?: string;
  business_type?: string;
  dept?: string;
  section?: string;
  [key: string]: any;        // 拡張可能
}
```

### 3.3 ReportGroup（納品単位）
```typescript
interface ReportGroup {
  group_id: string;
  group_name: string;
  filter_json: Record<string, string>;  // フィルタ条件
  sort_key: number;
  output_name: string;       // 出力フォルダ名
}
```

### 3.4 Question（設問）
```typescript
interface Question {
  question_id: string;
  factor_id: string;         // 因子ID
  element_id: string;        // 要素ID
  text: string;              // 設問文
  scale: '5point' | '4point' | 'binary';
  roles: ('MANAGER' | 'STAFF' | 'PA')[];  // 対象role
  order: number;
}
```

### 3.5 Response（回答）
```typescript
interface Response {
  response_id: string;       // UUID
  survey_id: string;         // 年月 e.g. "2026-02"
  respondent_id: string;
  question_id: string;
  value: number | null;      // 1-5 or null
  created_at: string;        // ISO日時
  submitted_at?: string;     // 提出日時
}
```

### 3.6 Settings（設定）
```typescript
interface Settings {
  min_n_to_show: number;           // 小サンプルマスク閾値（例: 5）
  anonymize_output: boolean;       // 出力時匿名化
  notebooklm_pack: boolean;        // NotebookLMパック生成
  factor_aggregation: 'element_mean' | 'value_mean';  // 因子集計方式
}
```

---

## 4. Google Workspace スプレッド仕様

### シート構成（企業ごとに1ファイル）

| シート名 | 説明 |
|----------|------|
| respondents | 対象者マスタ |
| org_units | 組織マスタ |
| questions | 設問マスタ |
| report_groups | 納品単位定義 |
| settings | システム設定 |

### respondents シート
| 列 | 必須 | 説明 |
|----|------|------|
| respondent_id | ✓ | 内部ID |
| emp_no | ✓ | 社員番号（ログインID） |
| password_hash | ✓ | SHA256 |
| role | ✓ | MANAGER/STAFF/PA |
| store_code | ✓ | 所属店舗 |
| active | ✓ | 有効フラグ |
| name | | 氏名 |
| email | | メール |

### org_units シート
| 列 | 必須 | 説明 |
|----|------|------|
| store_code | ✓ | JOINキー |
| store_name | ✓ | 店舗名 |
| active | ✓ | 有効フラグ |
| area | | エリア |
| manager | | 担当Mgr |
| business_type | | 業態 |
| ... | | 企業ごとに拡張 |

### report_groups シート
| 列 | 必須 | 説明 |
|----|------|------|
| group_id | ✓ | グループID |
| group_name | ✓ | 表示名 |
| filter_json | ✓ | JSONフィルタ |
| sort_key | ✓ | 並び順 |
| output_name | ✓ | 出力フォルダ名 |

---

## 5. 認証・セッション

### ログインフロー
```
1. 社員番号 + パスワード入力
2. POST /api/auth/login
   - respondentsから該当者を検索
   - password_hashを照合
   - 一致 → セッション作成
3. セッション情報:
   - respondent_id
   - emp_no
   - role
   - store_code
   - anonymous（匿名希望）
4. role別フォームにリダイレクト
```

### セッション設定（iron-session）
```typescript
const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: 'org-survey-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  },
};
```

---

## 6. データ保存（安全策）

### Append-Only 方式
- 回答は `responses/{survey_id}/responses.json` に配列で保存
- 新規回答は配列末尾に追加
- 同一 respondent_id + question_id の場合も追記（最新を正とする）

### 入力ガード
```typescript
// 送信時バリデーション
const required = ['respondent_id', 'role', 'store_code', 'survey_id'];
if (required.some(k => !data[k])) {
  return { error: 'Missing required fields' };
}
```

### 空白上書き防止
- スプレッドシートの空行/空列は無視
- 差分適用：既存データがある場合は上書きしない
- マスタ更新時はFingerprintで変更検知

---

## 7. 分析ロジック

### 基本集計
```typescript
// 分布計算
function computeDistribution(values: number[]): Distribution {
  const valid = values.filter(v => v != null);
  return {
    bottom2: valid.filter(v => v <= 2).length / valid.length,
    mid: valid.filter(v => v === 3).length / valid.length,
    top2: valid.filter(v => v >= 4).length / valid.length,
    n: valid.length,
  };
}

// 平均計算
function computeMean(values: number[]): number | null {
  const valid = values.filter(v => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
```

### 因子スコア（切替可能）
```typescript
// 方式1: 要素平均の平均
function factorScoreByElementMean(elements: ElementScore[]): number {
  const means = elements.map(e => e.mean).filter(m => m != null);
  return means.reduce((a, b) => a + b, 0) / means.length;
}

// 方式2: 全回答値の平均
function factorScoreByValueMean(values: number[]): number {
  return computeMean(values);
}
```

### 小サンプルマスク
```typescript
function maskIfSmallN<T>(value: T, n: number, settings: Settings): T | '***' {
  return n < settings.min_n_to_show ? '***' : value;
}
```

---

## 8. PDF納品生成

### 生成フロー
```
1. 管理画面で survey_id を選択
2. report_groups を取得
3. 各 group に対してループ:
   a. filter_json で対象者を絞り込み
   b. 回答データを集計
   c. PDF生成（@react-pdf/renderer）
   d. Drive にアップロード
   e. NotebookLMパック生成（設定ON時）
```

### 出力フォルダ構成
```
/Deliveries/{survey_id}/
├── 00_全社/
│   ├── report.pdf
│   ├── summary.csv
│   ├── questions_master.md
│   └── analysis_method.md
├── 01_エリア別_関東/
│   └── ...
└── 02_エリア別_関西/
    └── ...
```

### PDFメタ情報
```typescript
interface ReportMeta {
  survey_id: string;
  group_name: string;
  logic_version: string;
  org_version: string;
  generated_at: string;
  n_valid: number;
}
```

---

## 9. NotebookLM ソースパック

各groupフォルダに同梱（settings.notebooklm_pack = true時）:

| ファイル | 内容 |
|----------|------|
| questions_master.md | 要素/因子/設問文/尺度定義 |
| analysis_method.md | 欠損処理/分母/丸め/分布定義/因子集計方式 |
| summary.csv | 集計結果（要素別・因子別） |
| report.pdf | レポート本体 |

---

## 10. 環境変数

```bash
# Google Drive Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=

# フォルダID
APP_DATA_ROOT_FOLDER_ID=      # 回答データ保存
APP_SHARED_FOLDER_ID=         # 納品物保存
APP_SOURCE_FOLDER_ID=         # マスタスプレッド

# セッション
SESSION_PASSWORD=             # 32文字以上

# アプリ設定
NEXT_PUBLIC_APP_NAME="組織診断"
```

---

## 11. API設計

### 認証
| メソッド | パス | 説明 |
|----------|------|------|
| POST | /api/auth/login | ログイン |
| POST | /api/auth/logout | ログアウト |
| GET | /api/auth/me | セッション確認 |

### マスタ
| メソッド | パス | 説明 |
|----------|------|------|
| GET | /api/master/questions | 設問取得 |
| GET | /api/master/settings | 設定取得 |
| POST | /api/master/sync | マスタ同期 |

### 回答
| メソッド | パス | 説明 |
|----------|------|------|
| GET | /api/responses | 自分の回答取得 |
| POST | /api/responses | 回答保存 |
| GET | /api/responses/status | 回答状況 |

### 管理
| メソッド | パス | 説明 |
|----------|------|------|
| GET | /api/admin/surveys | サーベイ一覧 |
| POST | /api/admin/generate | PDF一括生成 |
| GET | /api/admin/progress | 生成進捗 |

---

## 12. 画面構成

### 回答者向け
1. **ログイン** (`/`) - 社員番号+パスワード
2. **回答フォーム** (`/survey`) - role別設問表示
3. **完了画面** (`/survey/complete`) - 提出完了

### 管理者向け
1. **ダッシュボード** (`/admin`) - 回答状況一覧
2. **納品生成** (`/admin/generate`) - PDF一括生成
3. **設定** (`/admin/settings`) - システム設定

---

## 13. 開発ステップ（MVP）

### Phase 1: 基盤
- [ ] Next.js プロジェクト作成
- [ ] Google Drive連携（部下評価から移植）
- [ ] 認証・セッション実装
- [ ] マスタ同期（スプレッド → JSON）

### Phase 2: 回答機能
- [ ] ログイン画面
- [ ] role別フォーム表示
- [ ] 回答保存（append-only）
- [ ] 回答ステータス管理

### Phase 3: 管理機能
- [ ] 管理ダッシュボード
- [ ] 回答状況確認
- [ ] PDF生成バッチ
- [ ] NotebookLMパック生成

### Phase 4: テスト・ドキュメント
- [ ] テストデータ作成
- [ ] 動作確認
- [ ] runbook作成

---

## 14. 今後の拡張

- 相関分析（全体相関/抽出相関）
- 未回答者一覧・回収率
- 兼務・所属履歴対応
- Excelゴールデンマスターテスト
