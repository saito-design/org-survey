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
    console.error("AI Analysis API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze survey" },
      { status: 500 }
    );
  }
}
