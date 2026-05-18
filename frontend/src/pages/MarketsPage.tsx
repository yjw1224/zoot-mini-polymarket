import { BrowserProvider, type Signer } from 'ethers';
import { useEffect, useState } from 'react';
import SimpleMarketCard from '../components/SimpleMarketCard';
import { loadFactoryMarkets, type MarketSummary } from '../lib/contracts';

interface MarketsPageProps {
  provider: BrowserProvider | null;
  signer: import('ethers').Signer | null;
  factoryAddress: string;
  refreshToken: number;
  isSepolia: boolean;
  onOpenMarket?: (market: import('../lib/contracts').MarketSummary, preselectSide?: '0' | '1') => void;
}

export default function MarketsPage({ provider, signer, factoryAddress, refreshToken, isSepolia, onOpenMarket, }: MarketsPageProps) {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [fakeUsdcAddress, setFakeUsdcAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSepolia) {
      setMarkets([]);
      setFakeUsdcAddress('');
      setLoading(false);
      setError('Sepolia 네트워크로 전환하세요.');
      return;
    }

    if (!provider || !factoryAddress) {
      setMarkets([]);
      setFakeUsdcAddress('');
      return;
    }

    let cancelled = false;

    async function loadMarkets() {
      setLoading(true);
      setError(null);

      try {
        if (!provider) {
          setError('Provider is not available');
          setLoading(false);
          return;
        }

        const result = await loadFactoryMarkets(provider, factoryAddress);
        if (cancelled) {
          return;
        }

        setMarkets(result.markets);
        setFakeUsdcAddress(result.fakeUsdcAddress);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load markets');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMarkets();

    return () => {
      cancelled = true;
    };
  }, [provider, factoryAddress, refreshToken, isSepolia]);

  return (
    <div className="space-y-6">
      <section className="pm-panel rounded-[32px] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pm-kicker">Markets</span>
          <span className={`pm-chip ${isSepolia ? 'pm-chip-yes' : 'pm-chip-no'}`}>{isSepolia ? 'Sepolia ready' : 'Network mismatch'}</span>
          {factoryAddress ? <span className="pm-chip">Factory connected</span> : null}
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="pm-section-title font-semibold tracking-tight text-slate-950">Browse live markets</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              ZOOT it! Discover our markets.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[400px]">
            <div className="pm-statbox p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Markets</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{markets.length}</p>
            </div>
            <div className="pm-statbox p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Loading</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{loading ? 'Yes' : 'No'}</p>
            </div>
            <div className="pm-statbox p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Status</p>
              <p className={`mt-2 text-sm font-semibold ${error ? 'text-rose-600' : 'text-emerald-700'}`}>{error ? 'Needs attention' : 'Healthy'}</p>
            </div>
          </div>
        </div>
      </section>

      {!isSepolia ? <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Sepolia 네트워크로 전환해야 market을 불러올 수 있습니다.</div> : null}

      {!factoryAddress ? <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Factory address를 먼저 넣어주세요.</div> : null}
      {loading ? <p className="text-sm font-medium text-slate-500">Loading markets...</p> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}

      <div className="grid gap-4">
        {markets.map((market) => (
          <SimpleMarketCard
            key={market.address}
            market={market}
            onOpen={(m, side) => onOpenMarket?.(m, side)}
          />
        ))}
      </div>

      {!loading && markets.length === 0 && !error ? (
        <div className="pm-panel rounded-[28px] p-6 text-sm text-slate-500">아직 생성된 market이 없습니다.</div>
      ) : null}
    </div>
  );
}
