import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-montserrat' });

export const metadata: Metadata = {
  title: 'Leilões Correios',
  description: 'Dashboard de Meta, Google e LinkedIn Ads dos leilões dos Correios (Vip Leilões)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
