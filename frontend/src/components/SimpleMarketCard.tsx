import { BrowserProvider, formatUnits } from 'ethers';
import { useEffect, useState } from 'react';
import { getMarketContract, type MarketSummary } from '../lib/contracts';

interface SimpleMarketCardProps {
  market: MarketSummary;
  provider: BrowserProvider | null;
  onOpen?: (market: MarketSummary, preselectSide?: '0' | '1') => void;
}

export default function SimpleMarketCard({ market, provider, onOpen }: SimpleMarketCardProps) {
  const [yesPrice, setYesPrice] = useState<bigint | null>(null);
  const [pricePerSet, setPricePerSet] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!provider) return;
      try {
        const m = getMarketContract(market.address, provider);
        const y = (await m.yesPrice()) as bigint;
        const p = (await m.PRICE_PER_SET()) as bigint;
        if (!cancelled) {
          setYesPrice(y);
          setPricePerSet(p);
        }
      } catch {
        if (!cancelled) {
          setYesPrice(null);
          setPricePerSet(null);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [market.address, provider]);

  const noPrice = yesPrice !== null && pricePerSet !== null ? pricePerSet - yesPrice : null;

  return (
    <article
      onClick={() => onOpen?.(market)}
      className="flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 cursor-pointer hover:shadow-lg"
    >
      <div className="flex-shrink-0">
        {market.metadata.image ? (
          <img src={market.metadata.image} alt={market.metadata.name} className="w-[120px] h-[120px] object-cover rounded-md" />
        ) : (
          <div className="flex h-[144px] w-[144px] items-center justify-center rounded-md bg-slate-800 text-sm text-slate-500">No image</div>
        )}
      </div>

      <div className="flex w-full items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{market.metadata.name}</h3>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(market, '0');
            }}
            className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400/20"
          >
            YES
            <div className="text-xs text-slate-300">{yesPrice !== null ? `${formatUnits(yesPrice, 18)} fUSDC` : '--'}</div>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(market, '1');
            }}
            className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400/20"
          >
            NO
            <div className="text-xs text-slate-300">{noPrice !== null ? `${formatUnits(noPrice, 18)} fUSDC` : '--'}</div>
          </button>
        </div>
      </div>
    </article>
  );
}
