import { parseUnits, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, parseEther } from 'viem';

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  }
] as const;

const HASHKEY_TESTNET_RPC = 'https://testnet.hsk.xyz';

interface ApproveParams {
  tokenAddress: string;
  spender: string;
  amount: string;
  decimals?: number;
  rpcUrl?: string;
}

export async function erc20Approve({
  tokenAddress,
  spender,
  amount,
  decimals = 6,
  rpcUrl = HASHKEY_TESTNET_RPC
}: ApproveParams): Promise<string> {
  const privateKey = process.env.P_KEY_0xD7c;
  if (!privateKey) {
    throw new Error('Private key not found in P_KEY_0xD7c environment variable');
  }

  const account = privateKeyToAccount(privateKey as Hex);

  const client = createPublicClient({
    transport: http(rpcUrl),
    chain: {
      id: 133,
      name: 'HashKey Testnet',
      nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    }
  });

  const amountWei = parseUnits(amount as `${number}`, decimals);

  const hash = await client.writeContract({
    address: tokenAddress as Hex,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender as Hex, amountWei],
    account
  });

  return hash;
}

export async function approveMockVaultForYield(
  mockVaultAddress: string,
  settlementTokenAddress: string,
  amount: string = '10000000'
): Promise<string> {
  return erc20Approve({
    tokenAddress: settlementTokenAddress,
    spender: mockVaultAddress,
    amount,
    decimals: 6
  });
}