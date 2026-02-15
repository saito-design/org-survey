import { GoogleGenerativeAI } from "@google/generative-ai";
import { SurveySummary, AiAnalysis, IndicatorScore } from "./types";

export interface AiAnalysisInput {
  current: SurveySummary;
  previous?: SurveySummary;
  beforePrevious?: SurveySummary;
  overallAvg?: SurveySummary;
}

/**
 * 集計結果からAIによる要約分析を生成する
 */
export async function analyzeSurveyWithAi(input: AiAnalysisInput): Promise<AiAnalysis> {
  // AI専用のキー（GEMINI_API_KEY）を優先的に探し、なければ汎用の GOOGLE_API_KEY を探す
  const geminiKey = process.env.GEMINI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  
  // 優先順位: GEMINI_API_KEY > GOOGLE_API_KEY
  let apiKey = geminiKey || googleKey;
  const keySource = geminiKey ? "GEMINI_API_KEY" : "GOOGLE_API_KEY";

  if (!apiKey) {
    throw new Error("APIキーが環境変数に設定されていません。");
  }

  apiKey = apiKey.trim();

  const genAI = new GoogleGenerativeAI(apiKey);
  const { current, overallAvg } = input;

  const prompt = `
あなたは組織診断と経営コンサルティングの専門家です。
以下の集計結果に基づき、組織の現状を分析し、**極めて簡潔に** 報告してください。

### 集計データ
1. 指標スコア (n=${current.n}):
   ${current.indicatorScores?.map((k: IndicatorScore) => `- ${k.indicator_name}: ${k.mean?.toFixed(2)} (ネガ比: ${(k.distribution.bottom2 * 100).toFixed(1)}%)`).join('\n   ')}

2. 特出すべき詳細設問:
   - 低い: ${current.weaknesses.slice(0, 3).map(w => w.element_name).join(', ')}
   - 高い: ${current.strengths.slice(0, 3).map(s => s.element_name).join(', ')}

${overallAvg ? `3. 全体平均との比較:
   - 各指標の乖離: ${overallAvg.indicatorScores?.map((oa: IndicatorScore) => {
     const cur = current.indicatorScores?.find((k: IndicatorScore) => k.indicator_id === oa.indicator_id);
     const diff = cur && cur.mean ? cur.mean - (oa.mean ?? 0) : 0;
     return `${oa.indicator_name}(${diff > 0 ? '+' : ''}${diff.toFixed(2)})`;
   }).join(', ')}` : ''}

### 指示事項（厳守）
1. **強み・課題**: それぞれ **厳選した2〜3個のみ** を挙げてください。1項目20文字程度で端的に記述してください。
2. **総評**: 文章ではなく、**箇条書きで2〜3個のみ**記述してください。現状の核心を突く指摘や改善の方向性を各30文字程度で示してください。
3. **回答形式**: 以下のJSONフォーマットで回答してください。

\`\`\`json
{
  "strengths": ["強み1", "強み2"],
  "weaknesses": ["課題1", "課題2"],
  "general_comment": "・箇条書き1\n・箇条書き2\n・箇条書き3"
}
\`\`\`

日本語で回答してください。
`;

  // 診断結果に基づき、確実に存在するモデル名のリスト（優先順位順）
  const modelNames = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest", "gemini-pro-latest"];
  let lastError: any = null;

  for (const modelName of modelNames) {
    try {
      console.log(`Trying AI model: ${modelName}...`);
      // 診断結果より 2.0-flash などが v1/v1beta 両方で存在することを確認済み
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // JSON部分のみを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`AI(${modelName}) からの回答をJSONとして解析できませんでした。`);
      }
      
      return JSON.parse(jsonMatch[0]) as AiAnalysis;
    } catch (error: any) {
      console.warn(`AI model ${modelName} failed:`, error.message);
      lastError = error;
      // 次のモデルを試行
      continue;
    }
  }

  // すべてのモデルで失敗した場合
  throw lastError || new Error("利用可能なすべてのAIモデルで試行しましたが、接続に失敗しました。");
}
