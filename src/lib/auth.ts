import { SessionOptions, getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { readJsonFile, findFileByName } from './drive';
import { Respondent, RespondentsMaster } from './types';

export interface SessionData {
  respondent_id: string;
  emp_no: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  store_code: string;
  name?: string;
  anonymous: boolean;
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD as string,
  cookieName: 'org-survey-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function verifyCredentials(emp_no: string, passwordPlain: string): Promise<Respondent | null> {
  // 開発用: owner/owner1/owner2/owner3 でログイン可能
  const devAccounts: Record<string, { role: 'MANAGER' | 'STAFF' | 'PA'; name: string }> = {
    'owner': { role: 'MANAGER', name: '開発用（店長）' },
    'owner1': { role: 'MANAGER', name: '開発用（店長）' },
    'owner2': { role: 'STAFF', name: '開発用（社員）' },
    'owner3': { role: 'PA', name: '開発用（PA）' },
  };

  if (emp_no in devAccounts && passwordPlain === emp_no) {
    const account = devAccounts[emp_no];
    return {
      respondent_id: `dev-${emp_no}`,
      emp_no: emp_no,
      role: account.role,
      store_code: 'DEV001',
      name: account.name,
      active: true,
      password_hash: hashPassword(emp_no),
    };
  }

  const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
  if (!rootId) throw new Error('APP_DATA_ROOT_FOLDER_ID undefined');

  // Find respondents.json directly in root folder
  const respondentsFile = await findFileByName('respondents.json', rootId, 'application/json');
  if (!respondentsFile) throw new Error('respondents.json not found');

  const data = await readJsonFile<RespondentsMaster>(respondentsFile.id!);
  const respondent = data.respondents.find(r => r.emp_no === emp_no && r.active);

  if (!respondent) return null;

  // Verify password
  const inputHash = hashPassword(passwordPlain);
  if (respondent.password_hash === inputHash) {
    return respondent;
  }

  return null;
}
