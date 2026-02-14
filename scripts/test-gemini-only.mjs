import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Gemini API key missing!');
    process.exit(1);
  }
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  try {
    const result = await model.generateContent('Say hello in Japanese.');
    const response = await result.response;
    console.log('Gemini API Success! Response:', response.text().trim());
  } catch (err) {
    console.error('Gemini API Error:', err.message);
    process.exit(1);
  }
}

run();
