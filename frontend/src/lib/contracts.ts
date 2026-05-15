import { BrowserProvider, Contract, type Signer, parseUnits } from 'ethers';
import { readMetadataUri, type MarketMetadata } from './metadata';

export const FACTORY_ABI = [
  'function fakeUSDCToken() view returns (address)',
  'function allMarketsLength() view returns (uint256)',
  'function getMarket(uint256 index) view returns (address)',
  'function createMarket(string metadataURI, uint256 endTime) returns (address market)',
  'event MarketCreated(address indexed market, address indexed admin, string metadataURI, uint256 endTime)',
] as const;

export const MARKET_ABI = [
  'function admin() view returns (address)',
  'function metadataURI() view returns (string)',
  'function endTime() view returns (uint256)',
  'function isResolved() view returns (bool)',
  'function winningSide() view returns (uint256)',
  'function yesPrice() view returns (uint256)',
  'function PRICE_PER_SET() view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function bet(uint256 targetId, uint256 usdcAmount)',
  'function setResult(uint256 winner)',
  'function claim()',
  'function sellToken(uint256 id, uint256 amount)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TokensBet(address indexed user, uint256 indexed targetId, uint256 usdcAmount, uint256 sharesReceived, uint256 priceAtBet)',
  'event TokensSold(address indexed user, uint256 indexed targetId, uint256 sharesSold, uint256 usdcReceived, uint256 priceAtSell)',
  'event TokensClaimed(address indexed user, uint256 usdcReceived)',
  'event MarketResolved(uint256 winningSide)'
] as const;

export const USDC_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function faucet()',
] as const;

export interface MarketSummary {
  address: string;
  admin: string;
  metadataURI: string;
  endTime: bigint;
  isResolved: boolean;
  winningSide: bigint;
  metadata: MarketMetadata;
}

export async function loadFactoryMarkets(provider: BrowserProvider, factoryAddress: string): Promise<{ fakeUsdcAddress: string; markets: MarketSummary[] }> {
  const deployedCode = await provider.getCode(factoryAddress);
  if (deployedCode === '0x') {
    throw new Error('Factory address에 컨트랙트가 없습니다. 현재 연결된 네트워크와 배포한 MarketFactory 주소를 확인하세요.');
  }

  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  const fakeUsdcAddress = (await factory.fakeUSDCToken()) as string;
  const totalMarkets = Number(await factory.allMarketsLength());
  const marketAddresses = await Promise.all(
    Array.from({ length: totalMarkets }, async (_, index) => (await factory.getMarket(index)) as string),
  );

  const markets = await Promise.all(
    marketAddresses.map(async (address) => {
      const market = new Contract(address, MARKET_ABI, provider);
      const metadataURI = (await market.metadataURI()) as string;
      const metadata = await readMetadataUri(metadataURI);

      return {
        address,
        admin: (await market.admin()) as string,
        metadataURI,
        endTime: (await market.endTime()) as bigint,
        isResolved: (await market.isResolved()) as boolean,
        winningSide: (await market.winningSide()) as bigint,
        metadata,
      } satisfies MarketSummary;
    }),
  );

  return { fakeUsdcAddress, markets };
}

export function getMarketContract(address: string, signerOrProvider: BrowserProvider | Signer) {
  return new Contract(address, MARKET_ABI, signerOrProvider);
}

export function getUsdcContract(address: string, signerOrProvider: BrowserProvider | Signer) {
  return new Contract(address, USDC_ABI, signerOrProvider);
}

export function encodeCreateMarketMetadata(title: string, image: string, rules: string): string {
  return `data:application/json;base64,${btoa(
    unescape(
      encodeURIComponent(
        JSON.stringify({
          name: title,
          image,
          rules,
        }),
      ),
    ),
  )}`;
}

export function toWeiAmount(value: string): bigint {
  return parseUnits(value || '0', 18);
}
