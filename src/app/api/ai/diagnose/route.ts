import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const apiKey = geminiKey || googleKey;

  if (!apiKey) {
    return NextResponse.json({ 
      ok: false, 
      error: "APIキーが設定されていません。" 
    }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    // listModels() を試行
    // 注意: SDKバージョンによっては listModels が利用できない場合があるため、
    // 手動で fetch することも検討しますが、まずはSDKの機能を試します。
    
    // @ts-ignore
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
    const data = await response.json();

    return NextResponse.json({
      ok: true,
      usedKeyName: geminiKey ? "GEMINI_API_KEY" : "GOOGLE_API_KEY",
      keyEnd: apiKey.trim().slice(-4),
      availableModels: data.models || data,
      rawResponse: data
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
