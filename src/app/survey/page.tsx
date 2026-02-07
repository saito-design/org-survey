'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Question {
  question_id: string;
  factor_id: string;
  element_id: string;
  text: string;
  scale: '5point' | '4point' | 'binary';
  order: number;
}

interface Factor {
  factor_id: string;
  factor_name: string;
  order: number;
}

interface SessionInfo {
  respondent_id: string;
  role: string;
  name?: string;
  anonymous: boolean;
}

export default function SurveyPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // セッション確認
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        router.push('/');
        return;
      }
      const meData = await meRes.json();
      setSession(meData);

      // 設問取得
      const qRes = await fetch('/api/master/questions');
      if (!qRes.ok) throw new Error('Failed to fetch questions');
      const qData = await qRes.json();
      setQuestions(qData.questions);
      setFactors(qData.factors);

      // 既存回答取得
      const rRes = await fetch('/api/responses');
      if (rRes.ok) {
        const rData = await rRes.json();
        const existingAnswers: Record<string, number | null> = {};
        for (const r of rData.responses) {
          existingAnswers[r.question_id] = r.value;
        }
        setAnswers(existingAnswers);
      }
    } catch (err) {
      console.error(err);
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: string, value: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSave = async (submit: boolean) => {
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, submit }),
      });

      if (!res.ok) throw new Error('保存に失敗しました');

      if (submit) {
        router.push('/survey/complete');
      } else {
        alert('一時保存しました');
      }
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  // 因子ごとにグループ化
  const questionsByFactor = factors
    .sort((a, b) => a.order - b.order)
    .map(factor => ({
      ...factor,
      questions: questions.filter(q => q.factor_id === factor.factor_id),
    }))
    .filter(f => f.questions.length > 0);

  const answeredCount = Object.values(answers).filter(v => v !== null).length;
  const progress = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">組織診断アンケート</h1>
            <p className="text-sm text-gray-500">
              {session?.anonymous ? '匿名' : session?.name || ''} ({session?.role})
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ログアウト
          </button>
        </div>
        {/* プログレスバー */}
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* メイン */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="mb-6 text-sm text-gray-600">
          回答済み: {answeredCount} / {questions.length} 問 ({progress}%)
        </div>

        {questionsByFactor.map(factor => (
          <div key={factor.factor_id} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
              {factor.factor_name}
            </h2>

            <div className="space-y-4">
              {factor.questions.map((q, idx) => (
                <div key={q.question_id} className="bg-white p-4 rounded-lg shadow-sm">
                  <p className="text-gray-800 mb-3">
                    <span className="text-gray-400 mr-2">Q{q.order}.</span>
                    {q.text}
                  </p>

                  {q.scale === '5point' && (
                    <div className="flex justify-center gap-1 sm:gap-3">
                      {[
                        { val: 1, label: '全く\n思わない', selected: 'bg-red-100 border-red-500 text-red-700', num: 'text-red-600' },
                        { val: 2, label: 'あまり\n思わない', selected: 'bg-orange-100 border-orange-500 text-orange-700', num: 'text-orange-600' },
                        { val: 3, label: 'どちらとも\nいえない', selected: 'bg-gray-200 border-gray-500 text-gray-700', num: 'text-gray-600' },
                        { val: 4, label: 'まあ\nそう思う', selected: 'bg-sky-100 border-sky-500 text-sky-700', num: 'text-sky-600' },
                        { val: 5, label: '強く\nそう思う', selected: 'bg-blue-100 border-blue-500 text-blue-700', num: 'text-blue-600' },
                      ].map(({ val, label, selected, num }) => (
                        <button
                          key={val}
                          onClick={() => handleAnswer(q.question_id, val)}
                          className={`flex flex-col items-center p-2 rounded-lg border-2 transition-all min-w-[60px] sm:min-w-[72px] ${
                            answers[q.question_id] === val
                              ? selected
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}
                        >
                          <span className={`text-xl font-bold ${
                            answers[q.question_id] === val ? num : 'text-gray-700'
                          }`}>
                            {val}
                          </span>
                          <span className="text-[10px] leading-tight text-center whitespace-pre-line mt-1">
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ボタン */}
        <div className="flex gap-4 justify-center mt-8 pb-8">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
          >
            一時保存
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || answeredCount < questions.length}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            回答を提出
          </button>
        </div>

        {answeredCount < questions.length && (
          <p className="text-center text-sm text-gray-500">
            全ての設問に回答すると提出できます
          </p>
        )}
      </main>
    </div>
  );
}
