import { GoogleGenerativeAI } from "@google/generative-ai";
import { SurveySummary, AiAnalysis } from "./types";

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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("APIキー（GEMINI_API_KEY または GOOGLE_API_KEY）が環境変数に設定されていません。");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const { current, previous, beforePrevious, overallAvg } = input;

  const prompt = `
あなたは組織診断と経営コンサルティングの専門家です。
以下のアンケート集計結果（組織診断データ）に基づき、現状の分析、課題の特定、および具体的な改善対策を提案してください。

### 集計データ
1. 今回のスコア (n=${current.n}):
   - 総合スコア: ${current.overallScore?.toFixed(2) ?? "N/A"}
   - カテゴリスコア:
     ${current.categoryScores?.map(c => `- ${c.category_name}: ${c.mean?.toFixed(2)} (ネガティブ回答率: ${(c.distribution.bottom2 * 100).toFixed(1)}%)`).join('\n     ')}
   - 特に低い設問（課題）:
     ${current.weaknesses.map(w => `- ${w.element_name}: ${w.mean.toFixed(2)} (順位: ${w.rank})`).join('\n     ')}
   - 特に高い設問（強み）:
     ${current.strengths.map(s => `- ${s.element_name}: ${s.mean.toFixed(2)} (順位: ${s.rank})`).join('\n     ')}

${overallAvg ? `2. 全体平均（ベンチマーク）:
   - 総合スコア: ${overallAvg.overallScore?.toFixed(2)}
   - 各カテゴリの乖離:
     ${overallAvg.categoryScores?.map(oa => {
       const cur = current.categoryScores?.find(c => c.category_id === oa.category_id);
       const diff = cur && cur.mean ? cur.mean - (oa.mean ?? 0) : 0;
       return `- ${oa.category_name}: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`;
     }).join('\n     ')}` : ''}

${previous ? `3. 過去との比較 (時系列傾向):
   - 前回総合スコア: ${previous.overallScore?.toFixed(2)} (今回比: ${((current.overallScore ?? 0) - (previous.overallScore ?? 0)).toFixed(2)})
   ${beforePrevious ? `- 前々回総合スコア: ${beforePrevious.overallScore?.toFixed(2)}` : ''}` : ''}

### 指示事項
1. **現状分析**: スコアの絶対値だけでなく、全体平均との乖離や過去からの変化に着目し、組織で今何が起きているかを具体的に推察してください。
2. **課題の深掘り**: 特にスコアが低い設問内容から、現場のどのような行動や意識が不足しているかを専門的な視点で分析してください。
3. **具体的な対策案**: 精神論ではなく、明日から取り組めるような実効性のある具体的な対策（店長の関わり方、オペレーション、制度面など）を3つ以上提案してください。
4. **回答形式**: 以下のJSONフォーマットで回答してください。

\`\`\`json
{
  "strengths": ["強みの分析結果1", "2", ...],
  "weaknesses": ["課題の具体的な分析1", "2", ...],
  "general_comment": "現状の総評、時系列の変化、および具体的で実効性のある具体的な対策案（3つ以上の箇条書きを含む）"
}
\`\`\`

日本語で回答してください。
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // JSON部分のみを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AI Response text raw:", text);
      throw new Error("AIからの回答をJSONとして解析できませんでした。");
    }
    
    return JSON.parse(jsonMatch[0]) as AiAnalysis;
  } catch (error: any) {
    console.error("Detailed Gemini Analysis Error:", error);
    throw error;
  }
}
