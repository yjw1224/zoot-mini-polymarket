import { formatUnits, parseUnits, type Signer } from 'ethers';
import { useEffect, useState } from 'react';
import { getMarketContract, getUsdcContract, type MarketSummary } from '../lib/contracts';

interface MarketCardProps {
  market: MarketSummary;
  fakeUsdcAddress: string;
  signer: Signer | null;
  onUpdated: () => void;
  compact?: boolean;
  onOpen?: (market: MarketSummary, preselectSide?: '0' | '1') => void;
}

const DEFAULT_YES_PRICE = 600000000000000000n;

export default function MarketCard({ market, fakeUsdcAddress, signer, onUpdated, compact = false, onOpen, }: MarketCardProps) {
  const isResolved = market.isResolved;
  const isWinnerYes = Number(market.winningSide) === 0;
  const [yesPrice, setYesPrice] = useState<bigint | null>(null);
  const [oneFusdc, setOneFusdc] = useState<bigint | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [pendingSide, setPendingSide] = useState<'0' | '1' | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const noPrice = yesPrice !== null && oneFusdc !== null ? oneFusdc - yesPrice : null;

  function getQuantityWei() {
    try {
      const parsedQuantity = parseUnits(quantity || '0', 18);
      return parsedQuantity > 0n ? parsedQuantity : null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadPrices() {
      if (!signer) {
        return;
      }

      try {
        const marketContract = getMarketContract(market.address, signer);
        const price = (await marketContract.yesPrice()) as bigint;
        const pricePerSet = (await marketContract.PRICE_PER_SET()) as bigint;
        if (isMounted) {
          setYesPrice(price);
          setOneFusdc(pricePerSet);
        }
      } catch {
        if (isMounted) {
          setYesPrice(DEFAULT_YES_PRICE);
          setOneFusdc(1_000000000000000000n);
        }
      }
    }

    loadPrices();

    return () => {
      isMounted = false;
    };
  }, [market.address, signer]);

  function openConfirm(side: '0' | '1') {
    setPendingSide(side);
    setStatus(null);

    if (getQuantityWei() === null) {
      setStatus('수량을 먼저 입력하세요.');
      return;
    }

    setIsConfirmOpen(true);
  }

  async function handleBet() {
    if (!signer) {
      setStatus('지갑을 먼저 연결하세요.');
      return;
    }

    if (pendingSide === null) {
      setStatus('베팅 방향을 먼저 선택하세요.');
      return;
    }

    const quantityWei = getQuantityWei();
    if (quantityWei === null) {
      setStatus('수량을 먼저 입력하세요.');
      return;
    }

    if (oneFusdc === null) {
      setStatus('컨트랙트 값을 불러올 수 없습니다.');
      return;
    }

    const price = pendingSide === '0' ? yesPrice ?? DEFAULT_YES_PRICE : noPrice ?? (oneFusdc - DEFAULT_YES_PRICE);
    const amountWei = (quantityWei * price) / oneFusdc;

    if (amountWei <= 0n) {
      setStatus('베팅 금액이 올바르지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    setStatus('승인과 베팅을 진행 중...');

    try {
      const usdc = getUsdcContract(fakeUsdcAddress, signer);
      const marketContract = getMarketContract(market.address, signer);

      setIsConfirmOpen(false);

      const approveTx = await usdc.approve(market.address, amountWei);
      await approveTx.wait();

      const betTx = await marketContract.bet(Number(pendingSide), amountWei);
      await betTx.wait();

      setStatus('베팅이 완료되었습니다.');
      onUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bet failed';
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const quantityWei = getQuantityWei();
  const previewPrice = pendingSide === '0' ? yesPrice ?? DEFAULT_YES_PRICE : noPrice ?? (oneFusdc ?? 1_000000000000000000n) - DEFAULT_YES_PRICE;
  const previewAmountWei = quantityWei !== null && oneFusdc !== null ? (quantityWei * previewPrice) / oneFusdc : null;

  return (
    <article
      onClick={() => onOpen?.(market)}
      className={`overflow-hidden rounded-3xl border border-white/10 bg-white/5 ${compact ? 'cursor-pointer hover:shadow-lg' : ''}`}
    >
      <div className={`grid gap-0 ${compact ? 'grid-cols-[96px_1fr] items-center' : 'md:grid-cols-[240px_1fr]'}`}>
        <div className="bg-slate-900 flex items-center justify-center p-4">
          {market.metadata.image ? (
            <img
              src={market.metadata.image}
              alt={market.metadata.name}
              className="w-20 h-20 md:w-28 md:h-28 object-cover rounded-lg"
            />
          ) : (
            <div className="flex w-20 h-20 md:w-28 md:h-28 items-center justify-center text-sm text-slate-500">No image</div>
          )}
        </div>

        <div className="space-y-2 p-3 md:p-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className={`font-semibold text-white ${compact ? 'text-lg' : 'text-2xl'}`}>{market.metadata.name}</h3>
                {!compact ? <p className="mt-1 break-all text-xs text-slate-400">{market.address}</p> : null}
              </div>
              {!compact ? (
                <p className="text-xs text-slate-400">End {new Date(Number(market.endTime) * 1000).toLocaleString()}</p>
              ) : null}
            </div>

            {!compact ? (
              <p className="text-sm text-slate-300">Status: {isResolved ? `Resolved (${isWinnerYes ? 'YES' : 'NO'})` : 'Open'}</p>
            ) : null}
          </div>

          <div className={`${compact ? 'flex items-center gap-3' : 'grid gap-3 lg:grid-cols-[200px_1fr]'}`}>
            <div className={`${compact ? 'flex items-center gap-2' : 'flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3'}`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (compact) {
                    onOpen?.(market, '0');
                    return;
                  }
                  openConfirm('0');
                }}
                disabled={isSubmitting || isResolved}
                className={`rounded-lg border ${compact ? 'border-emerald-400/40 bg-emerald-400/10 px-3 py-2' : 'border-emerald-400/30 bg-emerald-400/10 px-4 py-4'} text-left transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">YES</div>
                <div className={`${compact ? 'text-sm' : 'mt-1 text-2xl'} font-semibold text-white`}>{yesPrice !== null ? formatUnits(yesPrice, 18) : '--'}</div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (compact) {
                    onOpen?.(market, '1');
                    return;
                  }
                  openConfirm('1');
                }}
                disabled={isSubmitting || isResolved}
                className={`rounded-lg border ${compact ? 'border-rose-400/40 bg-rose-400/10 px-3 py-2' : 'border-rose-400/30 bg-rose-400/10 px-4 py-4'} text-left transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">NO</div>
                <div className={`${compact ? 'text-sm' : 'mt-1 text-2xl'} font-semibold text-white`}>{noPrice !== null ? formatUnits(noPrice, 18) : '--'}</div>
              </button>
            </div>

            {!compact ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">수량</label>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="예: 10"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-lg text-white outline-none placeholder:text-slate-500"
                />

                {yesPrice !== null ? (
                  <p className="mt-3 text-sm text-slate-400">
                    YES {formatUnits(yesPrice, 18)} fUSDC / NO {formatUnits(noPrice ?? 0n, 18)} fUSDC
                  </p>
                ) : null}

                <p className="mt-3 text-xs text-slate-500">수량 입력 후 왼쪽 YES 또는 NO를 누르면 확인창이 뜹니다.</p>
              </div>
            ) : null}
          </div>

          {isConfirmOpen && quantityWei !== null ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
              <p className="text-sm font-semibold text-white">베팅 확인</p>
              <div className="mt-3 space-y-1 text-sm text-slate-300">
                <p>방향: {pendingSide === '0' ? 'YES' : 'NO'}</p>
                <p>수량: {formatUnits(quantityWei, 18)}</p>
                <p>예상 지불액: {formatUnits(previewAmountWei ?? 0n, 18)} fUSDC</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/5"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleBet}
                  disabled={isSubmitting || isResolved}
                  className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Working...' : '확인 후 베팅'}
                </button>
              </div>
            </div>
          ) : null}

          {status ? <p className="text-sm text-slate-300">{status}</p> : null}
        </div>
      </div>
    </article>
  );
}
