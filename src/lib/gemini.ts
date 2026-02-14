import { GoogleGenerativeAI } from "@google/generative-ai";
import { SurveySummary, AiAnalysis } from "./types";

/**
 * 集計結果からAIによる要約分析を生成する
 */
export async function analyzeSurveyWithAi(summary: SurveySummary): Promise<AiAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("APIキー（GEMINI_API_KEY または GOOGLE_API_KEY）が環境変数に設定されていません。");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // AIに渡すデータを最小限に絞る（セキュリティとトークン節約のため）
  const dataForAi = {
    overallScore: summary.overallScore,
    topStrengths: summary.strengths.map(s => ({ name: s.element_name, score: s.mean })),
    bottomWeaknesses: summary.weaknesses.map(w => ({ name: w.element_name, score: w.mean })),
    factorScores: summary.factorScores.map(f => ({ name: f.factor_name, score: f.mean }))
  };

  const prompt = `
あなたは組織診断プロフェッショナルの分析官です。
以下の組織診断の集計結果（5点満点）を読み取り、組織の現状を分析してください。

集計データ:
${JSON.stringify(dataForAi, null, 2)}

指示:
1. 組織の「いいところ（強み）」を3つ、20文字以内で端的に挙げてください。
2. 組織の「課題点」を3つ、20文字以内で端的に挙げてください。
3. 全体的な傾向についての短い総評（60文字以内）を1つ作成してください。

出力形式は必ず以下のJSON形式にしてください。他のテキストは含めないでください。
{
  "strengths": ["強み1", "強み2", "強み3"],
  "weaknesses": ["課題1", "課題2", "課題3"],
  "general_comment": "総評テキスト"
}
`;

  try {
    console.log("Starting Gemini Analysis...");
    console.log("Using API Key (first 5):", apiKey.substring(0, 5) + "...");
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log("Gemini Response received.");
    
    // JSON部分のみを抽出（念のため）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AI Response text:", text);
      throw new Error("Failed to parse AI response as JSON");
    }
    
    return JSON.parse(jsonMatch[0]) as AiAnalysis;
  } catch (error: any) {
    console.error("Detailed Gemini Analysis Error:", {
      message: error.message,
      stack: error.stack,
      status: error.status,
      statusText: error.statusText,
      errorDetails: error.errorDetails,
    });
    throw error;
  }
}
