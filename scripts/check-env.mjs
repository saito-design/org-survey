import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf8');

console.log('--- .env.local content preview ---');
content.split('\n').forEach(line => {
  if (line.startsWith('GOOGLE_SERVICE_ACCOUNT_EMAIL') || line.startsWith('GOOGLE_API_KEY') || line.startsWith('GEMINI_API_KEY')) {
    console.log(line);
  }
});

import * as dotenv from 'dotenv';
dotenv.config({ path: envPath });

console.log('\n--- Processed Env Variables ---');
console.log('GOOGLE_SERVICE_ACCOUNT_EMAIL:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY);
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY);
