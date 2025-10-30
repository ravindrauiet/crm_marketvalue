import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bhavish CRM',
  description: 'Lightweight CRM/ERP for managing records and files'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}



