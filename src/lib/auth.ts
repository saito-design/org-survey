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
  is_admin: boolean;  // 管理者フラグ（サマリー閲覧可）
  is_owner?: boolean; // オーナーフラグ（エクスポート可）
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
  // 開発用: junestory/junestory1/junestory2/junestory3 でログイン可能
  // junestory はオーナー権限（エクスポート可）、junestory1 は管理者権限（閲覧のみ）
  const devAccounts: Record<string, { password: string; role: 'MANAGER' | 'STAFF' | 'PA'; name: string; is_admin: boolean; is_owner: boolean }> = {
    'junestory': { password: 'owner', role: 'MANAGER', name: 'オーナー', is_admin: true, is_owner: true },
    'junestory1': { password: 'junestory1', role: 'MANAGER', name: '店長・管理者', is_admin: true, is_owner: false },
    'junestory2': { password: 'junestory2', role: 'STAFF', name: '社員', is_admin: false, is_owner: false },
    'junestory3': { password: 'junestory3', role: 'PA', name: 'PA', is_admin: false, is_owner: false },
  };

  if (emp_no in devAccounts && passwordPlain === devAccounts[emp_no].password) {
    const account = devAccounts[emp_no];
    return {
      respondent_id: `dev-${emp_no}`,
      emp_no: emp_no,
      role: account.role,
      store_code: 'DEV001',
      name: account.name,
      active: true,
      password_hash: hashPassword(emp_no),
      is_admin: account.is_admin,
      is_owner: account.is_owner,
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
