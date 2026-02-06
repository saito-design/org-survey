import { NextResponse } from 'next/server';
import { saveJsonFile, listFilesInFolder } from '@/lib/drive';

// 共有ドライブへの書き込みテスト用エンドポイント
export async function POST() {
  try {
    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) {
      return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });
    }

    // テスト用のシンプルなJSONファイルを作成
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'Drive write test successful!',
    };

    const result = await saveJsonFile(testData, 'test.json', rootId);

    // ファイルリストを取得して確認
    const files = await listFilesInFolder(rootId);

    return NextResponse.json({
      success: true,
      savedFile: result,
      filesInFolder: files.map(f => ({ name: f.name, id: f.id })),
    });
  } catch (error) {
    console.error('Test write error:', error);
    return NextResponse.json({
      error: 'Write test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
