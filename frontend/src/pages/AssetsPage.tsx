import { formatUnits, parseUnits, type Signer } from 'ethers';
import { useEffect, useState } from 'react';
import { fetchOrderbookSnapshot } from '../lib/backend';
import { loadFactoryMarkets, getMarketContract, getUsdcContract, type MarketSummary } from '../lib/contracts';

interface AssetsPageProps {
  provider: import('ethers').BrowserProvider | null;
  signer: Signer | null;
  factoryAddress: string;
  isSepolia: boolean;
  onBack: () => void;
  onUpdated: () => void;
  onOpenMarket: (market: MarketSummary) => void;
}

export default function AssetsPage({ provider, signer, factoryAddress, isSepolia, onBack, onUpdated, onOpenMarket }: AssetsPageProps) {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [fakeUsdcAddress, setFakeUsdcAddress] = useState('');
  const [positions, setPositions] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!provider || !factoryAddress || !isSepolia || !signer) return;
      setLoading(true);
      try {
        const result = await loadFactoryMarkets(provider, factoryAddress);
        if (cancelled) return;
        setFakeUsdcAddress(result.fakeUsdcAddress);
        setMarkets(result.markets);
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [provider, factoryAddress, isSepolia, signer]);

  useEffect(() => {
    let cancelled = false;
    async function loadPositions() {
      if (!signer || !markets.length || !fakeUsdcAddress) return;
      setLoading(true);
      try {
        const address = await signer.getAddress();
        const rows: Array<any> = [];
        for (const m of markets) {
          const mc = getMarketContract(m.address, signer);
          try {
            const [orderbook, yesBal, noBal] = await Promise.all([
              fetchOrderbookSnapshot(m.address),
              mc.balanceOf(address, 0),
              mc.balanceOf(address, 1),
            ]);

            const yesBid = orderbook.yes.bids[0]?.price;
            const yesAsk = orderbook.yes.asks[0]?.price;
            const noBid = orderbook.no.bids[0]?.price;
            const noAsk = orderbook.no.asks[0]?.price;

            const currentYesPrice = yesBid && yesAsk ? (BigInt(yesBid) + BigInt(yesAsk)) / 2n : BigInt(yesBid ?? yesAsk ?? 500000000000000000n);
            const currentNoPrice = noBid && noAsk ? (BigInt(noBid) + BigInt(noAsk)) / 2n : BigInt(noBid ?? noAsk ?? 500000000000000000n);

            if ((yesBal as bigint) > 0n || (noBal as bigint) > 0n) {
              const yesValue = ((yesBal as bigint) * currentYesPrice) / 1000000000000000000n;
              const noValue = ((noBal as bigint) * currentNoPrice) / 1000000000000000000n;
              rows.push({ market: m, yesBal: yesBal as bigint, noBal: noBal as bigint, yesValue, noValue });
            }
          } catch {
            // skip
          }
        }
        if (!cancelled) setPositions(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPositions();
    return () => { cancelled = true; };
  }, [markets, fakeUsdcAddress, signer]);

  const totalValue = positions.reduce((acc, p) => acc + (p.yesValue ?? 0n) + (p.noValue ?? 0n), 0n);

  return (
    <div className="space-y-6">
      <section className="pm-panel rounded-[32px] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pm-kicker">Assets</span>
          <span className={`pm-chip ${isSepolia ? 'pm-chip-yes' : 'pm-chip-no'}`}>{isSepolia ? 'Sepolia ready' : 'Network mismatch'}</span>
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="pm-section-title font-semibold tracking-tight text-slate-950">Track your holdings across every market.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">This page keeps the same position math and market routing, but presents the portfolio in a cleaner dashboard style.</p>
          </div>

          <div className="flex gap-2">
            <button onClick={onBack} className="pm-btn-secondary">Back</button>
            <button onClick={() => onUpdated()} className="pm-btn-primary">Refresh</button>
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm font-medium text-slate-500">Loading...</p> : null}

      <section className="pm-panel rounded-[28px] p-5 md:p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <span className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Total Value</span>
          <span className="text-3xl font-semibold tracking-tight text-slate-950">${parseFloat(formatUnits(totalValue, 18)).toFixed(2)}</span>
        </div>

        {positions.length === 0 ? (
          <div className="py-8 text-sm text-slate-500">No positions found.</div>
        ) : (
          <div className="mt-5 grid gap-4">
            {positions.map((p) => (
              <div key={p.market.address} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-950">{p.market.metadata.name}</h3>
                    <p className="mt-1 break-all text-xs text-slate-500">{p.market.address}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Value</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">${parseFloat(formatUnits((p.yesValue ?? 0n) + (p.noValue ?? 0n), 18)).toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">YES</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{parseFloat(formatUnits(p.yesBal, 18)).toFixed(2)}</p>
                    <p className="mt-1 text-sm text-slate-500">${parseFloat(formatUnits(p.yesValue ?? 0n, 18)).toFixed(2)}</p>
                  </div>
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">NO</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{parseFloat(formatUnits(p.noBal, 18)).toFixed(2)}</p>
                    <p className="mt-1 text-sm text-slate-500">${parseFloat(formatUnits(p.noValue ?? 0n, 18)).toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button onClick={() => onOpenMarket(p.market)} className="pm-btn-secondary px-4 py-2">Open</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
