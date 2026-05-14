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
      const metadataURI = encodeCreateMarketMetadata(title, image);
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
      setEndTime('');
      onCreated();
    } catch (createError) {
      setStatus(createError instanceof Error ? createError.message : 'Failed to create market');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-sky-300">Create</p>
        <h1 className="text-3xl font-semibold text-white">New market</h1>
        <p className="text-sm text-slate-300">title, image, endTime만 받아서 Factory에 연결합니다.</p>
      </div>

      {!isSepolia ? <p className="text-sm text-amber-300">Sepolia 네트워크에서만 market을 생성할 수 있습니다.</p> : null}

      <form onSubmit={handleCreate} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div>
          <label className="block text-sm text-slate-300">Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="Will ETH hit $10k?"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-300">Image URL</label>
          <input
            value={image}
            onChange={(event) => setImage(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="https://... or ipfs://..."
          />
        </div>

        <div>
          <label className="block text-sm text-slate-300">End time</label>
          <input
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            onFocus={openDatePicker}
            onClick={openDatePicker}
            type="datetime-local"
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating...' : 'Create Market'}
        </button>

        {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      </form>
    </div>
  );
}
