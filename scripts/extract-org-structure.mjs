import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
config({ path: '.env.local' });

function cleanEnvVar(val) {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\\n/g, '\n');
}

const auth = new JWT({
  email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

const res = await drive.files.get({
  fileId: '1mHiesVLr6LDLxeoNJXzdSCemK2EPJBqD',
  alt: 'media',
  supportsAllDrives: true
}, { responseType: 'text' });

const lines = res.data.split('\n');
const headers = lines[2].split(','); // 3行目がヘッダー

// ヘッダーからインデックスを取得
const idx = {};
headers.forEach((h, i) => idx[h] = i);

console.log('=== 組織構成分析 ===\n');

// ユニークな値を収集
const orgData = {
  hq: new Set(),           // 事業本部
  dept: new Set(),         // 事業部
  section: new Set(),      // 課
  area: new Set(),         // エリア
  business_type: new Set(), // 業態
  stores: new Map(),       // 事業所（詳細情報付き）
};

// データ行を解析（4行目以降）
for (let i = 3; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < 20) continue;

  const hq = cols[idx['事業本部名']]?.replace(/"/g, '') || '';
  const dept = cols[idx['事業部名']]?.replace(/"/g, '') || '';
  const section = cols[idx['課名']]?.replace(/"/g, '') || '';
  const area = cols[idx['エリア名']]?.replace(/"/g, '') || '';
  const businessType = cols[idx['業態名']]?.replace(/"/g, '') || '';
  const storeCode = cols[idx['事業所コード']]?.replace(/"/g, '') || '';
  const storeName = cols[idx['事業所名']]?.replace(/"/g, '') || '';

  if (hq) orgData.hq.add(hq);
  if (dept) orgData.dept.add(dept);
  if (section) orgData.section.add(section);
  if (area) orgData.area.add(area);
  if (businessType) orgData.business_type.add(businessType);

  if (storeCode && !orgData.stores.has(storeCode)) {
    orgData.stores.set(storeCode, {
      store_code: storeCode,
      store_name: storeName,
      hq: hq,
      dept: dept,
      section: section,
      area: area,
      business_type: businessType,
      active: true
    });
  }
}

console.log('事業本部:', Array.from(orgData.hq));
console.log('事業部:', Array.from(orgData.dept));
console.log('課:', Array.from(orgData.section));
console.log('エリア:', Array.from(orgData.area));
console.log('業態:', Array.from(orgData.business_type));
console.log('事業所数:', orgData.stores.size);

// 新しいOrgUnits形式を出力
const newOrgUnits = {
  org_units: Array.from(orgData.stores.values()),
  updated_at: new Date().toISOString()
};

writeFileSync('setup/org_units_new.json', JSON.stringify(newOrgUnits, null, 2));
console.log('\n新しいOrgUnitsをsetup/org_units_new.jsonに保存しました');
console.log('サンプル:', JSON.stringify(Array.from(orgData.stores.values())[0], null, 2));
