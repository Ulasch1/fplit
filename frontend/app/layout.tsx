import type { Metadata } from 'next';
import './globals.css';
import { Kalam, Space_Mono } from 'next/font/google';

const kalam = Kalam({ subsets: ['latin'], weight: ['400','700'], variable: '--font-kalam' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400','700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Fplit',
  description: 'Split group expenses, settle up simply.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${kalam.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
