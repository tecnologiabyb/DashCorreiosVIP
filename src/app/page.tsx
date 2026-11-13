'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardResponse, DateRange } from '@/lib/types';
import { longDate } from '@/lib/format';
import { GooglePage, LinkedInPage, MetaPage, YouTubePage } from '@/components/Pages';

// Mesmas páginas, na mesma ordem, do "Cockpit de Growth Correios" (Data Studio)
type Tab = 'google' | 'youtube' | 'meta' | 'linkedin';
const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'google', label: 'Google Ads', title: 'Google Ads' },
  { id: 'youtube', label: 'YouTube', title: 'YouTube' },
  { id: 'meta', label: 'Meta Ads', title: 'Meta Ads' },
  { id: 'linkedin', label: 'LinkedIn Ads', title: 'LinkedIn Ads' },
];

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

function preset(id: string): DateRange {
  const today = new Date();
  const back = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  switch (id) {
    case 'today':
      return { start: iso(today), end: iso(today) };
    case '7':
      return { start: iso(back(7)), end: iso(back(1)) };
    case '14':
      return { start: iso(back(14)), end: iso(back(1)) };
    case '30':
      return { start: iso(back(30)), end: iso(back(1)) };
    case 'lastmonth':
      return { start: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), end: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
    default:
      return { start: iso(new Date(today.getFullYear(), today.getMonth(), 1)), end: iso(today) };
  }
}

function Unavailable({ name, error }: { name: string; error?: string }) {
  return (
    <div className="banner">
      <b>Dados de {name} indisponíveis.</b> {error ?? 'A fonte não respondeu.'}
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('google');
  const [presetId, setPresetId] = useState('month');
  const [range, setRange] = useState<DateRange>(() => preset('month'));
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (r: DateRange, refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard?start=${r.start}&end=${r.end}${refresh ? '&refresh=1' : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  function choosePreset(id: string) {
    setPresetId(id);
    if (id !== 'custom') setRange(preset(id));
  }

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">Leilões</span>
          <div className="name">Correios</div>
          <div className="by">Cockpit de Growth · Vip Leilões</div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="foot">
          {data && <>Atualizado em {new Date(data.updatedAt).toLocaleString('pt-BR')}</>}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{current.title}</h1>
            <div className="sub">
              Cockpit de Growth Correios | <b>Vip Leilões</b>
              {data && <> · comparando com {longDate(data.prevRange.start)} – {longDate(data.prevRange.end)}</>}
            </div>
          </div>
          <div className="filters">
            <select value={presetId} onChange={(e) => choosePreset(e.target.value)} aria-label="Período">
              <option value="month">Este mês</option>
              <option value="lastmonth">Mês passado</option>
              <option value="today">Hoje</option>
              <option value="7">Últimos 7 dias</option>
              <option value="14">Últimos 14 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="custom">Personalizado</option>
            </select>
            <input type="date" value={range.start} max={range.end} aria-label="Data inicial" onChange={(e) => { setPresetId('custom'); setRange({ ...range, start: e.target.value }); }} />
            <input type="date" value={range.end} min={range.start} aria-label="Data final" onChange={(e) => { setPresetId('custom'); setRange({ ...range, end: e.target.value }); }} />
            <button className="btn" onClick={() => load(range, true)} disabled={loading}>
              {loading ? 'Carregando…' : 'Atualizar'}
            </button>
          </div>
        </header>

        {error && <div className="banner">Erro: {error}</div>}

        {data ? (
          <div className={loading ? 'loading' : ''}>
            {tab === 'google' && (data.google.data ? <GooglePage g={data.google.data} /> : <Unavailable name="Google Ads" error={data.google.error} />)}
            {tab === 'youtube' && (data.google.data ? <YouTubePage g={data.google.data} /> : <Unavailable name="YouTube" error={data.google.error} />)}
            {tab === 'meta' && (data.meta.data ? <MetaPage m={data.meta.data} /> : <Unavailable name="Meta Ads" error={data.meta.error} />)}
            {tab === 'linkedin' && (data.linkedin.data ? <LinkedInPage l={data.linkedin.data} /> : <Unavailable name="LinkedIn Ads" error={data.linkedin.error} />)}
          </div>
        ) : (
          !error && <div className="empty">Carregando dados…</div>
        )}
      </main>
    </div>
  );
}
