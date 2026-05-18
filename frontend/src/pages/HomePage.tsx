interface HomePageProps {
  account: string | null;
  factoryAddress: string;
  onConnectWallet: () => Promise<void>;
  isConnecting: boolean;
  walletError: string | null;
  networkLabel: string;
  isSepolia: boolean;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function HomePage({
  account,
  factoryAddress,
  onConnectWallet,
  isConnecting,
  walletError,
  networkLabel,
  isSepolia,
}: HomePageProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
      <section className="pm-panel rounded-[32px] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pm-kicker">Home</span>
          <span className={`pm-chip ${isSepolia ? 'pm-chip-yes' : 'pm-chip-no'}`}>Network: {networkLabel}</span>
          <span className="pm-chip">Factory-backed</span>
        </div>

        <div className="mt-6 max-w-3xl space-y-5">
          <h1 className="pm-section-title font-semibold tracking-tight text-slate-950">Polymarket-style prediction markets for your Sepolia demo.</h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            Connect MetaMask, keep the existing market creation and trading flows, and present them in a cleaner market-terminal layout that feels close to Polymarket.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={isConnecting}
              className="pm-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
            </button>
            <span className="pm-chip">Fast market discovery</span>
            <span className="pm-chip">Live orderbook snapshots</span>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="pm-statbox p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Wallet</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{account ? shortenAddress(account) : 'Not connected'}</p>
            <p className="mt-1 text-xs text-slate-500">MetaMask connection is preserved.</p>
          </div>
          <div className="pm-statbox p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Network</p>
            <p className={`mt-2 text-sm font-semibold ${isSepolia ? 'text-emerald-700' : 'text-amber-700'}`}>{networkLabel}</p>
            <p className="mt-1 text-xs text-slate-500">Sepolia is required for trading.</p>
          </div>
          <div className="pm-statbox p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Factory</p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-950">{factoryAddress || 'Not configured'}</p>
            <p className="mt-1 text-xs text-slate-500">Reads the deployed market factory.</p>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="pm-panel rounded-[28px] p-5">
          <p className="pm-kicker">Wallet</p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">Connect your trading account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">The current wallet state and balances stay intact. Only the frame around them changes.</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Account</p>
            <p className="mt-2 break-all text-sm font-medium text-slate-900">{account ?? 'Not connected'}</p>
            {walletError ? <p className="mt-3 text-sm font-medium text-rose-600">{walletError}</p> : null}
          </div>
        </section>

        <section className="pm-panel rounded-[28px] p-5">
          <p className="pm-kicker">Factory</p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">Deployment target</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">The market factory address below is the only contract input the UI needs to operate.</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Factory address</p>
            <p className="mt-2 break-all text-sm font-medium text-slate-900">{factoryAddress || 'Not configured'}</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
