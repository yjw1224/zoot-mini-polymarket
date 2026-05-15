import { formatUnits, parseUnits, type Signer } from 'ethers';
import { useEffect, useState } from 'react';
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
            const [yesPrice, pricePerSet, yesBal, noBal] = await Promise.all([
              mc.yesPrice(),
              mc.PRICE_PER_SET(),
              mc.balanceOf(address, 0),
              mc.balanceOf(address, 1),
            ]);

            const currentYesPrice = yesPrice as bigint;
            const currentNoPrice = (pricePerSet as bigint) - currentYesPrice;

            if ((yesBal as bigint) > 0n || (noBal as bigint) > 0n) {
              const yesValue = (yesBal as bigint) * currentYesPrice / (pricePerSet as bigint);
              const noValue = (noBal as bigint) * currentNoPrice / (pricePerSet as bigint);
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">총 자산</h2>
          <p className="text-sm text-slate-400">내가 보유한 모든 시장의 포지션을 한눈에 봅니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="rounded-xl px-4 py-2 bg-white/5">Back</button>
          <button onClick={() => onUpdated()} className="rounded-xl px-4 py-2 bg-sky-500 text-white">Refresh</button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading...</p> : null}

      <div className="rounded-xl border border-white/10 bg-slate-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Total Value</span>
          <span className="text-xl font-bold text-white">${parseFloat(formatUnits(totalValue, 18)).toFixed(2)}</span>
        </div>

        {positions.length === 0 ? (
          <p className="text-sm text-slate-400">No positions found.</p>
        ) : (
          <div className="grid gap-4">
            {positions.map((p) => (
              <div key={p.market.address} className="rounded-xl border border-white/10 p-4 bg-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{p.market.metadata.name}</h3>
                    <p className="text-xs text-slate-400">{p.market.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Value</p>
                    <p className="text-lg font-bold text-white">${parseFloat(formatUnits((p.yesValue ?? 0n) + (p.noValue ?? 0n), 18)).toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <p className="text-xs text-emerald-300 uppercase">YES</p>
                    <p className="text-lg font-bold text-white">{parseFloat(formatUnits(p.yesBal, 18)).toFixed(2)}</p>
                    <p className="text-xs text-slate-400">${parseFloat(formatUnits(p.yesValue ?? 0n, 18)).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <p className="text-xs text-rose-300 uppercase">NO</p>
                    <p className="text-lg font-bold text-white">{parseFloat(formatUnits(p.noBal, 18)).toFixed(2)}</p>
                    <p className="text-xs text-slate-400">${parseFloat(formatUnits(p.noValue ?? 0n, 18)).toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 text-right">
                  <button onClick={() => onOpenMarket(p.market)} className="rounded-xl px-3 py-2 bg-sky-500 text-white">Open</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
