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
    // エラーメッセージのスタックトレースや詳細をログに出力し、レスポンスにも含める
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { 
        error: "AI分析に失敗しました。詳細はサーバーログを確認してください。",
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
