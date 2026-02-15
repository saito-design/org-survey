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
    
    // 環境変数の詳細を特定
    const geminiKey = process.env.GEMINI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;
    const usedKey = geminiKey || googleKey || "";
    const keyName = geminiKey ? "GEMINI_API_KEY" : (googleKey ? "GOOGLE_API_KEY" : "None");
    const keyInfo = usedKey ? `(Used: ${keyName}, End: ...${usedKey.trim().slice(-4)})` : "(No key found)";

    return NextResponse.json(
      { 
        error: "AI分析に失敗しました。プラン反映待ちか、Vercelの環境変数設定を確認してください。",
        details: `${errorMessage} ${keyInfo}`
      },
      { status: 500 }
    );
  }
}
