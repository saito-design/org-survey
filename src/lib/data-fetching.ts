import { promises as fs } from 'fs';
import path from 'path';
import { findFileByName, readJsonFile, listFilesInFolder } from './drive';
import { PATHS } from './paths';
import { loadManifest } from './manifest';
import {
  Respondent,
  Question,
  Element,
  Factor,
  Response,
  RespondentsMaster,
  OrgUnit,
  OrgUnitsMaster,
} from './types';

export interface QuestionsData {
  questions: Question[];
  factors: Factor[];
  elements: Element[];
  updated_at: string;
}

export interface ResponsesData {
  responses: Response[];
  updated_at: string;
}

/**
 * ローカルの questions.json を読み込む
 */
export async function loadQuestionsLocal(): Promise<QuestionsData> {
  const questionsPath = path.join(process.cwd(), 'questions', 'questions.json');
  const content = await fs.readFile(questionsPath, 'utf-8');
  return JSON.parse(content) as QuestionsData;
}

/**
 * Drive から respondents.json を読み込む
 */
export async function loadRespondents(rootId: string): Promise<Respondent[]> {
  const file = await findFileByName(PATHS.RESPONDENTS_FILE, rootId, 'application/json');
  if (!file) return [];
  const data = await readJsonFile<RespondentsMaster>(file.id!);
  return data.respondents;
}

/**
 * Drive から org_units.json を読み込む
 */
export async function loadOrgUnits(rootId: string): Promise<OrgUnit[]> {
  const file = await findFileByName(PATHS.ORG_UNITS_FILE, rootId, 'application/json');
  if (!file) return [];
  const data = await readJsonFile<OrgUnitsMaster>(file.id!);
  return data.org_units;
}

/**
 * 旧形式の responses.json を読み込む（フォールバック用）
 */
async function loadOldResponses(rootId: string, surveyId: string): Promise<Response[]> {
  try {
    const responsesFolder = await findFileByName(PATHS.RESPONSES, rootId);
    if (!responsesFolder) return [];

    const surveyFolder = await findFileByName(surveyId, responsesFolder.id!);
    if (!surveyFolder) return [];

    const oldFile = await findFileByName('responses.json', surveyFolder.id!, 'application/json');
    if (!oldFile) return [];

    const data = await readJsonFile<ResponsesData>(oldFile.id!);
    return data.responses || [];
  } catch (e) {
    console.warn('Failed to load old responses.json', e);
    return [];
  }
}

/**
 * Drive から回答データを読み込む（1人1JSON + manifest対応 + 旧データ併存）
 */
export async function loadResponses(rootId: string, surveyId: string): Promise<Response[]> {
  const manifestEntries = await loadManifest(rootId, surveyId);
  const responsesFolder = await findFileByName(PATHS.RESPONSES, rootId);
  
  let byRespondentFolderId: string | undefined;
  if (responsesFolder) {
    const surveyFolder = await findFileByName(surveyId, responsesFolder.id!);
    if (surveyFolder) {
        const f = await findFileByName(PATHS.BY_RESPONDENT, surveyFolder.id!);
        byRespondentFolderId = f?.id || undefined;
    }
  }

  let fileIds: string[] = [];
  if (manifestEntries.length > 0) {
    // マニフェストに記載があるファイルのみを読み込む
    fileIds = manifestEntries.map(e => e.file_id).filter(Boolean);
  }
  // ※ ここで byRespondentFolderId の全件リスト読込を行わないように変更。
  // 大規模データの場合に Vercel でタイムアウトするため。
  // 過去の個別回答は manifest に登録されるか、一括 responses.json に含まれる運用とする。

  const newResponsesProm = Promise.all(
    fileIds.map(async (fileId) => {
      try {
        const data = await readJsonFile<ResponsesData>(fileId);
        return data?.responses || [];
      } catch (e) {
        console.warn('skip broken response file', fileId, e);
        return [];
      }
    })
  ).then(results => results.flat());

  const oldResponsesProm = loadOldResponses(rootId, surveyId);
  const [newResponses, oldResponses] = await Promise.all([newResponsesProm, oldResponsesProm]);

  const map = new Map<string, Response[]>();
  for (const r of oldResponses) {
    if (!map.has(r.respondent_id)) map.set(r.respondent_id, []);
    map.get(r.respondent_id)!.push(r);
  }

  const newRespondentIds = new Set<string>();
  for (const r of newResponses) newRespondentIds.add(r.respondent_id);
  for (const id of newRespondentIds) map.delete(id);

  for (const r of newResponses) {
    if (!map.has(r.respondent_id)) map.set(r.respondent_id, []);
    map.get(r.respondent_id)!.push(r);
  }

  const all: Response[] = [];
  for (const list of map.values()) all.push(...list);
  return all;
}
