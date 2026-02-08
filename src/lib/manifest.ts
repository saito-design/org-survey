import { findFileByName, readJsonFile, saveJsonFile, ensureFolder, listFilesInFolder } from './drive';
import { ManifestData, ManifestEntry, Respondent } from './types';
import { PATHS } from './paths';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1秒

/**
 * sleep関数
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Manifestを読み込む
 */
export async function loadManifest(rootId: string, surveyId: string): Promise<ManifestEntry[]> {
  try {
    const indexesFolder = await findFileByName(PATHS.INDEXES, rootId);
    if (!indexesFolder) return [];

    const surveyIndexFolder = await findFileByName(surveyId, indexesFolder.id!);
    if (!surveyIndexFolder) return [];

    const manifestFile = await findFileByName(PATHS.MANIFEST_FILE, surveyIndexFolder.id!, 'application/json');
    if (!manifestFile) return [];

    const data = await readJsonFile<ManifestData>(manifestFile.id!);
    return data.entries || [];
  } catch (error) {
    console.error('Error loading manifest:', error);
    return [];
  }
}

/**
 * 利用可能なサーベイID（フォルダ名）の一覧を取得する
 * indexesフォルダとresponsesフォルダの両方を確認して統合
 */
export async function listSurveyIds(rootId: string): Promise<string[]> {
  const surveyIdSet = new Set<string>();
  const surveyIdPattern = /^\d{4}-\d{2}$/;

  try {
    // 1) indexesフォルダからサーベイIDを取得
    const indexesFolder = await findFileByName(PATHS.INDEXES, rootId);
    if (indexesFolder?.id) {
      const indexFiles = await listFilesInFolder(indexesFolder.id, `mimeType='application/vnd.google-apps.folder'`);
      for (const f of indexFiles) {
        if (f.name && surveyIdPattern.test(f.name)) {
          surveyIdSet.add(f.name);
        }
      }
    }

    // 2) responsesフォルダからもサーベイIDを取得（フォールバック＆補完）
    const responsesFolder = await findFileByName(PATHS.RESPONSES, rootId);
    if (responsesFolder?.id) {
      const respFiles = await listFilesInFolder(responsesFolder.id, `mimeType='application/vnd.google-apps.folder'`);
      for (const f of respFiles) {
        if (f.name && surveyIdPattern.test(f.name)) {
          surveyIdSet.add(f.name);
        }
      }
    }

    // 降順ソート（新しい順）
    return Array.from(surveyIdSet).sort().reverse();
  } catch (error) {
    console.error('Error listing survey IDs:', error);
    return [];
  }
}

/**
 * Manifestへのエントリ追加・更新（リトライロジック付き）
 */
export async function upsertManifest(args: {
  rootId: string;
  surveyId: string;
  respondent: Respondent;
  responseFileId: string;
  updatedAt: string;
}): Promise<void> {
  const { rootId, surveyId, respondent, responseFileId, updatedAt } = args;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      // 1. フォルダ確保
      const indexesFolder = await ensureFolder(PATHS.INDEXES, rootId);
      const surveyIndexFolder = await ensureFolder(surveyId, indexesFolder);

      // 2. 最新のManifestを読み込み
      const manifestFile = await findFileByName(PATHS.MANIFEST_FILE, surveyIndexFolder, 'application/json');
      let manifest: ManifestData = { entries: [], updated_at: updatedAt };

      if (manifestFile) {
        try {
          manifest = await readJsonFile<ManifestData>(manifestFile.id!);
        } catch (e) {
          console.warn('Failed to read existing manifest, starting fresh', e);
          // 読み込み失敗時は空からスタート（リスクはあるが進行優先）
        }
      }

      // 3. エントリ作成
      const nextEntry: ManifestEntry = {
        respondent_id: respondent.respondent_id,
        file_id: responseFileId,
        survey_id: surveyId,
        role: respondent.role,
        store_code: respondent.store_code,
        updated_at: updatedAt,
      };

      // 4. マージ（Mapでupsert）
      const map = new Map<string, ManifestEntry>();
      if (manifest.entries && Array.isArray(manifest.entries)) {
        for (const e of manifest.entries) {
          map.set(e.respondent_id, e);
        }
      }
      map.set(nextEntry.respondent_id, nextEntry);

      const merged: ManifestData = {
        entries: Array.from(map.values()),
        updated_at: updatedAt,
      };

      // 5. 保存
      await saveJsonFile(
        merged,
        PATHS.MANIFEST_FILE,
        surveyIndexFolder,
        manifestFile?.id || undefined
      );

      // 成功したら終了
      return;

    } catch (error) {
      attempt++;
      console.warn(`Manifest upsert failed (attempt ${attempt}/${MAX_RETRIES}):`, error);
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Failed to upsert manifest after ${MAX_RETRIES} attempts: ${error}`);
      }
      // リトライ待ち
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}
