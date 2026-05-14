import { formatUnits, parseUnits, type Signer } from 'ethers';
import { useEffect, useState } from 'react';
import { getMarketContract, getUsdcContract, loadFactoryMarkets, type MarketSummary } from '../lib/contracts';

interface MarketDetailPageProps {
  provider: import('ethers').BrowserProvider | null;
  signer: Signer | null;
  market: MarketSummary | null;
  factoryAddress: string;
  onBack: () => void;
  isSepolia: boolean;
  onUpdated: () => void;
}

const DEFAULT_YES_PRICE = 600000000000000000n;

export default function MarketDetailPage({ provider, signer, market, factoryAddress, onBack, isSepolia, onUpdated }: MarketDetailPageProps) {
  const [fakeUsdcAddress, setFakeUsdcAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Market state
  const [yesPrice, setYesPrice] = useState<bigint | null>(null);
  const [oneFusdc, setOneFusdc] = useState<bigint | null>(null);
  const [userBalance, setUserBalance] = useState<bigint | null>(null);
  
  // Position state (NEW)
  const [userYesBalance, setUserYesBalance] = useState<bigint | null>(null);
  const [userNoBalance, setUserNoBalance] = useState<bigint | null>(null);
  const [totalInvested, setTotalInvested] = useState<bigint | null>(null);
  
  // Order state
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [pendingSide, setPendingSide] = useState<'0' | '1'>('0');
  const [amount, setAmount] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isSepolia || !provider || !factoryAddress) {
      if (!isSepolia) setError('Sepolia 네트워크로 전환하세요.');
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await loadFactoryMarkets(provider!, factoryAddress);
        if (!cancelled) setFakeUsdcAddress(result.fakeUsdcAddress);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [provider, factoryAddress, isSepolia]);

  useEffect(() => {
    let isMounted = true;
    async function loadPricesAndBalance() {
      if (!signer || !market || !fakeUsdcAddress) return;
      try {
        const marketContract = getMarketContract(market.address, signer);
        const usdc = getUsdcContract(fakeUsdcAddress, signer);
        const address = await signer.getAddress();
        
        // Fetch user's YES/NO token balances and fUSDC balance
        const [price, pricePerSet, balance, yesBalance, noBalance] = await Promise.all([
          marketContract.yesPrice(),
          marketContract.PRICE_PER_SET(),
          usdc.balanceOf(address),
          marketContract.balanceOf(address, 0), // YES token
          marketContract.balanceOf(address, 1)  // NO token
        ]);
        
        if (isMounted) {
          setYesPrice(price as bigint);
          setOneFusdc(pricePerSet as bigint);
          setUserBalance(balance as bigint);
          setUserYesBalance(yesBalance as bigint);
          setUserNoBalance(noBalance as bigint);
        }
      } catch {
        if (isMounted) {
          setYesPrice(DEFAULT_YES_PRICE);
          setOneFusdc(1000000000000000000n);
          setUserYesBalance(0n);
          setUserNoBalance(0n);
        }
      }
    }
    loadPricesAndBalance();
    return () => { isMounted = false; };
  }, [market, signer, fakeUsdcAddress, isSubmitting]);

  if (!market) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300">No market selected.</p>
        <button onClick={onBack} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950">Back</button>
      </div>
    );
  }

  const noPrice = yesPrice !== null && oneFusdc !== null ? oneFusdc - yesPrice : null;
  const currentYesPrice = yesPrice ?? DEFAULT_YES_PRICE;
  const currentNoPrice = noPrice ?? (oneFusdc ?? 1000000000000000000n) - DEFAULT_YES_PRICE;
  
  const yesProb = oneFusdc ? Number((currentYesPrice * 100n) / oneFusdc) : 50;
  const noProb = 100 - yesProb;

  // Calculate position value (NEW)
  const yesValue = userYesBalance !== null ? (userYesBalance * currentYesPrice) / (oneFusdc ?? 1000000000000000000n) : 0n;
  const noValue = userNoBalance !== null ? (userNoBalance * currentNoPrice) / (oneFusdc ?? 1000000000000000000n) : 0n;
  const totalPositionValue = yesValue + noValue;
  
  const hasPosition = (userYesBalance ?? 0n) > 0n || (userNoBalance ?? 0n) > 0n;

  // Betting logic
  function getAmountWei() {
    try {
      const parsed = parseUnits(amount || '0', 18);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }

  async function handleBet() {
    if (!signer) { setStatus('지갑을 먼저 연결하세요.'); return; }
    const amountWei = getAmountWei();
    if (!amountWei) { setStatus('베팅 금액이 올바르지 않습니다.'); return; }
    if (!oneFusdc) { setStatus('컨트랙트 값을 불러올 수 없습니다.'); return; }

    setIsSubmitting(true);
    setStatus('승인과 베팅을 진행 중...');
    try {
      const usdc = getUsdcContract(fakeUsdcAddress, signer);
      const marketContract = getMarketContract(market!.address, signer);
      
      const approveTx = await usdc.approve(market!.address, amountWei);
      await approveTx.wait();
      
      const betTx = await marketContract.bet(Number(pendingSide), amountWei);
      await betTx.wait();
      
      setStatus('베팅이 완료되었습니다.');
      onUpdated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Bet failed');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  const amountWei = getAmountWei();
  const previewPrice = pendingSide === '0' ? currentYesPrice : currentNoPrice;
  const previewSharesWei = amountWei !== null && oneFusdc !== null ? (amountWei * oneFusdc) / previewPrice : null;
  const potentialReturn = previewSharesWei ? formatUnits(previewSharesWei, 18) : '0';

  return (
    <div className="max-w-[1200px] mx-auto pb-12 w-full font-sans">
      <button onClick={onBack} className="mb-6 flex items-center text-sm font-medium text-slate-400 hover:text-white transition">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        Markets
      </button>

      <div className="flex flex-col lg:flex-row gap-10">
        
        {/* Left Column: Market Info */}
        <div className="flex-1 space-y-8">
          <div className="flex items-center gap-4">
            {market.metadata.image ? (
              <img src={market.metadata.image} alt="" className="w-16 h-16 rounded-full object-cover shadow-sm bg-slate-800" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">?</div>
            )}
            <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight">{market.metadata.name}</h1>
          </div>

          <div className="flex items-center gap-6 border-b border-white/10 pb-8">
            <div className="flex flex-col">
              <span className="text-6xl font-bold text-emerald-400">{yesProb}%</span>
              <span className="text-sm font-semibold text-slate-400 mt-2 uppercase tracking-wide">Yes</span>
            </div>
            <div className="flex flex-col">
              <span className="text-6xl font-bold text-rose-400">{noProb}%</span>
              <span className="text-sm font-semibold text-slate-400 mt-2 uppercase tracking-wide">No</span>
            </div>
          </div>

          {loading && <p className="text-sm text-slate-400">Loading...</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}

          {/* YOUR POSITION SECTION (NEW) */}
          {hasPosition && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">Your Position</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* YES Position */}
                {(userYesBalance ?? 0n) > 0n && (
                  <div className="rounded-lg bg-slate-800/50 border border-emerald-500/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">YES</p>
                    <p className="text-2xl font-bold text-white">{parseFloat(formatUnits(userYesBalance ?? 0n, 18)).toFixed(2)}</p>
                    <p className="text-xs text-slate-400">
                      @ ${parseFloat(formatUnits(currentYesPrice, 18)).toFixed(2)}
                    </p>
                    <p className="text-sm font-semibold text-emerald-300">
                      ${parseFloat(formatUnits(yesValue, 18)).toFixed(2)}
                    </p>
                  </div>
                )}
                
                {/* NO Position */}
                {(userNoBalance ?? 0n) > 0n && (
                  <div className="rounded-lg bg-slate-800/50 border border-rose-500/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">NO</p>
                    <p className="text-2xl font-bold text-white">{parseFloat(formatUnits(userNoBalance ?? 0n, 18)).toFixed(2)}</p>
                    <p className="text-xs text-slate-400">
                      @ ${parseFloat(formatUnits(currentNoPrice, 18)).toFixed(2)}
                    </p>
                    <p className="text-sm font-semibold text-rose-300">
                      ${parseFloat(formatUnits(noValue, 18)).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              {/* Total Position Value */}
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-1">Total Position Value</p>
                <p className="text-3xl font-bold text-white">
                  ${parseFloat(formatUnits(totalPositionValue, 18)).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white">About</h3>
            {market.metadata.rules ? (
              <p className="text-base text-slate-300 whitespace-pre-wrap leading-relaxed">{market.metadata.rules}</p>
            ) : (
              <p className="text-sm text-slate-400">No additional information provided.</p>
            )}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="rounded-xl bg-white/5 p-4 border border-white/10">
                <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide font-semibold">Contract Address</p>
                <p className="text-sm text-slate-300 font-mono break-all">{market.address}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-4 border border-white/10">
                <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide font-semibold">End Time</p>
                <p className="text-sm text-slate-300">{new Date(Number(market.endTime) * 1000).toLocaleString()}</p>
              </div>
            </div>
            {market.isResolved && (
              <div className="mt-4 rounded-xl bg-sky-500/10 border border-sky-500/20 p-5">
                <h4 className="font-semibold text-sky-400 text-lg mb-1">Market Resolved</h4>
                <p className="text-base text-sky-200">This market has concluded. The winning side is {market.winningSide === 0n ? 'YES' : 'NO'}.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Order Panel (Sticky) */}
        <div className="lg:w-[380px] shrink-0">
          <div className="sticky top-6 rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button 
                onClick={() => setOrderType('buy')}
                className={`flex-1 py-4 text-sm font-bold transition ${orderType === 'buy' ? 'text-white border-b-2 border-sky-500' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Buy
              </button>
              <button 
                onClick={() => setOrderType('sell')}
                className={`flex-1 py-4 text-sm font-bold transition ${orderType === 'sell' ? 'text-white border-b-2 border-sky-500' : 'text-slate-500 hover:text-slate-300'}`}
                title="Selling currently not integrated in this view"
              >
                Sell
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Outcome Selection */}
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingSide('0')}
                  disabled={market.isResolved || orderType === 'sell'}
                  className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition ${pendingSide === '0' ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent bg-slate-800 hover:bg-slate-700'} ${market.isResolved ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`text-base font-bold ${pendingSide === '0' ? 'text-emerald-400' : 'text-slate-300'}`}>Yes {yesProb}%</span>
                </button>
                <button
                  onClick={() => setPendingSide('1')}
                  disabled={market.isResolved || orderType === 'sell'}
                  className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition ${pendingSide === '1' ? 'border-rose-500 bg-rose-500/10' : 'border-transparent bg-slate-800 hover:bg-slate-700'} ${market.isResolved ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`text-base font-bold ${pendingSide === '1' ? 'text-rose-400' : 'text-slate-300'}`}>No {noProb}%</span>
                </button>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <span>Amount</span>
                  <span>Balance: {userBalance !== null ? parseFloat(formatUnits(userBalance, 18)).toFixed(2) : '0'} fUSDC</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={market.isResolved || orderType === 'sell'}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-xl font-bold text-white outline-none focus:border-sky-500 transition disabled:opacity-50"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">fUSDC</div>
                </div>
              </div>

              {/* Returns Summary */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-slate-400">Est. Shares</span>
                  <span className="text-white">{amountWei ? parseFloat(formatUnits(previewSharesWei ?? 0n, 18)).toFixed(2) : '0.00'}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-slate-400">Potential return</span>
                  <span className="text-emerald-400 text-lg font-bold">
                    {amountWei ? `$${parseFloat(potentialReturn).toFixed(2)}` : '$0.00'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="text-slate-400">Avg price</span>
                  <span className="text-white">
                    ${parseFloat(formatUnits(previewPrice, 18)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              {status && (
                <div className={`p-4 rounded-xl text-sm font-bold text-center ${status.includes('완료') ? 'bg-emerald-500/20 text-emerald-300' : status.includes('승인') ? 'bg-sky-500/20 text-sky-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {status}
                </div>
              )}
              
              <button
                onClick={handleBet}
                disabled={isSubmitting || market.isResolved || !amountWei || orderType === 'sell'}
                className="w-full rounded-2xl bg-sky-500 py-4 text-lg font-bold text-white transition hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Processing...' : (market.isResolved ? 'Market Resolved' : (orderType === 'sell' ? 'Sell not available' : 'Place Order'))}
              </button>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
