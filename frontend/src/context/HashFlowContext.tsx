'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useConfig, useSignTypedData, useWatchContractEvent } from 'wagmi';
import { waitForTransactionReceipt } from "wagmi/actions";
import { CONTRACTS } from '@/contracts';
import { formatUnits, parseUnits, Hex, isAddress, type Address } from 'viem';
import { toast } from 'sonner';
import { JURISDICTIONS } from '@/components/dashboard/jurisdiction-selector';
import { TransactionStage } from '@/components/TransactionModal';
import { MilestoneFlow, MOCK_FLOWS } from '@/lib/utils';

interface HashFlowContextType {
  // Data
  milestones: MilestoneFlow[];
  stats: {
    tvl: string;
    yield: string;
    tax: string;
    balance: string;
    symbol: string;
  };
  isVerified: boolean;
  isLoading: boolean;
  showShredder: boolean;
  setShowShredder: (v: boolean) => void;
  selectedFlowForShredder: MilestoneFlow | null;
  setSelectedFlowForShredder: (flow: MilestoneFlow | null) => void;

  // Modal State (Global for easier orchestration)
  modal: {
    stage: TransactionStage;
    txHash: string;
    error: string;
    setStage: (s: TransactionStage) => void;
  };

  // Actions
  createEscrow: (params: { worker: string; amount: string; taxBP: number; taxRecipient: string }) => Promise<void>;
  releaseMilestone: (id: number) => Promise<void>;
  mockVerify: (worker: string) => Promise<void>;
  refresh: () => void;
  syncSimulatedYield: () => Promise<void>;
}

const HashFlowContext = createContext<HashFlowContextType | undefined>(undefined);

export function HashFlowProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const config = useConfig();
  const { signTypedDataAsync } = useSignTypedData();

  const [showShredder, setShowShredder] = useState(false);
  const [selectedFlowForShredder, setSelectedFlowForShredder] = useState<MilestoneFlow | null>(null);

  // Global UI States
  const [modalStage, setModalStage] = useState<TransactionStage>('idle');
  const [modalTxHash, setModalTxHash] = useState<string>('');
  const [modalError, setModalError] = useState<string>('');

  // 1. Fetch Milestone IDs
  const { data: milestoneIds, refetch: refetchIds } = useReadContract({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi as any,
    functionName: 'getMyMilestones',
    args: [address as `0x${string}`],
    query: { enabled: !!address }
  });

  // 2. Fetch Token Metadata & Balance
  const { data: meta, refetch: refetchMeta } = useReadContracts({
    contracts: [
      { address: CONTRACTS.MockERC20.address, abi: CONTRACTS.MockERC20.abi as any, functionName: 'symbol' },
      { address: CONTRACTS.MockERC20.address, abi: CONTRACTS.MockERC20.abi as any, functionName: 'decimals' },
      { address: CONTRACTS.MockERC20.address, abi: CONTRACTS.MockERC20.abi as any, functionName: 'balanceOf', args: [address as Address] },
      { address: CONTRACTS.HashFlowEscrow.address, abi: CONTRACTS.HashFlowEscrow.abi as any, functionName: 'getTotalTaxLiability', args: [address as Address] }
    ],
    query: { enabled: !!address }
  });

  // 3. Multicall for Milestone Details
  const { data: multicallData, isLoading: isLoadingFlows, refetch: refetchFlows } = useReadContracts({
    contracts: (milestoneIds as bigint[] || []).flatMap(id => [
      {
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi as any,
        functionName: 'milestones',
        args: [id]
      },
      {
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi as any,
        functionName: 'getPendingYield',
        args: [id]
      }
    ]),
    query: { enabled: !!milestoneIds && (milestoneIds as bigint[]).length > 0 }
  });

  // Derived Token Meta
  const { symbol, decimals, balance, officialTaxLiability } = useMemo(() => {
    const symbol = meta?.[0]?.result as string || 'USDC';
    const decimals = meta?.[1]?.result as number || 6;
    const balance = meta?.[2]?.result as bigint || 0n;
    const taxLiab = meta?.[3]?.result as bigint || 0n;
    return { symbol, decimals, balance: formatUnits(balance, decimals), officialTaxLiability: taxLiab };
  }, [meta]);

  // Derived Processed Flows
  const milestones = useMemo(() => {
    // if (!multicallData || !milestoneIds) return MOCK_FLOWS;
    if (!multicallData || !milestoneIds) return [];

    const flows: MilestoneFlow[] = [];
    for (let i = 0; i < (milestoneIds as bigint[]).length; i++) {
      const milestone = multicallData[i * 2]?.result as any;
      const interest = multicallData[i * 2 + 1]?.result as bigint;

      if (milestone) {
        flows.push({
          id: Number((milestoneIds as bigint[])[i]),
          client: milestone[1],
          worker: milestone[2],
          amount: milestone[0],
          taxBP: milestone[3],
          isReleased: milestone[4],
          yield: interest || 0n,
          taxRecipient: milestone[7]
        });
      }
    }
    return flows.reverse();
  }, [multicallData, milestoneIds]);

  // Derived Stats
  const stats = useMemo(() => {
    const active = milestones.filter(f => !f.isReleased);
    const tvlTotal = active.reduce((acc, curr) => acc + curr.amount, 0n);
    const yieldTotal = active.reduce((acc, curr) => acc + curr.yield, 0n);

    return {
      tvl: formatUnits(tvlTotal, decimals),
      yield: formatUnits(yieldTotal, decimals),
      tax: formatUnits(officialTaxLiability, decimals),
      balance,
      symbol
    };
  }, [milestones, officialTaxLiability, decimals, balance, symbol]);

  const refresh = useCallback(() => {
    refetchIds();
    refetchMeta();
    refetchFlows();
  }, [refetchIds, refetchMeta, refetchFlows]);

  // Sync Interval: Ticking the yield growth every 5 seconds
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      // Background sync - we don't await or toast here to avoid UI spam
      // but the contract call will trigger the growth minting
      syncSimulatedYield().catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [address]);

  // Watch for events to auto-refresh
  useWatchContractEvent({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi as any,
    eventName: 'EscrowCreated',
    onLogs: () => refresh()
  });

  useWatchContractEvent({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi as any,
    eventName: 'MilestoneReleased',
    onLogs: () => refresh()
  });

  // Write Hooks
  const { writeContractAsync: writeEscrow } = useWriteContract();
  const { writeContractAsync: writeEscrowAuth } = useWriteContract();
  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeRelease } = useWriteContract();
  const { writeContractAsync: writeVerify } = useWriteContract();
  const { writeContractAsync: writeSync } = useWriteContract();

  const syncSimulatedYield = async () => {
    try {
      const hash = await writeSync({
        address: CONTRACTS.MockVault.address,
        abi: CONTRACTS.MockVault.abi as any,
        functionName: 'syncSimulatedYield',
        args: []
      });
      await waitForTransactionReceipt(config, { hash });
      refresh();
    } catch (err) {
      console.warn("Sync failed (possibly user rejected or already synced):", err);
    }
  };

  const createEscrow = async ({ worker, amount, taxBP, taxRecipient }: { worker: string; amount: string; taxBP: number; taxRecipient: string }) => {
    try {
      setModalStage('awaiting_auth');
      setModalTxHash('');
      setModalError('');

      const amountValue = parseUnits(amount, decimals);
      let hash: Hex;

      // Try EIP-3009 first
      if (symbol.includes('USDC') || symbol === 'USDT') {
        try {
          const validAfter = 0n;
          const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
          const nonce = `0x${Date.now().toString(16).padStart(64, '0')}` as Hex;
          const resolvedChainId = chainId ?? 133;

          const isOfficial = CONTRACTS.MockERC20.address.toLowerCase() === '0x79aec4eea31d50792f61d1ca0733c18c89524c9e';
          const domain = {
            name: isOfficial ? 'USDC' : 'Mock USDC',
            version: isOfficial ? '2' : '1',
            chainId: resolvedChainId,
            verifyingContract: CONTRACTS.MockERC20.address as Hex
          };

          const signature = await signTypedDataAsync({
            domain,
            types: {
              TransferWithAuthorization: [
                { name: 'from', type: 'address' },
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'validAfter', type: 'uint256' },
                { name: 'validBefore', type: 'uint256' },
                { name: 'nonce', type: 'bytes32' }
              ]
            },
            primaryType: 'TransferWithAuthorization',
            message: { from: address as Hex, to: CONTRACTS.HashFlowEscrow.address as Hex, value: amountValue, validAfter, validBefore, nonce }
          });

          const r = `0x${signature.slice(2, 66)}` as Hex;
          const s = `0x${signature.slice(66, 130)}` as Hex;
          let v = parseInt(signature.slice(130, 132), 16);
          if (v < 27) v += 27;

          hash = await writeEscrowAuth({
            address: CONTRACTS.HashFlowEscrow.address,
            abi: CONTRACTS.HashFlowEscrow.abi as any,
            functionName: 'createEscrowWithAuth',
            args: [worker as Hex, amountValue, taxBP, taxRecipient as Hex, validAfter, validBefore, nonce, v, r, s]
          });
        } catch (e) {
          console.warn("EIP-3009 failed, falling back to approve", e);
          // Fallback to standard
          await writeApprove({
            address: CONTRACTS.MockERC20.address,
            abi: CONTRACTS.MockERC20.abi as any,
            functionName: 'approve',
            args: [CONTRACTS.HashFlowEscrow.address, amountValue]
          });

          hash = await writeEscrow({
            address: CONTRACTS.HashFlowEscrow.address,
            abi: CONTRACTS.HashFlowEscrow.abi as any,
            functionName: 'createEscrow',
            args: [worker as Hex, taxRecipient as Hex, amountValue, taxBP]
          });
        }
      } else {
        await writeApprove({
          address: CONTRACTS.MockERC20.address,
          abi: CONTRACTS.MockERC20.abi as any,
          functionName: 'approve',
          args: [CONTRACTS.HashFlowEscrow.address, amountValue]
        });
        hash = await writeEscrow({
          address: CONTRACTS.HashFlowEscrow.address,
          abi: CONTRACTS.HashFlowEscrow.abi as any,
          functionName: 'createEscrow',
          args: [worker as Hex, taxRecipient as Hex, amountValue, taxBP]
        });
      }

      setModalTxHash(hash);
      setModalStage('payment_included');
      await waitForTransactionReceipt(config, { hash });
      setModalStage('verifying');
      setTimeout(() => {
        setModalStage('success');
        refresh();
        setTimeout(() => setModalStage('idle'), 3000);
      }, 1500);

    } catch (err: any) {
      setModalStage('error');
      setModalError(err.shortMessage || err.message);
      setTimeout(() => setModalStage('idle'), 3000);
    }
  };

  const releaseMilestone = async (id: number) => {
    try {
      setModalStage('awaiting_auth');
      
      // 1. Capture max yield right before release
      await syncSimulatedYield();

      const hash = await writeRelease({
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi as any,
        functionName: 'releaseMilestone',
        args: [BigInt(id)]
      });
      setModalTxHash(hash);
      setModalStage('payment_included');
      await waitForTransactionReceipt(config, { hash });
      setModalStage('verifying');
      setTimeout(() => {
        setModalStage('success');
        refresh();
        setShowShredder(true);
        setTimeout(() => setModalStage('idle'), 3000);
      }, 1500);
    } catch (err: any) {
      setModalStage('error');
      setModalError(err.shortMessage || err.message);
      setTimeout(() => setModalStage('idle'), 3000);
    }
  };

  const mockVerify = async (worker: string) => {
    try {
      const hash = await writeVerify({
        address: CONTRACTS.MockZKVerifier.address,
        abi: CONTRACTS.MockZKVerifier.abi as any,
        functionName: 'setVerificationStatus',
        args: [worker as Hex, true]
      });
      await waitForTransactionReceipt(config, { hash });
      refresh();
      toast.success("Worker identity verified on-chain");
    } catch (err: any) {
      toast.error(err.shortMessage || err.message);
    }
  };

  return (
    <HashFlowContext.Provider value={{
      milestones,
      stats,
      isVerified: false, // Placeholder, usually checked per worker address in component
      isLoading: isLoadingFlows,
      modal: {
        stage: modalStage,
        txHash: modalTxHash,
        error: modalError,
        setStage: setModalStage
      },
      createEscrow,
      releaseMilestone,
      mockVerify,
      refresh,
      syncSimulatedYield,
      showShredder,
      setShowShredder,
      selectedFlowForShredder,
      setSelectedFlowForShredder
    }}>
      {children}
    </HashFlowContext.Provider>
  );
}

export function useHashFlow() {
  const context = useContext(HashFlowContext);
  if (!context) throw new Error('useHashFlow must be used within HashFlowProvider');
  return context;
}
