import { useEffect, useState } from 'react';
import { fetchOrderbookSnapshot, type BackendOrderbookSnapshot } from '../lib/backend';
import { type MarketSummary } from '../lib/contracts';

interface SimpleMarketCardProps {
  market: MarketSummary;
  onOpen?: (market: MarketSummary, preselectSide?: '0' | '1') => void;
}

function formatPrice(value?: string) {
  if (!value) return '--';
  return Number(value) / 1e18;
}

function bestAsk(snapshot: BackendOrderbookSnapshot | null, side: 'yes' | 'no') {
  const asks = side === 'yes' ? snapshot?.yes.asks : snapshot?.no.asks;
  return asks?.[0]?.price;
}

function bestBid(snapshot: BackendOrderbookSnapshot | null, side: 'yes' | 'no') {
  const bids = side === 'yes' ? snapshot?.yes.bids : snapshot?.no.bids;
  return bids?.[0]?.price;
}

export default function SimpleMarketCard({ market, onOpen }: SimpleMarketCardProps) {
  const [snapshot, setSnapshot] = useState<BackendOrderbookSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await fetchOrderbookSnapshot(market.address);
        if (!cancelled) {
          setSnapshot(result);
        }
      } catch {
        if (!cancelled) {
          setSnapshot(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [market.address]);

  return (
    <article
      onClick={() => onOpen?.(market)}
      className="group cursor-pointer overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
    >
      <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="relative bg-slate-100 p-3 lg:p-0">
          {market.metadata.image ? (
            <img src={market.metadata.image} alt={market.metadata.name} className="h-52 w-full object-cover lg:h-full lg:min-h-[220px]" />
          ) : (
            <div className="flex h-52 w-full items-center justify-center bg-[linear-gradient(135deg,#e2e8f0_0%,#f8fafc_100%)] text-sm font-medium text-slate-400 lg:h-full lg:min-h-[220px]">
              No image
            </div>
          )}
          <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-700 shadow-sm">
            Live
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 p-4 md:p-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{market.metadata.name}</h3>
                <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600">{market.metadata.rules || 'No rules provided.'}</p>
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                <span className="pm-chip text-[11px]">{loading ? 'Updating' : 'Orderbook snapshot'}</span>
                <p className="text-xs font-medium text-slate-500">Ends {new Date(Number(market.endTime) * 1000).toLocaleString()}</p>
              </div>
            </div>

            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Best bid / ask</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">YES</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">Bid / Ask</span>
                </div>
                <p className="mt-3 text-lg font-semibold text-slate-950">{formatPrice(bestBid(snapshot, 'yes'))}</p>
                <p className="text-sm text-slate-500">Ask {formatPrice(bestAsk(snapshot, 'yes'))}</p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-700">NO</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700">Bid / Ask</span>
                </div>
                <p className="mt-3 text-lg font-semibold text-slate-950">{formatPrice(bestBid(snapshot, 'no'))}</p>
                <p className="text-sm text-slate-500">Ask {formatPrice(bestAsk(snapshot, 'no'))}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Backend orderbook snapshot</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span>Tap to open market</span>
          </div>
        </div>
      </div>
    </article>
  );
}
