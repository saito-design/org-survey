import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    respondent_id: session.respondent_id,
    emp_no: session.emp_no,
    role: session.role,
    store_code: session.store_code,
    name: session.anonymous ? undefined : session.name,
    anonymous: session.anonymous,
  });
}
