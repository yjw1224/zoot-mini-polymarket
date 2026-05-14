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
      <div>
        <p className="text-sm text-sky-300">Betting</p>
        <h1 className="text-3xl font-semibold text-white">All markets</h1>
        <p className="text-sm text-slate-300">모든 마켓을 표시합니다.</p>
      </div>

      {!isSepolia ? <p className="text-sm text-amber-300">Sepolia 네트워크로 전환해야 market을 불러올 수 있습니다.</p> : null}

      {!factoryAddress ? <p className="text-sm text-amber-300">Factory address를 먼저 넣어주세요.</p> : null}
      {loading ? <p className="text-sm text-slate-300">Loading markets...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="space-y-4">
        {markets.map((market) => (
          <SimpleMarketCard
            key={market.address}
            market={market}
            provider={provider}
            onOpen={(m, side) => onOpenMarket?.(m, side)}
          />
        ))}
      </div>

      {!loading && markets.length === 0 && !error ? (
        <p className="text-sm text-slate-400">아직 생성된 market이 없습니다.</p>
      ) : null}
    </div>
  );
}
