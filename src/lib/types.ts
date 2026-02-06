// 対象者
export interface Respondent {
  respondent_id: string;
  emp_no: string;
  password_hash: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  store_code: string;
  name?: string;
  email?: string;
  join_year?: number;
  gender?: string;
  age_band?: string;
  anonymous?: boolean;
  active: boolean;
}

// 組織単位
export interface OrgUnit {
  store_code: string;
  store_name: string;
  active: boolean;
  area?: string;
  manager?: string;
  business_type?: string;
  dept?: string;
  section?: string;
  [key: string]: unknown;
}

// 納品単位
export interface ReportGroup {
  group_id: string;
  group_name: string;
  filter_json: Record<string, string>;
  sort_key: number;
  output_name: string;
}

// 設問
export interface Question {
  question_id: string;
  factor_id: string;
  element_id: string;
  text: string;
  scale: '5point' | '4point' | 'binary';
  roles: ('MANAGER' | 'STAFF' | 'PA')[];
  order: number;
}

// 因子
export interface Factor {
  factor_id: string;
  factor_name: string;
  order: number;
}

// 要素
export interface Element {
  element_id: string;
  element_name: string;
  factor_id: string;
  order: number;
}

// 回答
export interface Response {
  response_id: string;
  survey_id: string;
  respondent_id: string;
  question_id: string;
  value: number | null;
  created_at: string;
  submitted_at?: string;
}

// 設定
export interface Settings {
  min_n_to_show: number;
  anonymize_output: boolean;
  notebooklm_pack: boolean;
  factor_aggregation: 'element_mean' | 'value_mean';
}

// マスタデータ（Driveに保存される形式）
export interface RespondentsMaster {
  respondents: Respondent[];
  updated_at: string;
}

export interface OrgUnitsMaster {
  org_units: OrgUnit[];
  updated_at: string;
}

export interface QuestionsMaster {
  questions: Question[];
  factors: Factor[];
  elements: Element[];
  updated_at: string;
}

export interface ReportGroupsMaster {
  report_groups: ReportGroup[];
  updated_at: string;
}

// 集計結果
export interface Distribution {
  bottom2: number;
  mid: number;
  top2: number;
  n: number;
}

export interface ElementScore {
  element_id: string;
  element_name: string;
  mean: number | null;
  distribution: Distribution;
}

export interface FactorScore {
  factor_id: string;
  factor_name: string;
  mean: number | null;
  elements: ElementScore[];
}

// PDF用メタ情報
export interface ReportMeta {
  survey_id: string;
  group_name: string;
  logic_version: string;
  org_version: string;
  generated_at: string;
  n_valid: number;
}
