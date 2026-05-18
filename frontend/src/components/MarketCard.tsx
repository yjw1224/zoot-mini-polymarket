import { useEffect, useState } from 'react';
import { fetchOrderbookSnapshot, type BackendOrderbookSnapshot } from '../lib/backend';
import { type MarketSummary } from '../lib/contracts';

interface MarketCardProps {
  market: MarketSummary;
  onOpen?: (market: MarketSummary, preselectSide?: '0' | '1') => void;
  compact?: boolean;
}

function priceLabel(price?: string) {
  if (!price) return '--';
  return (Number(price) / 1e18).toFixed(3);
}

function bestLevel(snapshot: BackendOrderbookSnapshot | null, side: 'yes' | 'no', level: 'bids' | 'asks') {
  return side === 'yes' ? snapshot?.yes[level]?.[0]?.price : snapshot?.no[level]?.[0]?.price;
}

export default function MarketCard({ market, onOpen, compact = false }: MarketCardProps) {
  const [snapshot, setSnapshot] = useState<BackendOrderbookSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchOrderbookSnapshot(market.address);
        if (!cancelled) {
          setSnapshot(result);
        }
      } catch {
        if (!cancelled) {
          setSnapshot(null);
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
      className={`overflow-hidden rounded-3xl border border-white/10 bg-white/5 ${compact ? 'cursor-pointer hover:shadow-lg' : ''}`}
    >
      <div className={`grid gap-0 ${compact ? 'grid-cols-[96px_1fr] items-center' : 'md:grid-cols-[240px_1fr]'}`}>
        <div className="flex items-center justify-center bg-slate-900 p-4">
          {market.metadata.image ? (
            <img src={market.metadata.image} alt={market.metadata.name} className="h-20 w-20 rounded-lg object-cover md:h-28 md:w-28" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg text-sm text-slate-500 md:h-28 md:w-28">No image</div>
          )}
        </div>

        <div className="space-y-3 p-3 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={`font-semibold text-white ${compact ? 'text-lg' : 'text-2xl'}`}>{market.metadata.name}</h3>
              {!compact ? <p className="mt-1 break-all text-xs text-slate-400">{market.address}</p> : null}
            </div>
            {!compact ? <p className="text-xs text-slate-400">End {new Date(Number(market.endTime) * 1000).toLocaleString()}</p> : null}
          </div>

          {!compact ? (
            <div className="space-y-4">
              {market.metadata.rules ? (
                <div className="rounded-xl bg-slate-900/50 p-4 text-sm text-slate-300">
                  <h4 className="mb-2 font-semibold text-white">Rules / Description</h4>
                  <p className="whitespace-pre-wrap leading-relaxed">{market.metadata.rules}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'lg:grid-cols-2'}`}>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-200">YES</p>
              <p className="mt-1 text-sm font-semibold text-white">Bid {priceLabel(bestLevel(snapshot, 'yes', 'bids'))}</p>
              <p className="text-sm font-semibold text-white">Ask {priceLabel(bestLevel(snapshot, 'yes', 'asks'))}</p>
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3">
              <p className="text-xs uppercase tracking-wide text-rose-200">NO</p>
              <p className="mt-1 text-sm font-semibold text-white">Bid {priceLabel(bestLevel(snapshot, 'no', 'bids'))}</p>
              <p className="text-sm font-semibold text-white">Ask {priceLabel(bestLevel(snapshot, 'no', 'asks'))}</p>
            </div>
          </div>

          {!compact ? <p className="text-xs text-slate-500">Backend orderbook snapshot</p> : null}
        </div>
      </div>
    </article>
  );
}
