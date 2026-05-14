interface HomePageProps {
  account: string | null;
  factoryAddress: string;
  onFactoryAddressChange: (value: string) => void;
  onConnectWallet: () => Promise<void>;
  isConnecting: boolean;
  walletError: string | null;
  networkLabel: string;
  isSepolia: boolean;
}

export default function HomePage({
  account,
  factoryAddress,
  onFactoryAddressChange,
  onConnectWallet,
  isConnecting,
  walletError,
  networkLabel,
  isSepolia,
}: HomePageProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-sky-300">Home</p>
        <h1 className="text-3xl font-semibold text-white">ZOOT prediction market</h1>
        <p className="max-w-xl text-sm text-slate-300">
          MetaMask를 연결하고 Factory 주소를 넣으면, 생성된 market 목록을 보고 바로 베팅할 수 있습니다.
        </p>
        <p className={`text-sm ${isSepolia ? 'text-emerald-300' : 'text-amber-300'}`}>Current network: {networkLabel}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-lg font-medium text-white">Wallet</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={isConnecting}
              className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
            </button>
            
          </div>
          <p className="mt-3 break-all text-sm text-slate-300">
            {account ?? 'Not connected'}
          </p>
          {walletError ? <p className="mt-2 text-sm text-rose-300">{walletError}</p> : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-lg font-medium text-white">Factory</h2>
          <label className="block text-sm text-slate-300">Factory address</label>
          <input
            value={factoryAddress}
            onChange={(event) => onFactoryAddressChange(event.target.value)}
            placeholder="0x..."
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          />
          <p className="mt-2 text-xs text-slate-400">
            이 주소가 있어야 Betting/Create 페이지에서 Factory와 연결됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}
