import { formatUnits, parseUnits, type Signer, type TypedDataField } from 'ethers';
import { useEffect, useMemo, useState } from 'react';
import { fetchMarketMatches, fetchMarketTrades, fetchOrderbookSnapshot, submitMarketOrder, type BackendMatchesResponse, type BackendOrderbookSnapshot, type BackendTrade } from '../lib/backend';
import { getMarketContract, getUsdcContract, loadFactoryMarkets, type MarketSummary } from '../lib/contracts';

interface HolderRankingEntry {
  address: string;
  balance: bigint;
}

interface MarketDetailPageProps {
  provider: import('ethers').BrowserProvider | null;
  signer: Signer | null;
  market: MarketSummary | null;
  factoryAddress: string;
  onBack: () => void;
  isSepolia: boolean;
  onUpdated: () => void;
}

const PRICE_PER_SET = 1000000000000000000n;
const DEFAULT_PRICE = 500000000000000000n;
const ORDER_TYPES: Record<string, TypedDataField[]> = {
  Order: [
    { name: 'maker', type: 'address' },
    { name: 'targetId', type: 'uint256' },
    { name: 'isBuy', type: 'bool' },
    { name: 'price', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

type OrderBookSide = BackendOrderbookSnapshot['yes'];

function formatPriceWei(value?: string) {
  if (!value) return '--';
  return Number(formatUnits(BigInt(value), 18)).toFixed(3);
}

function bestPrice(side: OrderBookSide | undefined, key: 'bids' | 'asks') {
  return side?.[key]?.[0]?.price;
}

function midpointPrice(side: OrderBookSide | undefined) {
  const bid = bestPrice(side, 'bids');
  const ask = bestPrice(side, 'asks');
  if (bid && ask) {
    return (BigInt(bid) + BigInt(ask)) / 2n;
  }
  if (bid) return BigInt(bid);
  if (ask) return BigInt(ask);
  return DEFAULT_PRICE;
}

function orderBookToRows(side: OrderBookSide | undefined, type: 'bids' | 'asks') {
  return (side?.[type] ?? []).slice(0, 5);
}

function tradeSideLabel(trade: BackendTrade) {
  return trade.isBuy ? 'BUY' : 'SELL';
}

export default function MarketDetailPage({ provider, signer, market, factoryAddress, onBack, isSepolia, onUpdated }: MarketDetailPageProps) {
  const [fakeUsdcAddress, setFakeUsdcAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BackendOrderbookSnapshot | null>(null);
  const [trades, setTrades] = useState<BackendTrade[]>([]);
  const [matches, setMatches] = useState<BackendMatchesResponse | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [userBalance, setUserBalance] = useState<bigint | null>(null);
  const [userYesBalance, setUserYesBalance] = useState<bigint | null>(null);
  const [userNoBalance, setUserNoBalance] = useState<bigint | null>(null);
  const [yesRankings, setYesRankings] = useState<HolderRankingEntry[]>([]);
  const [noRankings, setNoRankings] = useState<HolderRankingEntry[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [rankingsError, setRankingsError] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [pendingSide, setPendingSide] = useState<'0' | '1'>('0');
  const [amount, setAmount] = useState('10');
  const [limitPrice, setLimitPrice] = useState('0.500');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isSepolia || !provider || !factoryAddress) {
      if (!isSepolia) setError('Sepolia 네트워크로 전환하세요.');
      return;
    }

    let cancelled = false;
    async function load() {
      const activeProvider = provider;
      if (!activeProvider) return;
      setLoading(true);
      try {
        const result = await loadFactoryMarkets(activeProvider, factoryAddress);
        if (!cancelled) setFakeUsdcAddress(result.fakeUsdcAddress);
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

  useEffect(() => {
    let isMounted = true;

    async function loadBalances() {
      if (!signer || !market) return;

      try {
        const marketContract = getMarketContract(market.address, signer);
        const usdc = fakeUsdcAddress ? getUsdcContract(fakeUsdcAddress, signer) : null;
        const address = await signer.getAddress();
        const [balance, yesBalance, noBalance] = await Promise.all([
          usdc ? usdc.balanceOf(address) : Promise.resolve(0n),
          marketContract.balanceOf(address, 0),
          marketContract.balanceOf(address, 1),
        ]);

        if (isMounted) {
          setUserBalance(balance as bigint);
          setUserYesBalance(yesBalance as bigint);
          setUserNoBalance(noBalance as bigint);
        }
      } catch {
        if (isMounted) {
          setUserBalance(null);
          setUserYesBalance(0n);
          setUserNoBalance(0n);
        }
      }
    }

    void loadBalances();
    return () => {
      isMounted = false;
    };
  }, [market, signer, fakeUsdcAddress, isSubmitting]);

  useEffect(() => {
    let isMounted = true;

    async function loadOrderbook() {
      if (!market) return;
      try {
        const [orderbook, tradeResponse, matchResponse] = await Promise.all([
          fetchOrderbookSnapshot(market.address),
          fetchMarketTrades(market.address, 20),
          fetchMarketMatches(market.address),
        ]);
        if (!isMounted) return;
        setSnapshot(orderbook);
        setTrades(tradeResponse.trades);
        setMatches(matchResponse);
      } catch (err) {
        if (!isMounted) return;
        setSnapshot(null);
        setTrades([]);
        setMatches(null);
        setStatus(err instanceof Error ? err.message : 'Failed to load orderbook');
      }
    }

    void loadOrderbook();
    return () => {
      isMounted = false;
    };
  }, [market, refreshTick]);

  useEffect(() => {
    let isMounted = true;

    async function loadHolderRankings() {
      if (!provider || !market) return;

      setRankingsLoading(true);
      setRankingsError(null);

      try {
        const marketContract = getMarketContract(market.address, provider);
        const transferEvents = await marketContract.queryFilter(marketContract.filters.TransferSingle(), 0, 'latest');

        const balances = new Map<string, { yes: bigint; no: bigint }>();

        for (const event of transferEvents) {
          const parsed = marketContract.interface.parseLog(event);
          if (!parsed || parsed.name !== 'TransferSingle') continue;

          const from = String(parsed.args.from).toLowerCase();
          const to = String(parsed.args.to).toLowerCase();
          const id = BigInt(parsed.args.id);
          const value = BigInt(parsed.args.value);

          if (id !== 0n && id !== 1n) continue;

          if (from !== '0x0000000000000000000000000000000000000000') {
            const current = balances.get(from) ?? { yes: 0n, no: 0n };
            if (id === 0n) current.yes -= value;
            if (id === 1n) current.no -= value;
            balances.set(from, current);
          }

          if (to !== '0x0000000000000000000000000000000000000000') {
            const current = balances.get(to) ?? { yes: 0n, no: 0n };
            if (id === 0n) current.yes += value;
            if (id === 1n) current.no += value;
            balances.set(to, current);
          }
        }

        const compareRank = (left: HolderRankingEntry, right: HolderRankingEntry) => {
          if (left.balance === right.balance) return left.address.localeCompare(right.address);
          return left.balance > right.balance ? -1 : 1;
        };

        const yesEntries = Array.from(balances.entries())
          .map(([address, balance]) => ({ address, balance: balance.yes }))
          .filter((entry) => entry.balance > 0n)
          .sort(compareRank)
          .slice(0, 10);

        const noEntries = Array.from(balances.entries())
          .map(([address, balance]) => ({ address, balance: balance.no }))
          .filter((entry) => entry.balance > 0n)
          .sort(compareRank)
          .slice(0, 10);

        if (isMounted) {
          setYesRankings(yesEntries);
          setNoRankings(noEntries);
        }
      } catch (err) {
        if (isMounted) {
          setRankingsError(err instanceof Error ? err.message : 'Failed to load holder rankings');
          setYesRankings([]);
          setNoRankings([]);
        }
      } finally {
        if (isMounted) setRankingsLoading(false);
      }
    }

    void loadHolderRankings();
    return () => {
      isMounted = false;
    };
  }, [market, provider]);

  const yesSide = snapshot?.yes;
  const noSide = snapshot?.no;
  const yesMarkPrice = midpointPrice(yesSide);
  const noMarkPrice = midpointPrice(noSide);
  const yesProb = Number((yesMarkPrice * 100n) / PRICE_PER_SET);
  const noProb = 100 - yesProb;

  const yesValue = userYesBalance !== null ? (userYesBalance * yesMarkPrice) / PRICE_PER_SET : 0n;
  const noValue = userNoBalance !== null ? (userNoBalance * noMarkPrice) / PRICE_PER_SET : 0n;
  const totalPositionValue = yesValue + noValue;

  const hasPosition = (userYesBalance ?? 0n) > 0n || (userNoBalance ?? 0n) > 0n;
  const selectedSideLabel = pendingSide === '0' ? 'YES' : 'NO';
  const selectedTokenBalance = pendingSide === '0' ? (userYesBalance ?? 0n) : (userNoBalance ?? 0n);
  const selectedSideBook = pendingSide === '0' ? yesSide : noSide;
  const selectedPriceFallback = orderType === 'buy' ? bestPrice(selectedSideBook, 'asks') : bestPrice(selectedSideBook, 'bids');
  const selectedPriceWei = selectedPriceFallback ? BigInt(selectedPriceFallback) : DEFAULT_PRICE;

  const amountWei = useMemo(() => {
    try {
      const parsed = parseUnits(amount || '0', 18);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [amount]);

  const priceWei = useMemo(() => {
    try {
      const parsed = parseUnits(limitPrice || '0', 18);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [limitPrice]);

  useEffect(() => {
    const fallback = selectedPriceWei === DEFAULT_PRICE ? '0.500' : formatUnits(selectedPriceWei, 18);
    setLimitPrice(fallback);
  }, [orderType, pendingSide, selectedPriceWei, market?.address]);

  async function handleSubmitOrder() {
    if (!signer) {
      setStatus('지갑을 먼저 연결하세요.');
      return;
    }
    if (!market || !fakeUsdcAddress) {
      setStatus('시장 정보를 불러오는 중입니다.');
      return;
    }
    if (!amountWei || amountWei <= 0n) {
      setStatus('수량이 올바르지 않습니다.');
      return;
    }
    if (!priceWei || priceWei <= 0n) {
      setStatus('가격이 올바르지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    setStatus('주문 서명과 등록을 진행 중...');

    try {
      const marketContract = getMarketContract(market.address, signer);
      const usdc = getUsdcContract(fakeUsdcAddress, signer);
      const address = await signer.getAddress();
      const network = signer.provider ? await signer.provider.getNetwork() : null;
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
      const nonce = BigInt(Date.now());
      const isBuy = orderType === 'buy';
      const targetId = Number(pendingSide) as 0 | 1;

      if (isBuy) {
        const requiredCost = (amountWei * priceWei) / PRICE_PER_SET;
        const allowance = await usdc.allowance(address, market.address);
        if (allowance < requiredCost) {
          setStatus('USDC 승인 중...');
          const approveTx = await usdc.approve(market.address, requiredCost);
          await approveTx.wait();
        }
      } else {
        const approved = await marketContract.isApprovedForAll(address, market.address);
        if (!approved) {
          setStatus('포지션 승인 중...');
          const approvePositionTx = await marketContract.setApprovalForAll(market.address, true);
          await approvePositionTx.wait();
        }
      }

      if (!network) {
        throw new Error('네트워크 정보를 불러올 수 없습니다.');
      }

      const message = {
        maker: address,
        targetId: BigInt(targetId),
        isBuy,
        price: priceWei,
        amount: amountWei,
        expiry,
        nonce,
      };

      const signature = await signer.signTypedData(
        {
          name: 'PredictionMarket',
          version: '1',
          chainId: Number(network.chainId),
          verifyingContract: market.address,
        },
        ORDER_TYPES,
        message,
      );

      await submitMarketOrder(market.address, {
        maker: address,
        targetId,
        isBuy,
        price: priceWei.toString(),
        amount: amountWei.toString(),
        expiry: expiry.toString(),
        nonce: nonce.toString(),
        signature,
      });

      setStatus('주문이 등록되었습니다.');
      setRefreshTick((value) => value + 1);
      onUpdated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Order failed');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setStatus(null), 3500);
    }
  }

  if (!market) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300">No market selected.</p>
        <button onClick={onBack} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950">Back</button>
      </div>
    );
  }

  const amountCostWei = amountWei && priceWei ? (amountWei * priceWei) / PRICE_PER_SET : null;
  const summaryLabel = orderType === 'buy' ? 'Est. Cost' : 'Est. Receive';
  const summaryValue = amountCostWei ? formatUnits(amountCostWei, 18) : '0.000';
  const summarySuffix = ' fUSDC';
  const currentPriceLabel = priceWei ? formatUnits(priceWei, 18) : '0.000';
  const formatRankingBalance = (value: bigint) => parseFloat(formatUnits(value, 18)).toFixed(2);
  const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
  const formatMatchAmount = (value: string) => formatUnits(BigInt(value), 18);
  const formatMatchPrice = (value: string) => formatUnits(BigInt(value), 18);

  function RankingPanel({ title, accent, entries }: { title: string; accent: string; entries: HolderRankingEntry[] }) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">{title}</h4>
          <span className={`text-xs font-semibold ${accent}`}>Top 10</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">아직 랭킹 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <div key={entry.address} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`w-6 text-right text-xs font-bold ${accent}`}>#{index + 1}</span>
                  <span className="truncate font-mono text-sm text-slate-600">{shortenAddress(entry.address)}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-950">{formatRankingBalance(entry.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="pm-btn-secondary w-fit px-4 py-2 text-sm font-semibold">
        <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Markets
      </button>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_392px]">
        <div className="space-y-6">
          <section className="pm-panel overflow-hidden rounded-[32px]">
            <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="relative min-h-[240px] bg-slate-100 lg:min-h-full">
                {market.metadata.image ? (
                  <img src={market.metadata.image} alt={market.metadata.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[240px] w-full items-center justify-center bg-[linear-gradient(135deg,#dbeafe_0%,#f8fafc_60%,#ecfeff_100%)] text-sm font-medium text-slate-400">
                    No image
                  </div>
                )}
                <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-700 shadow-sm">
                  {market.isResolved ? 'Resolved' : 'Live'}
                </div>
              </div>

              <div className="p-6 md:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pm-kicker">Market</span>
                  <span className="pm-chip font-mono text-[11px] text-slate-500">{shortenAddress(market.address)}</span>
                  <span className={`pm-chip ${market.isResolved ? 'pm-chip-no' : 'pm-chip-yes'}`}>
                    {market.isResolved ? 'Settled' : 'Trading'}
                  </span>
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 lg:text-4xl">{market.metadata.name}</h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{market.metadata.rules || 'No additional information provided.'}</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">YES</p>
                    <p className="mt-2 text-3xl font-semibold text-emerald-700">{yesProb}%</p>
                    <p className="mt-1 text-sm text-slate-500">Mid {formatUnits(yesMarkPrice, 18)} fUSDC</p>
                  </div>
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">NO</p>
                    <p className="mt-2 text-3xl font-semibold text-rose-700">{noProb}%</p>
                    <p className="mt-1 text-sm text-slate-500">Mid {formatUnits(noMarkPrice, 18)} fUSDC</p>
                  </div>
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Position value</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">${parseFloat(formatUnits(totalPositionValue, 18)).toFixed(2)}</p>
                    <p className="mt-1 text-sm text-slate-500">Current holdings</p>
                  </div>
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">End</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{new Date(Number(market.endTime) * 1000).toLocaleString()}</p>
                    <p className="mt-1 text-sm text-slate-500">Contract schedule</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <span className="pm-chip">Network-backed</span>
                  <span className="pm-chip">Orderbook preview</span>
                  {market.isResolved ? <span className="pm-chip pm-chip-no">Winning side: {market.winningSide === 0n ? 'YES' : 'NO'}</span> : null}
                </div>
              </div>
            </div>
          </section>

          {loading ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">Loading...</div> : null}
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div> : null}
          {rankingsError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{rankingsError}</div> : null}

          {hasPosition ? (
            <section className="pm-panel rounded-[28px] p-5 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="pm-kicker">Your Position</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Current holdings in this market</h2>
                </div>
                <span className="pm-chip pm-chip-yes">Open position</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {(userYesBalance ?? 0n) > 0n ? (
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">YES</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">{formatRankingBalance(userYesBalance ?? 0n)}</p>
                    <p className="mt-1 text-sm text-slate-500">@ {formatUnits(yesMarkPrice, 18)} fUSDC</p>
                    <p className="mt-2 text-sm font-semibold text-emerald-700">${parseFloat(formatUnits(yesValue, 18)).toFixed(2)}</p>
                  </div>
                ) : null}

                {(userNoBalance ?? 0n) > 0n ? (
                  <div className="pm-statbox p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">NO</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">{formatRankingBalance(userNoBalance ?? 0n)}</p>
                    <p className="mt-1 text-sm text-slate-500">@ {formatUnits(noMarkPrice, 18)} fUSDC</p>
                    <p className="mt-2 text-sm font-semibold text-rose-700">${parseFloat(formatUnits(noValue, 18)).toFixed(2)}</p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="pm-panel rounded-[28px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pm-kicker">Orderbook</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Best bids and asks</h2>
              </div>
              <span className="pm-chip">Snapshot</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { label: 'YES', side: yesSide, accent: 'emerald' },
                { label: 'NO', side: noSide, accent: 'rose' },
              ].map((entry) => (
                <div key={entry.label} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className={`text-sm font-bold uppercase tracking-[0.24em] ${entry.accent === 'emerald' ? 'text-emerald-700' : 'text-rose-700'}`}>{entry.label}</h4>
                    <span className="text-xs font-medium text-slate-500">Bid / Ask</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Bids</p>
                      <div className="space-y-2">
                        {orderBookToRows(entry.side, 'bids').length === 0 ? (
                          <p className="text-sm text-slate-500">No bids</p>
                        ) : orderBookToRows(entry.side, 'bids').map((level) => (
                          <div key={`${entry.label}-bid-${level.price}`} className="flex items-center justify-between rounded-2xl border border-white bg-white px-3 py-2">
                            <span className="font-mono text-slate-700">{formatPriceWei(level.price)}</span>
                            <span className="text-slate-500">{formatUnits(BigInt(level.amount), 18)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Asks</p>
                      <div className="space-y-2">
                        {orderBookToRows(entry.side, 'asks').length === 0 ? (
                          <p className="text-sm text-slate-500">No asks</p>
                        ) : orderBookToRows(entry.side, 'asks').map((level) => (
                          <div key={`${entry.label}-ask-${level.price}`} className="flex items-center justify-between rounded-2xl border border-white bg-white px-3 py-2">
                            <span className="font-mono text-slate-700">{formatPriceWei(level.price)}</span>
                            <span className="text-slate-500">{formatUnits(BigInt(level.amount), 18)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pm-panel rounded-[28px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pm-kicker">Matching</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Matching preview</h2>
              </div>
              <span className="pm-chip">Crossable orders</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {([
                { label: 'YES', preview: matches?.yes, accent: 'emerald' },
                { label: 'NO', preview: matches?.no, accent: 'rose' },
              ] as const).map((entry) => (
                <div key={entry.label} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className={`text-sm font-bold uppercase tracking-[0.24em] ${entry.accent === 'emerald' ? 'text-emerald-700' : 'text-rose-700'}`}>{entry.label}</h4>
                    <span className="text-xs font-medium text-slate-500">crossable orders</span>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between rounded-2xl border border-white bg-white px-3 py-2">
                      <span>Best Bid</span>
                      <span className="font-mono text-slate-950">{entry.preview?.bestBid ? formatMatchPrice(entry.preview.bestBid) : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-white bg-white px-3 py-2">
                      <span>Best Ask</span>
                      <span className="font-mono text-slate-950">{entry.preview?.bestAsk ? formatMatchPrice(entry.preview.bestAsk) : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-white bg-white px-3 py-2">
                      <span>Total Matched</span>
                      <span className="font-mono text-slate-950">{entry.preview ? formatMatchAmount(entry.preview.totalMatchedAmount) : '--'}</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {entry.preview?.matches.length ? (
                      entry.preview.matches.slice(0, 5).map((match) => (
                        <div key={`${entry.label}-${match.buyOrderHash}-${match.sellOrderHash}`} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-slate-950">{formatMatchAmount(match.amount)} shares</span>
                            <span className="font-mono text-slate-500">@ {formatMatchPrice(match.executionPrice)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="truncate">Buy {shortenAddress(match.buyMaker)}</span>
                            <span className="truncate">Sell {shortenAddress(match.sellMaker)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No crossable orders yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pm-panel rounded-[28px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pm-kicker">Trades</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Recent trades</h2>
              </div>
              <span className="pm-chip">Latest activity</span>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              {trades.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">No trades yet.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Side</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr key={trade.id} className="border-t border-slate-100">
                        <td className={`px-4 py-3 font-semibold ${trade.isBuy ? 'text-emerald-700' : 'text-rose-700'}`}>{tradeSideLabel(trade)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatPriceWei(trade.price)}</td>
                        <td className="px-4 py-3 text-slate-700">{formatUnits(BigInt(trade.amount), 18)}</td>
                        <td className="px-4 py-3 text-slate-500">{new Date(trade.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="pm-panel rounded-[28px] p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="pm-kicker">Rankings</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Holder rankings</h2>
              </div>
              {rankingsLoading && <span className="text-xs font-medium text-slate-500">Loading...</span>}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <RankingPanel title="YES holders" accent="text-emerald-700" entries={yesRankings} />
              <RankingPanel title="NO holders" accent="text-rose-700" entries={noRankings} />
            </div>
          </section>

          <section className="pm-panel rounded-[28px] p-5 md:p-6">
            <p className="pm-kicker">About</p>
            <div className="mt-4 space-y-4">
              {market.metadata.rules ? (
                <p className="whitespace-pre-wrap text-base leading-7 text-slate-600">{market.metadata.rules}</p>
              ) : (
                <p className="text-sm text-slate-500">No additional information provided.</p>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="pm-statbox p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Contract Address</p>
                  <p className="mt-2 break-all font-mono text-sm text-slate-700">{market.address}</p>
                </div>
                <div className="pm-statbox p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">End Time</p>
                  <p className="mt-2 text-sm text-slate-700">{new Date(Number(market.endTime) * 1000).toLocaleString()}</p>
                </div>
              </div>

              {market.isResolved ? (
                <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
                  <h4 className="mb-1 text-lg font-semibold text-sky-700">Market Resolved</h4>
                  <p className="text-base text-sky-900">This market has concluded. The winning side is {market.winningSide === 0n ? 'YES' : 'NO'}.</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-4 self-start xl:sticky xl:top-6">
          <section className="pm-panel rounded-[32px] p-5 md:p-6">
            <div>
              <p className="pm-kicker">Create Order</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Place signed order</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">주문은 백엔드에 저장되고, 실제 체결은 온체인으로 처리됩니다.</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-[24px] bg-slate-100 p-2">
              {(['buy', 'sell'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOrderType(type)}
                  className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${orderType === type ? 'bg-slate-950 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-950'}`}
                >
                  {type === 'buy' ? 'BUY' : 'SELL'}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-[24px] bg-slate-100 p-2">
              {(['0', '1'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPendingSide(side)}
                  className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${pendingSide === side ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:text-slate-950'}`}
                >
                  {side === '0' ? 'YES' : 'NO'}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <label className="pm-label">
                Amount (Shares)
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="예: 10"
                  className="pm-input mt-2"
                />
              </label>

              <label className="pm-label">
                Limit Price (fUSDC)
                <input
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(event.target.value)}
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="예: 0.500"
                  className="pm-input mt-2"
                />
              </label>
            </div>

            <div className="mt-5 space-y-2 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-4">
                <span>Side</span>
                <span className="font-semibold text-slate-950">{selectedSideLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Order Type</span>
                <span className="font-semibold text-slate-950">{orderType.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Limit Price</span>
                <span className="font-semibold text-slate-950">{currentPriceLabel} fUSDC</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>{summaryLabel}</span>
                <span className="font-semibold text-emerald-700">
                  {summaryValue}{summarySuffix}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Wallet Balance</span>
                <span className="font-semibold text-slate-950">{userBalance !== null ? formatUnits(userBalance, 18) : '0'} fUSDC</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSubmitOrder()}
              disabled={isSubmitting || market.isResolved}
              className="pm-btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Working...' : 'Sign & Submit Order'}
            </button>

            {status ? <p className="mt-3 text-sm font-medium text-slate-600">{status}</p> : null}
            <p className="mt-2 text-xs leading-5 text-slate-500">주문은 백엔드에 저장되고, 체결 엔진이 같은 형태의 signed order를 나중에 fillOrder로 처리합니다.</p>
          </section>

          <section className="pm-panel rounded-[28px] p-5">
            <p className="pm-kicker">Quick stats</p>
            <div className="mt-4 grid gap-3">
              <div className="pm-statbox p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">YES balance</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{selectedSideLabel === 'YES' ? formatUnits(selectedTokenBalance, 18) : formatUnits(userYesBalance ?? 0n, 18)}</p>
              </div>
              <div className="pm-statbox p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">NO balance</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{selectedSideLabel === 'NO' ? formatUnits(selectedTokenBalance, 18) : formatUnits(userNoBalance ?? 0n, 18)}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
