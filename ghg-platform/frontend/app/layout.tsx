import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GHG Emission Tracking Platform',
  description: 'Multi-tenant corporate GHG accounting — Scope 1, 2 & 3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
