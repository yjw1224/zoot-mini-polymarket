import { Contract, type Signer } from 'ethers';
import { type FormEvent, type FocusEvent, type MouseEvent, useState } from 'react';
import { FACTORY_ABI, encodeCreateMarketMetadata } from '../lib/contracts';

interface CreateMarketPageProps {
  signer: Signer | null;
  factoryAddress: string;
  onCreated: () => void;
  isSepolia: boolean;
}

export default function CreateMarketPage({ signer, factoryAddress, onCreated, isSepolia }: CreateMarketPageProps) {
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [rules, setRules] = useState('');
  const [endTime, setEndTime] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function openDatePicker(event: FocusEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>) {
    event.currentTarget.showPicker?.();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signer) {
      setStatus('지갑을 먼저 연결하세요.');
      return;
    }

    if (!isSepolia) {
      setStatus('Sepolia 네트워크로 전환하세요.');
      return;
    }

    if (!factoryAddress) {
      setStatus('Factory address가 필요합니다.');
      return;
    }

    const parsedEndTime = Math.floor(new Date(endTime).getTime() / 1000);
    if (!title || !image || !parsedEndTime) {
      setStatus('title, image, endTime을 모두 입력하세요.');
      return;
    }

    setIsSubmitting(true);
    setStatus('Market 생성 중...');

    try {
      const metadataURI = encodeCreateMarketMetadata(title, image, rules);
      const factory = new Contract(factoryAddress, FACTORY_ABI, signer);
      const transaction = await factory.createMarket(metadataURI, parsedEndTime);
      const receipt = await transaction.wait();

      const createdMarket = receipt?.logs
        .map((log: { data: string; topics: readonly string[]; address: string }) => {
          try {
            return factory.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(Boolean);

      const marketAddress = createdMarket?.args?.market as string | undefined;
      setStatus(marketAddress ? `Created: ${marketAddress}` : 'Market created');
      setTitle('');
      setImage('');
      setRules('');
      setEndTime('');
      onCreated();
    } catch (createError) {
      setStatus(createError instanceof Error ? createError.message : 'Failed to create market');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="pm-panel rounded-[32px] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pm-kicker">Create</span>
          <span className={`pm-chip ${isSepolia ? 'pm-chip-yes' : 'pm-chip-no'}`}>{isSepolia ? 'Sepolia ready' : 'Network mismatch'}</span>
        </div>

        <div className="mt-5 max-w-2xl">
          <h1 className="pm-section-title font-semibold tracking-tight text-slate-950">Launch a new market without changing the contract flow.</h1>
          <p className="mt-3 text-base leading-7 text-slate-600">Only the visual system changes here. Title, image, rules, and end time still map directly to the same Factory transaction.</p>
        </div>

        {!isSepolia ? <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Sepolia 네트워크에서만 market을 생성할 수 있습니다.</div> : null}

        <form onSubmit={handleCreate} className="mt-6 space-y-5">
          <div>
            <label className="pm-label">Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="pm-input mt-2"
              placeholder="Will ETH hit $10k?"
            />
          </div>

          <div>
            <label className="pm-label">Image URL</label>
            <input
              value={image}
              onChange={(event) => setImage(event.target.value)}
              className="pm-input mt-2"
              placeholder="https://... or ipfs://..."
            />
          </div>

          <div>
            <label className="pm-label">Rules / Description</label>
            <textarea
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              rows={4}
              className="pm-textarea mt-2"
              placeholder="승리 조건과 규칙을 상세하게 적어주세요."
            />
          </div>

          <div>
            <label className="pm-label">End time</label>
            <input
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              onFocus={openDatePicker}
              onClick={openDatePicker}
              type="datetime-local"
              className="pm-input mt-2"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="pm-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Creating...' : 'Create Market'}
          </button>

          {status ? <p className="text-sm font-medium text-slate-600">{status}</p> : null}
        </form>
      </section>

      <aside className="space-y-4">
        <section className="pm-panel rounded-[28px] p-5">
          <p className="pm-kicker">Checklist</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="pm-statbox p-4">
              <p className="font-semibold text-slate-950">1. Title</p>
              <p className="mt-1">Keep it short and market-friendly.</p>
            </div>
            <div className="pm-statbox p-4">
              <p className="font-semibold text-slate-950">2. Image</p>
              <p className="mt-1">A strong thumbnail makes the market feel live.</p>
            </div>
            <div className="pm-statbox p-4">
              <p className="font-semibold text-slate-950">3. Rules</p>
              <p className="mt-1">Describe the resolution criteria clearly.</p>
            </div>
          </div>
        </section>

        <section className="pm-panel rounded-[28px] p-5">
          <p className="pm-kicker">Factory</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Connected address</p>
            <p className="mt-2 break-all text-sm font-medium text-slate-900">{factoryAddress || 'Not configured'}</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
