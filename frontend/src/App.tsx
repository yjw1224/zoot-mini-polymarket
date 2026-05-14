import { BrowserProvider } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import CreateMarketPage from './pages/CreateMarketPage';
import HomePage from './pages/HomePage';
import MarketsPage from './pages/MarketsPage';
import MarketDetailPage from './pages/MarketDetailPage';
import type { MarketSummary } from './lib/contracts';

type Page = 'home' | 'markets' | 'create';
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: 'chainChanged', listener: (chainId: string) => void) => void;
  removeListener?: (event: 'chainChanged', listener: (chainId: string) => void) => void;
};

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [selectedMarket, setSelectedMarket] = useState<MarketSummary | null>(null);
  const [factoryAddress, setFactoryAddress] = useState(() => {
    return localStorage.getItem('zoot-factory-address') ?? import.meta.env.VITE_FACTORY_ADDRESS ?? '';
  });
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<import('ethers').Signer | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [networkChainId, setNetworkChainId] = useState<bigint | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [refreshMarkets, setRefreshMarkets] = useState(0);

  useEffect(() => {
    if (window.ethereum) {
      setProvider(new BrowserProvider(window.ethereum));
    }
  }, []);

  useEffect(() => {
    if (!provider) {
      setNetworkChainId(null);
      return;
    }

    let cancelled = false;
    async function syncNetwork() {
      try {
        if (!provider) {
          setNetworkChainId(null);
          return;
        }
        const network = await provider.getNetwork();
        if (!cancelled) {
          setNetworkChainId(network.chainId);
        }
      } catch {
        if (!cancelled) {
          setNetworkChainId(null);
        }
      }
    }

    void syncNetwork();

    const ethereum = window.ethereum as EthereumProvider | undefined;
    const handleChainChanged = (chainId: string) => {
      const parsedChainId = BigInt(chainId);
      setNetworkChainId(parsedChainId);
      setSigner(null);
      setAccount(null);
      setWalletError(parsedChainId === SEPOLIA_CHAIN_ID ? null : 'Sepolia 네트워크로 전환하세요.');
    };

    ethereum?.on?.('chainChanged', handleChainChanged);

    return () => {
      cancelled = true;
      ethereum?.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('zoot-factory-address', factoryAddress);
  }, [factoryAddress]);

  const isSepolia = networkChainId === SEPOLIA_CHAIN_ID;
  const networkLabel = networkChainId == null ? 'Unknown' : isSepolia ? 'Sepolia' : `Chain ${networkChainId.toString()}`;

  async function switchToSepolia() {
    if (!window.ethereum) {
      setWalletError('MetaMask를 설치하세요.');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      setWalletError(null);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Sepolia 전환에 실패했습니다.');
    }
  }

  async function connectWallet() {
    if (!provider) {
      setWalletError('MetaMask를 설치하세요.');
      return;
    }

    if (!isSepolia) {
      setWalletError(null);
      try {
        await switchToSepolia();
      } catch {
        // switchToSepolia sets walletError on failure; abort connecting
        return;
      }
    }

    setIsConnecting(true);
    setWalletError(null);

    try {
      await provider.send('eth_requestAccounts', []);
      const connectedSigner = await provider.getSigner();
      const connectedAccount = await connectedSigner.getAddress();
      setSigner(connectedSigner);
      setAccount(connectedAccount);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Wallet connection failed');
    } finally {
      setIsConnecting(false);
    }
  }

  const navItems = useMemo(
    () => [
      { key: 'home' as const, label: 'Home' },
      { key: 'markets' as const, label: 'Betting' },
      { key: 'create' as const, label: 'Create' },
    ],
    [],
  );

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 text-white">
      <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-300">ZOOT</p>
          <h1 className="text-2xl font-semibold">Mini Polymarket</h1>
          <p className="mt-1 text-xs text-slate-300">Network: {networkLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPage(item.key)}
              className={`rounded-xl px-4 py-2 text-sm transition ${
                page === item.key ? 'bg-sky-400 text-slate-950' : 'bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {!isSepolia ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          프론트는 Sepolia만 사용합니다. MetaMask 네트워크를 Sepolia로 바꾼 뒤 다시 연결하세요.
        </div>
      ) : null}

      <main className="space-y-8">
        {page === 'home' ? (
          <HomePage
            account={account}
            factoryAddress={factoryAddress}
            onFactoryAddressChange={setFactoryAddress}
            onConnectWallet={connectWallet}
            isConnecting={isConnecting}
            walletError={walletError}
            networkLabel={networkLabel}
            isSepolia={isSepolia}
          />
        ) : null}

        {page === 'markets' ? (
          <MarketsPage
            provider={provider}
            signer={signer}
            factoryAddress={factoryAddress}
            refreshToken={refreshMarkets}
            isSepolia={isSepolia}
            onOpenMarket={(market) => {
              setSelectedMarket(market);
              setPage('detail');
            }}
          />
        ) : null}

        {page === 'create' ? (
          <CreateMarketPage
            signer={signer}
            factoryAddress={factoryAddress}
            onCreated={() => {
              setRefreshMarkets((value) => value + 1);
              setPage('markets');
            }}
            isSepolia={isSepolia}
          />
        ) : null}

        {page === 'detail' ? (
          <MarketDetailPage
            provider={provider}
            signer={signer}
            market={selectedMarket}
            factoryAddress={factoryAddress}
            onBack={() => setPage('markets')}
            isSepolia={isSepolia}
          />
        ) : null}
      </main>
    </div>
  );
}
