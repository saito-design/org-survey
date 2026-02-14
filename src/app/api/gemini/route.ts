import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "GOOGLE_API_KEY is missing" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const prompt = body?.prompt;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json(
      { ok: false, error: "prompt (string) is required" },
      { status: 400 }
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
