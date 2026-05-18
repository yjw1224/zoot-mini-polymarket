export type BackendOrderLevel = {
  price: string;
  amount: string;
  orderCount: number;
};

export type BackendSideBook = {
  targetId: 0 | 1;
  bids: BackendOrderLevel[];
  asks: BackendOrderLevel[];
};

export type BackendOrderbookSnapshot = {
  marketAddress: string;
  yes: BackendSideBook;
  no: BackendSideBook;
  updatedAt: string;
};

export type BackendTrade = {
  id: string;
  marketAddress: string;
  orderHash: string;
  maker: string;
  taker: string;
  targetId: number;
  isBuy: boolean;
  price: string;
  amount: string;
  usdcAmount: string;
  txHash: string;
  blockNumber: number;
  createdAt: string;
};

export type BackendTradesResponse = {
  address: string;
  trades: BackendTrade[];
};

export type BackendMatchPreview = {
  marketAddress: string;
  targetId: 0 | 1;
  matches: Array<{
    amount: string;
    executionPrice: string;
    buyOrderHash: string;
    sellOrderHash: string;
    buyMaker: string;
    sellMaker: string;
    buyPrice: string;
    sellPrice: string;
    buyCreatedAt: string;
    sellCreatedAt: string;
  }>;
  totalMatchedAmount: string;
  bestBid: string | null;
  bestAsk: string | null;
  updatedAt: string;
};

export type BackendMatchesResponse = {
  marketAddress: string;
  yes: BackendMatchPreview;
  no: BackendMatchPreview;
};

export const backendBaseUrl = import.meta.env.VITE_BACKEND_URL ?? 'https://silver-enigma-pqvv995g455f6j6-4000.app.github.dev';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(fallback || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchOrderbookSnapshot(marketAddress: string) {
  return requestJson<BackendOrderbookSnapshot>(`/markets/${marketAddress}/orderbook`);
}

export async function fetchMarketTrades(marketAddress: string, limit = 20) {
  return requestJson<BackendTradesResponse>(`/markets/${marketAddress}/trades?limit=${limit}`);
}

export async function fetchMarketMatches(marketAddress: string) {
  return requestJson<BackendMatchesResponse>(`/markets/${marketAddress}/matches`);
}

export type BackendCreateOrderInput = {
  maker: string;
  targetId: 0 | 1;
  isBuy: boolean;
  price: string;
  amount: string;
  expiry: string;
  nonce: string;
  signature: string;
};

export async function submitMarketOrder(marketAddress: string, input: BackendCreateOrderInput) {
  return requestJson<{ order: unknown }>(`/markets/${marketAddress}/orders`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
