import { BrowserProvider, Contract, formatUnits } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import CreateMarketPage from './pages/CreateMarketPage';
import HomePage from './pages/HomePage';
import MarketsPage from './pages/MarketsPage';
import MarketDetailPage from './pages/MarketDetailPage';
import AssetsPage from './pages/AssetsPage';
import { FACTORY_ABI, USDC_ABI, type MarketSummary } from './lib/contracts';

type Page = 'home' | 'markets' | 'create' | 'detail' | 'assets';
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
    return import.meta.env.VITE_FACTORY_ADDRESS ?? '';
  });
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<import('ethers').Signer | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [fusdcBalance, setFusdcBalance] = useState<string | null>(null);
  const [isFauceting, setIsFauceting] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    async function loadBalance() {
      if (!provider || !account || !factoryAddress || !isSepolia) {
        setFusdcBalance(null);
        return;
      }
      try {
        const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
        const usdcAddr = await factory.fakeUSDCToken();
        const usdc = new Contract(usdcAddr, USDC_ABI, provider);
        const bal = await usdc.balanceOf(account);
        if (!cancelled) setFusdcBalance(formatUnits(bal, 18));
      } catch {
        if (!cancelled) setFusdcBalance(null);
      }
    }
    void loadBalance();
    return () => {
      cancelled = true;
    };
  }, [provider, account, factoryAddress, isSepolia, refreshMarkets]);

  async function handleFaucet() {
    if (!signer || !factoryAddress || !isSepolia) return;
    setIsFauceting(true);
    setWalletError(null);
    try {
      const factory = new Contract(factoryAddress, FACTORY_ABI, signer);
      const usdcAddr = await factory.fakeUSDCToken();
      const usdc = new Contract(usdcAddr, USDC_ABI, signer);
      const tx = await usdc.faucet();
      await tx.wait();
      setRefreshMarkets((v) => v + 1); // trigger balance refresh
      alert('1,000 fUSDC 충전 완료!');
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Faucet failed');
    } finally {
      setIsFauceting(false);
    }
  }

  const navItems = useMemo(
    () => [
      { key: 'home' as const, label: 'Home' },
      { key: 'markets' as const, label: 'Markets' },
      { key: 'create' as const, label: 'Create' },
      { key: 'assets' as const, label: 'Assets' },
    ],
    [],
  );

  const shortAccount = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : '';

  return (
    <div className="pm-shell text-slate-900">
      <header className="pm-topbar rounded-[28px] px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPage('home')} className="flex items-center gap-3 text-left">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_55%,#22c55e_100%)] text-sm font-bold text-white shadow-lg shadow-sky-500/20">
                Z
              </span>
              <span>
                <span className="block text-[11px] font-bold uppercase tracking-[0.34em] text-sky-600">ZOOT</span>
                <span className="block text-lg font-semibold tracking-[-0.02em] text-slate-950">Mini Polymarket</span>
              </span>
            </button>

            <span className="hidden h-10 w-px bg-slate-200 lg:block" />

            <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
              <span className="pm-chip">Network</span>
              <span className={`pm-chip ${isSepolia ? 'pm-chip-yes' : 'pm-chip-no'}`}>{networkLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <span className={`pm-chip ${isSepolia ? 'pm-chip-yes' : 'pm-chip-no'}`}>{networkLabel}</span>
            {account && fusdcBalance !== null ? (
              <span className="pm-chip">
                <span className="text-emerald-600">{Number(fusdcBalance).toLocaleString()} fUSDC</span>
                <button
                  type="button"
                  onClick={handleFaucet}
                  disabled={isFauceting}
                  className="rounded-full bg-emerald-600/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-600/15 disabled:opacity-50"
                  title="1,000 fUSDC 받기"
                >
                  {isFauceting ? '...' : 'Faucet'}
                </button>
              </span>
            ) : null}
            {account ? <span className="pm-chip font-mono text-[11px] text-slate-600">{shortAccount}</span> : null}
            {!account ? (
              <button
                type="button"
                onClick={connectWallet}
                disabled={isConnecting}
                className="pm-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPage(item.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${page === item.key
                  ? 'bg-slate-950 text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950'
                }`}
            >
              {item.label}
            </button>
          ))}
          {account ? <span className="ml-auto hidden text-sm text-slate-500 md:inline">Connected</span> : null}
        </div>
      </header>

      {!isSepolia ? (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          프론트는 Sepolia만 사용합니다. MetaMask 네트워크를 Sepolia로 바꾼 뒤 다시 연결하세요.
        </div>
      ) : null}

      <main className="mt-6 space-y-8">
        {page === 'home' ? (
          <HomePage
            account={account}
            factoryAddress={factoryAddress}
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
            onUpdated={() => setRefreshMarkets((v) => v + 1)}
          />
        ) : null}

        {page === 'assets' ? (
          <AssetsPage
            provider={provider}
            signer={signer}
            factoryAddress={factoryAddress}
            isSepolia={isSepolia}
            onBack={() => setPage('home')}
            onUpdated={() => setRefreshMarkets((v) => v + 1)}
            onOpenMarket={(market) => {
              setSelectedMarket(market);
              setPage('detail');
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
