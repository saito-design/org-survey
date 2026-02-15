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
    
    // エラー詳細にプラン変更に関するアドバイスを追加
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    const keyInfo = apiKey ? `(Key: ...${apiKey.slice(-4)})` : "(Key not found)";

    return NextResponse.json(
      { 
        error: "AI分析に失敗しました。プラン変更直後の反映待ちか、APIキーの設定を再確認してください。",
        details: `${errorMessage} ${keyInfo}`
      },
      { status: 500 }
    );
  }
}
