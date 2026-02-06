import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { Readable } from "stream";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

if (
  !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !process.env.GOOGLE_PRIVATE_KEY
) {
  console.warn(
    "Google Drive credentials are not set in environment variables.",
  );
}

function cleanEnvVar(val: string | undefined): string | undefined {
  if (!val) return undefined;
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.substring(1, clean.length - 1);
  }
  return clean.replace(/\\n/g, "\n");
}

const auth = new JWT({
  email: cleanEnvVar(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
  key: cleanEnvVar(process.env.GOOGLE_PRIVATE_KEY),
  scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });

/**
 * Lists files in a specific folder.
 */
export async function listFilesInFolder(
  folderId: string,
  q?: string,
  orderBy: string = "modifiedTime desc",
) {
  try {
    const query = `'${folderId}' in parents and trashed = false${q ? ` and ${q}` : ""}`;
    // 共有ドライブ対応：driveIdが0から始まる場合は共有ドライブとして扱う
    const isSharedDrive = folderId.startsWith("0A");
    const res = await drive.files.list({
      q: query,
      fields:
        "files(id, name, mimeType, webViewLink, createdTime, modifiedTime, version, md5Checksum, headRevisionId)",
      orderBy: orderBy,
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      ...(isSharedDrive && { driveId: folderId, corpora: "drive" }),
    });
    return res.data.files || [];
  } catch (error) {
    console.error("Error listing files:", error);
    throw error;
  }
}

/**
 * Finds a single file by exact name in a folder.
 */
export async function findFileByName(
  name: string,
  folderId: string,
  mimeType?: string,
) {
  let q = `name = '${name}'`;
  if (mimeType) {
    q += ` and mimeType = '${mimeType}'`;
  }
  const files = await listFilesInFolder(folderId, q, "modifiedTime desc");
  if (files.length === 0) return null;
  return files[0];
}

/**
 * Reads a file content as Buffer.
 */
export async function readFileBuffer(fileId: string): Promise<Buffer> {
  try {
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  } catch (error) {
    console.error(`Error reading file buffer ${fileId}:`, error);
    throw error;
  }
}

/**
 * Export a Google Doc (Spreadsheet) to string (e.g. CSV).
 */
export async function exportFileToString(
  fileId: string,
  mimeType: string,
): Promise<string> {
  try {
    const res = await drive.files.export(
      { fileId, mimeType },
      { responseType: "text" },
    );
    return res.data as string;
  } catch (error) {
    console.error(`Error exporting file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Export a Google Doc (Spreadsheet) to Buffer (e.g. XLSX).
 */
export async function exportFileToBuffer(
  fileId: string,
  mimeType: string,
): Promise<Buffer> {
  try {
    const res = await drive.files.export(
      { fileId, mimeType },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  } catch (error) {
    console.error(`Error exporting file buffer ${fileId}:`, error);
    throw error;
  }
}

/**
 * Reads a JSON file content from Drive.
 */
export async function readJsonFile<T>(fileId: string): Promise<T> {
  try {
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "json" },
    );
    return res.data as T;
  } catch (error) {
    console.error(`Error reading file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Uploads (creates or updates) a JSON file.
 */
export async function saveJsonFile(
  data: unknown,
  filename: string,
  folderId?: string,
  existingFileId?: string,
) {
  return saveFile(
    JSON.stringify(data, null, 2),
    filename,
    "application/json",
    folderId,
    existingFileId,
  );
}

/**
 * Uploads (creates or updates) a generic file.
 */
export async function saveFile(
  content: string | Buffer,
  filename: string,
  mimeType: string,
  folderId?: string,
  existingFileId?: string,
) {
  const media = {
    mimeType: mimeType,
    body:
      typeof content === "string"
        ? Readable.from([content])
        : Readable.from(content),
  };

  try {
    if (existingFileId) {
      const res = await drive.files.update({
        fileId: existingFileId,
        media: media,
        fields: "id, name, webViewLink",
        supportsAllDrives: true,
      });
      return res.data;
    } else {
      if (!folderId)
        throw new Error("Folder ID is required for creating a new file");
      const res = await drive.files.create({
        requestBody: {
          name: filename,
          parents: [folderId],
          mimeType: mimeType,
        },
        media: media,
        fields: "id, name, webViewLink",
        supportsAllDrives: true,
      });
      return res.data;
    }
  } catch (error) {
    console.error(`Error saving file ${filename}:`, error);
    throw error;
  }
}

/**
 * Creates a folder if it doesn't exist.
 */
export async function ensureFolder(
  folderName: string,
  parentId: string,
): Promise<string> {
  const existing = await findFileByName(folderName, parentId);
  if (existing) return existing.id!;

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id!;
}
