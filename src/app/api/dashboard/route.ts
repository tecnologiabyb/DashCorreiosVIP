import { NextRequest, NextResponse } from 'next/server';
import { fetchMeta } from '@/lib/meta';
import { fetchGoogle } from '@/lib/google';
import { fetchLinkedIn } from '@/lib/linkedin';
import { campaignFilter } from '@/lib/filter';
import { isValidRange, toISO } from '@/lib/dates';
import type { DashboardResponse, DateRange, Source } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Cache em memória por 10 min para não estourar limites das APIs
const cache = new Map<string, { at: number; body: DashboardResponse }>();
const TTL = 10 * 60 * 1000;

// Sem dados de exemplo: se uma fonte falha, a página dela mostra o erro e as outras seguem funcionando.
async function source<T>(fn: () => Promise<T>): Promise<Source<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    return { data: null, error: msg };
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
  const range: Partial<DateRange> = { start: sp.get('start') ?? toISO(monthStart), end: sp.get('end') ?? toISO(today) };
  if (!isValidRange(range)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 });

  const key = `${range.start}_${range.end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL && sp.get('refresh') !== '1') return NextResponse.json(hit.body);

  const [meta, google, linkedin] = await Promise.all([source(() => fetchMeta(range)), source(() => fetchGoogle(range)), source(() => fetchLinkedIn(range))]);

  const body: DashboardResponse = { range, filter: campaignFilter(), meta, google, linkedin, updatedAt: new Date().toISOString() };
  if (meta.data && google.data && linkedin.data) cache.set(key, { at: Date.now(), body });
  return NextResponse.json(body);
}
