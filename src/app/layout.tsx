import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '組織診断',
  description: '組織診断アンケートシステム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50">
        {children}
      </body>
    </html>
  );
}
