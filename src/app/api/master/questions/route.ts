import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { QuestionsMaster } from '@/lib/types';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // ローカルファイルから読み込み
    const filePath = path.join(process.cwd(), 'data', 'questions.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'questions.json not found' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data: QuestionsMaster = JSON.parse(fileContent);

    // role別にフィルタ
    const filteredQuestions = data.questions.filter(q =>
      q.roles.includes(session.role)
    ).sort((a, b) => a.order - b.order);

    return NextResponse.json({
      questions: filteredQuestions,
      factors: data.factors,
      elements: data.elements,
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }
}
