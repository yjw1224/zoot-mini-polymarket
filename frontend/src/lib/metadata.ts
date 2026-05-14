export interface MarketMetadata {
  name: string;
  image: string;
  description?: string;
}

export function encodeMetadataUri(metadata: MarketMetadata): string {
  const json = JSON.stringify(metadata);
  return `data:application/json;base64,${bytesToBase64(new TextEncoder().encode(json))}`;
}

export async function readMetadataUri(uri: string): Promise<MarketMetadata> {
  const text = await readMetadataText(uri);
  const parsed = JSON.parse(text) as Partial<MarketMetadata>;

  return {
    name: parsed.name ?? 'Untitled market',
    image: parsed.image ?? '',
    description: parsed.description ?? '',
  };
}

async function readMetadataText(uri: string): Promise<string> {
  if (uri.startsWith('data:application/json;base64,')) {
    const base64 = uri.slice('data:application/json;base64,'.length);
    return base64ToText(base64);
  }

  const resolvedUri = uri.startsWith('ipfs://')
    ? `https://gateway.pinata.cloud/ipfs/${uri.slice('ipfs://'.length)}`
    : uri;

  const response = await fetch(resolvedUri);
  if (!response.ok) {
    throw new Error(`Failed to load metadata: ${response.status}`);
  }

  return response.text();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToText(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
