import { NextRequest, NextResponse } from 'next/server';
import { getSession, verifyCredentials } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { emp_no, password, anonymous } = await req.json();

    if (!emp_no || !password) {
      return NextResponse.json(
        { error: '社員番号とパスワードを入力してください' },
        { status: 400 }
      );
    }

    const respondent = await verifyCredentials(emp_no, password);

    if (!respondent) {
      return NextResponse.json(
        { error: '社員番号またはパスワードが正しくありません' },
        { status: 401 }
      );
    }

    // セッション保存
    const session = await getSession();
    session.respondent_id = respondent.respondent_id;
    session.emp_no = respondent.emp_no;
    session.role = respondent.role;
    session.store_code = respondent.store_code;
    session.name = respondent.name;
    session.anonymous = anonymous || respondent.anonymous || false;
    session.isLoggedIn = true;
    session.is_admin = respondent.is_admin ?? false;
    await session.save();

    return NextResponse.json({
      success: true,
      is_admin: respondent.is_admin ?? false,
      respondent: {
        respondent_id: respondent.respondent_id,
        role: respondent.role,
        name: anonymous ? undefined : respondent.name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'ログイン処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
