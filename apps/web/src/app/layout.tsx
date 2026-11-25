import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JobPilot AI — Autonomous Job Search & Application Bot',
  description: 'Free autonomous job discovery, matching, human-like outreach, and tracking powered by Vercel AI SDK & Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
