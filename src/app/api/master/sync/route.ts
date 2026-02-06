import { NextResponse } from 'next/server';
import {
  listFilesInFolder,
  findFileByName,
  readFileBuffer,
  saveJsonFile,
  ensureFolder
} from '@/lib/drive';
import { Respondent, OrgUnit, RespondentsMaster, OrgUnitsMaster } from '@/lib/types';
import crypto from 'crypto';

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function POST() {
  try {
    const sourceId = process.env.APP_SOURCE_FOLDER_ID;
    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!sourceId || !rootId) {
      return NextResponse.json({ error: 'Folder IDs not configured' }, { status: 500 });
    }

    // 既存フォルダに直接保存（サービスアカウントは新規フォルダ作成不可）
    const masterFolderId = rootId;
    const results: string[] = [];

    // ソースフォルダのファイル一覧を取得
    const sourceFiles = await listFilesInFolder(sourceId);

    // respondents CSV を探して変換
    const respondentsFile = sourceFiles.find(f =>
      f.name?.toLowerCase().includes('respondent') && f.mimeType === 'text/csv'
    );

    if (respondentsFile) {
      const csvBuffer = await readFileBuffer(respondentsFile.id!);
      const csvText = csvBuffer.toString('utf-8');
      const rows = parseCSV(csvText);

      const roleMap: Record<string, 'MANAGER' | 'STAFF' | 'PA'> = {
        '店長': 'MANAGER',
        'MANAGER': 'MANAGER',
        '社員': 'STAFF',
        'STAFF': 'STAFF',
        'PA': 'PA',
        'パート': 'PA',
        'アルバイト': 'PA',
      };

      const respondents: Respondent[] = rows.map((row, idx) => {
        const roleStr = row['role'] || row['区分'] || row['役割'] || 'STAFF';
        return {
          respondent_id: row['respondent_id'] || row['対象者ID'] || `R${String(idx + 1).padStart(5, '0')}`,
          emp_no: row['emp_no'] || row['社員番号'] || row['employeeNo'] || '',
          // テスト用: パスワードは社員番号と同じ（例: 10001）
          password_hash: hashPassword(row['emp_no'] || row['社員番号'] || ''),
          role: roleMap[roleStr] || 'STAFF',
          store_code: row['store_code'] || row['店舗コード'] || '',
          name: row['name'] || row['氏名'] || row['名前'] || undefined,
          email: row['email'] || row['メール'] || undefined,
          join_year: row['入社年'] ? parseInt(row['入社年']) : undefined,
          gender: row['gender'] || row['性別'] || undefined,
          age_band: row['age_band'] || row['年齢帯'] || undefined,
          anonymous: row['匿名希望'] === '匿名',
          active: row['有効'] !== '0' && row['active'] !== 'false',
        };
      });

      const master: RespondentsMaster = {
        respondents,
        updated_at: new Date().toISOString(),
      };

      // 既存ファイルがあれば更新、なければ新規作成
      const existingFile = await findFileByName('respondents.json', masterFolderId, 'application/json');
      await saveJsonFile(master, 'respondents.json', masterFolderId, existingFile?.id);
      results.push(`respondents.json: ${respondents.length}件`);
    }

    // org_units CSV を探して変換
    const orgUnitsFile = sourceFiles.find(f =>
      f.name?.toLowerCase().includes('org_unit') && f.mimeType === 'text/csv'
    );

    if (orgUnitsFile) {
      const csvBuffer = await readFileBuffer(orgUnitsFile.id!);
      const csvText = csvBuffer.toString('utf-8');
      const rows = parseCSV(csvText);

      const orgUnits: OrgUnit[] = rows.map(row => ({
        store_code: row['store_code'] || row['店舗コード'] || '',
        store_name: row['store_name'] || row['店舗名'] || '',
        active: row['有効'] !== '0' && row['active'] !== 'false',
        area: row['area'] || row['エリア'] || undefined,
        manager: row['manager'] || row['マネジャー'] || row['マネージャー'] || undefined,
        business_type: row['business_type'] || row['業態'] || undefined,
        dept: row['dept'] || row['部'] || row['部門'] || undefined,
        section: row['section'] || row['課'] || undefined,
      }));

      const master: OrgUnitsMaster = {
        org_units: orgUnits,
        updated_at: new Date().toISOString(),
      };

      const existingFile = await findFileByName('org_units.json', masterFolderId, 'application/json');
      await saveJsonFile(master, 'org_units.json', masterFolderId, existingFile?.id);
      results.push(`org_units.json: ${orgUnits.length}件`);
    }

    return NextResponse.json({
      success: true,
      synced: results,
      masterFolderId,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// CSVプレビュー用
export async function GET() {
  try {
    const sourceId = process.env.APP_SOURCE_FOLDER_ID;
    if (!sourceId) {
      return NextResponse.json({ error: 'APP_SOURCE_FOLDER_ID not set' }, { status: 500 });
    }

    const sourceFiles = await listFilesInFolder(sourceId);
    const previews: { name: string; rows: Record<string, string>[] }[] = [];

    for (const file of sourceFiles) {
      if (file.mimeType === 'text/csv') {
        const csvBuffer = await readFileBuffer(file.id!);
        const csvText = csvBuffer.toString('utf-8');
        const rows = parseCSV(csvText);
        previews.push({
          name: file.name!,
          rows: rows.slice(0, 3), // 先頭3行のみ
        });
      }
    }

    return NextResponse.json({ previews });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json({
      error: 'Preview failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
