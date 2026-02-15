import { NextRequest, NextResponse } from "next/server";
import { analyzeSurveyWithAi, AiAnalysisInput } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const input = (await req.json()) as AiAnalysisInput;

    if (!input || !input.current) {
      return NextResponse.json(
        { error: "Current summary data is required" },
        { status: 400 }
      );
    }

    const analysis = await analyzeSurveyWithAi(input);
    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error("AI Analysis API Error details:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // APIキーの有無と末尾を確認するための情報を追加
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    let keyInfo = apiKey ? `(Key: ...${apiKey.slice(-4)})` : "(Key not found)";

    // デバッグ：利用可能なモデルを無理やり取得してみる試み
    let availableModels = "";
    try {
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        // listModels は認証エラーやAPI無効時に適切なエラーを返すため、それ自体を情報源にする
        const modelList = await genAI.getGenerativeModel({model:"gemini-1.5-flash"}).listModels?.() || [];
        // @ts-ignore
        availableModels = " Available models: " + (modelList.models?.map(m => m.name).join(", ") || "none");
      }
    } catch (e) {}

    return NextResponse.json(
      { 
        error: "AI分析に失敗しました。APIの設定を確認してください。",
        details: `${errorMessage} ${keyInfo}${availableModels}`
      },
      { status: 500 }
    );
  }
}
