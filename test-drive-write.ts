// Drive書き込みテスト用スクリプト
import { saveJsonFile, listFilesInFolder } from './src/lib/drive';

async function testDriveWrite() {
  const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
  if (!rootId) {
    console.error('APP_DATA_ROOT_FOLDER_ID not set');
    process.exit(1);
  }

  console.log('Testing drive write to:', rootId);

  // テスト用のシンプルなJSONファイルを作成
  const testData = {
    test: true,
    timestamp: new Date().toISOString(),
    message: 'Drive write test successful!',
  };

  try {
    console.log('Attempting to save test.json...');
    const result = await saveJsonFile(testData, 'test.json', rootId);
    console.log('SUCCESS! File saved:', result);

    // ファイルリストを取得して確認
    console.log('\nListing files in folder...');
    const files = await listFilesInFolder(rootId);
    console.log('Files found:', files.map(f => f.name));

  } catch (error) {
    console.error('FAILED:', error);
    process.exit(1);
  }
}

testDriveWrite();
