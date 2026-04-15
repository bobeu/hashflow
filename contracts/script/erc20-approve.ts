import { parseUnits, Hex, publicActions } from 'viem';
import { Address, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http } from 'viem';
import { config } from "dotenv";
import { hashkeyTestnet } from "viem/chains";

config()

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
}: ApproveParams) {
  const privateKey = process.env.P_KEY_0xD7c;
  if (!privateKey) {
    throw new Error('Private key not found in P_KEY_0xD7c environment variable');
  }

  const account = privateKeyToAccount(privateKey as Hex);

  const wClient = createWalletClient({
    transport: http(rpcUrl),
    account,
    chain: hashkeyTestnet
  }).extend(publicActions);

  const amountWei = parseUnits(amount as `${number}`, decimals);

  const hash = await wClient.writeContract({
    address: tokenAddress as Hex,
    abi: ERC20_ABI as any,
    functionName: 'approve',
    args: [spender as Address, amountWei],
    account
  });

  const result = await wClient.waitForTransactionReceipt({hash, confirmations: 2});
  return result;
}

export async function approveMockVaultForYield(
  mockVaultAddress: string,
  settlementTokenAddress: string,
  amount: string = '10'
) {
  return erc20Approve({
    tokenAddress: settlementTokenAddress,
    spender: mockVaultAddress,
    amount,
    decimals: 6
  });
}