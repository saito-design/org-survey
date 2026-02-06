import { NextResponse } from 'next/server';
import { listFilesInFolder } from '@/lib/drive';

export async function GET() {
  try {
    const folderId = process.env.APP_SOURCE_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json({ error: 'APP_SOURCE_FOLDER_ID not set' }, { status: 500 });
    }

    const files = await listFilesInFolder(folderId);

    return NextResponse.json({
      folder_id: folderId,
      files: files.map(f => ({
        name: f.name,
        id: f.id,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
      })),
    });
  } catch (error) {
    console.error('Setup check error:', error);
    return NextResponse.json({
      error: 'Failed to access Drive',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
