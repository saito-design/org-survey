import { NextResponse } from "next/server";

export async function GET() {
  const hasKey = !!process.env.GOOGLE_API_KEY;
  return NextResponse.json({ ok: true, hasKey });
}
