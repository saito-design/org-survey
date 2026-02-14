import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function cleanEnvVar(val: string | undefined): string | undefined {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\\n/g, "\n");
}

async function testDrive() {
  console.log("--- Testing Google Drive API ---");
  const email = cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const key = cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY);
  
  if (!email || !key) {
    console.error("Drive credentials missing!");
    return;
  }
  
  console.log("Email:", email);
  
  const auth = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  
  const drive = google.drive({ version: "v3", auth });
  try {
    const res = await drive.files.list({ pageSize: 5 });
    console.log("Drive API Success! Found files:", res.data.files?.length);
  } catch (err: any) {
    console.error("Drive API Error:", err.message);
  }
}

async function testGemini() {
  console.log("\n--- Testing Gemini API ---");
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("Gemini API key missing!");
    return;
  }
  
  console.log("API Key exists (first 5 chars):", apiKey.substring(0, 5));
  
  const genAI = new GoogleGenerativeAI(cleanEnvVar(apiKey) || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  
  try {
    const result = await model.generateContent("Hello, how are you?");
    const response = await result.response;
    console.log("Gemini API Success! Response:", response.text().substring(0, 50) + "...");
  } catch (err: any) {
    console.error("Gemini API Error:", err.message);
  }
}

async function main() {
  await testDrive();
  await testGemini();
}

main();
