import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName } from '@/lib/drive';
import { loadRespondents, loadOrgUnits, loadResponses } from '@/lib/data-fetching';

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: 'Deployment confirmed. If you see this, auth bypass is working.' });
}
