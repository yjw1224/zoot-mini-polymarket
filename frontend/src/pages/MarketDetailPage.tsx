import { BrowserProvider, type Signer } from 'ethers';
import { useEffect, useState } from 'react';
import MarketCard from '../components/MarketCard';
import { loadFactoryMarkets, type MarketSummary } from '../lib/contracts';

interface MarketDetailPageProps {
  provider: BrowserProvider | null;
  signer: Signer | null;
  market: MarketSummary | null;
  factoryAddress: string;
  onBack: () => void;
  isSepolia: boolean;
}

export default function MarketDetailPage({ provider, signer, market, factoryAddress, onBack, isSepolia, }: MarketDetailPageProps) {
  const [fakeUsdcAddress, setFakeUsdcAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSepolia) {
      setFakeUsdcAddress('');
      setError('Sepolia 네트워크로 전환하세요.');
      return;
    }

    if (!provider || !factoryAddress) {
      setFakeUsdcAddress('');
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        if(!provider) {
            setError('Provider is not available');
            setLoading(false);
            return;
        }
        const result = await loadFactoryMarkets(provider, factoryAddress);
        if (!cancelled) {
          setFakeUsdcAddress(result.fakeUsdcAddress);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [provider, factoryAddress, isSepolia]);

  if (!market) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300">No market selected.</p>
        <button onClick={onBack} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950">Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-sky-300">Betting</p>
        <h1 className="text-3xl font-semibold text-white">Market details</h1>
        <p className="text-sm text-slate-300">{market.metadata.name}</p>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div>
        <button onClick={onBack} className="mb-4 rounded-xl border border-white/10 px-3 py-2 text-sm text-white">← Back</button>
        <MarketCard
          market={market}
          fakeUsdcAddress={fakeUsdcAddress}
          signer={signer}
          onUpdated={() => {}}
        />
      </div>
    </div>
  );
}
