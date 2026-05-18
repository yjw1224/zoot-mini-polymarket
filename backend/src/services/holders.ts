import { parseAbiItem, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from '../env.js';
import { publicClient } from './chain.js';

const transferSingleEvent = parseAbiItem('event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)');

export type HolderRankingEntry = {
    address: string;
    balance: string;
};

export type HolderRankingsResponse = {
    marketAddress: string;
    yes: HolderRankingEntry[];
    no: HolderRankingEntry[];
    excludedAddresses: string[];
    updatedAt: string;
};

function normalizeAddress(address: string) {
    return address.toLowerCase();
}

function compareRank(left: { address: string; balance: bigint }, right: { address: string; balance: bigint }) {
    if (left.balance === right.balance) return left.address.localeCompare(right.address);
    return left.balance > right.balance ? -1 : 1;
}

function getExcludedAddresses() {
    const excluded = new Set<string>();

    if (env.SYSTEM_MAKER_ADDRESS) {
        excluded.add(normalizeAddress(env.SYSTEM_MAKER_ADDRESS));
    }

    if (env.MATCHER_PRIVATE_KEY) {
        excluded.add(normalizeAddress(privateKeyToAccount(env.MATCHER_PRIVATE_KEY as `0x${string}`).address));
    }

    excluded.add('0x0000000000000000000000000000000000000000');
    return excluded;
}

export async function getHolderRankings(marketAddress: string): Promise<HolderRankingsResponse> {
    const excludedAddresses = getExcludedAddresses();
    const logs = await publicClient.getLogs({
        address: marketAddress as Address,
        event: transferSingleEvent,
        fromBlock: BigInt(env.INDEX_START_BLOCK),
        toBlock: 'latest',
    });

    const balances = new Map<string, { yes: bigint; no: bigint }>();

    for (const log of logs) {
        const from = normalizeAddress(String(log.args.from));
        const to = normalizeAddress(String(log.args.to));
        const id = BigInt(log.args.id as bigint | number | string);
        const value = BigInt(log.args.value as bigint | number | string);

        if (id !== 0n && id !== 1n) continue;

        if (!excludedAddresses.has(from)) {
            const current = balances.get(from) ?? { yes: 0n, no: 0n };
            if (id === 0n) current.yes -= value;
            if (id === 1n) current.no -= value;
            balances.set(from, current);
        }

        if (!excludedAddresses.has(to)) {
            const current = balances.get(to) ?? { yes: 0n, no: 0n };
            if (id === 0n) current.yes += value;
            if (id === 1n) current.no += value;
            balances.set(to, current);
        }
    }

    const yes = Array.from(balances.entries())
        .map(([address, balance]) => ({ address, balance: balance.yes }))
        .filter((entry) => entry.balance > 0n)
        .sort(compareRank)
        .slice(0, 10)
        .map((entry) => ({ address: entry.address, balance: entry.balance.toString() }));

    const no = Array.from(balances.entries())
        .map(([address, balance]) => ({ address, balance: balance.no }))
        .filter((entry) => entry.balance > 0n)
        .sort(compareRank)
        .slice(0, 10)
        .map((entry) => ({ address: entry.address, balance: entry.balance.toString() }));

    return {
        marketAddress,
        yes,
        no,
        excludedAddresses: [...excludedAddresses],
        updatedAt: new Date().toISOString(),
    };
}