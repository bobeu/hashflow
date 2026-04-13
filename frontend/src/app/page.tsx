'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { 
  BarChart3, 
  Coins, 
  ShieldCheck, 
  ShieldAlert, 
  ArrowUpRight, 
  Zap, 
  Building2, 
  History,
  Info,
  Globe
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { ShredderViz } from '@/components/dashboard/shredder-viz';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { JurisdictionSelector, JURISDICTIONS } from '@/components/dashboard/jurisdiction-selector';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useConfig, useSignTypedData } from 'wagmi';
import { waitForTransactionReceipt } from "wagmi/actions";
import { CONTRACTS } from '@/contracts';
import { formatUnits, Hex, parseUnits, formatEther } from 'viem';

interface MilestoneFlow {
  id: number;
  client: string;
  worker: string;
  amount: bigint;
  taxBP: number;
  isReleased: boolean;
  yield: bigint;
  taxRecipient: string;
}

// Mock data for initial "Full" UI demo
const MOCK_FLOWS : MilestoneFlow[] = [
  { id: 1, client: "0x7aB...1192", worker: "0xf39...2266", amount: BigInt(12500e6), taxRecipient: "0xc39...2bf3", yield: BigInt(1244e5), isReleased: false, taxBP: 300},
  { id: 2, client: "0x92A...1191", worker: "0x709...af8b", amount: BigInt(55000e6), taxRecipient: "0xb30...2266", yield: BigInt(9450e5), isReleased:true, taxBP: 700 },
  { id: 3, client: "0x11B...9901", worker: "0xf39...2266", amount: BigInt(8200e6), taxRecipient: "0xdd9...3309", yield: BigInt(821e5), isReleased: false, taxBP: 1000 },
  { id: 4, client: "0xFE2...0041", worker: "0x3C4...9981", amount: BigInt(4500e6), taxRecipient: "0xff9...2232", yield: BigInt(120e5), isReleased: true, taxBP: 900 },
  { id: 5, client: "0x88C...3371", worker: "0xf39...2266", amount: BigInt(1200e6), taxRecipient: "0x119...2122", yield: BigInt(35e5), isReleased: false, taxBP: 600 },
  { id: 6, client: "0xBB9...a411", worker: "0x709...af8b", amount: BigInt(250e6), taxRecipient: "0xd39...9097", yield: BigInt(12e5), isReleased: true, taxBP: 450 },
];

export default function DashboardPage() {
  const { address, isConnected, chainId } = useAccount();
  const config = useConfig();
  const [isVerified, setIsVerified] = useState(false);
  const [showShredder, setShowShredder] = useState(false);
  const [yieldTicker, setYieldTicker] = useState(12450.88);
  
  // Form State
  const [newWorker, setNewWorker] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newTax, setNewTax] = useState('300'); // Default 3%
  const [selectedJurisId, setSelectedJurisId] = useState('hk');
  const [customTaxAddr, setCustomTaxAddr] = useState('');

  const isLive = chainId !== undefined && chainId === 177;

  // Pending Simulations State
  const [pendingSimulations, setPendingSimulations] = useState<any[]>([]);

  // Fetch my milestone IDs
  const { data: milestoneIds, refetch: refetchIds } = useReadContract({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi as any,
    functionName: 'getMyMilestones',
    args: [address as `0x${string}`],
    query: { enabled: !!address }
  });

  // Fetch symbol and decimals
  const { data: meta } = useReadContracts({
    contracts: ['symbol', 'decimals', 'balanceOf'].map((fn, i) => ({
      address: CONTRACTS.MockERC20.address,
      abi: CONTRACTS.MockERC20.abi as any,
      functionName: fn,
      args: i === 2? [address] : []
    })),
    query: { enabled: isLive }
  });

  // Batch fetch details for those IDs
  const { data: multicallData, isLoading: isLoadingFlows } = useReadContracts({
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

  const { symbol, decimals, balance } = React.useMemo(() => {
    console.log("meta", meta);
    const symbol = meta?.[0]?.result as string || 'USDT';
    const decimals = meta?.[1]?.result as number || 6;
    const balance = meta?.[2]?.result as bigint || 0n;
    console.log("balance", balance)
    return { symbol, decimals, balance: `${formatEther(balance)} ${symbol}` };
  }, [meta]);

  // 3. Process Multicall Data
  const processedFlows = React.useMemo(() => {
    if (!multicallData || !milestoneIds) return MOCK_FLOWS;
    
    const flows: MilestoneFlow[] = [];
    for (let i = 0; i < (milestoneIds as bigint[]).length; i++) {
      console.log("multicallData", multicallData);
      const milestone = multicallData[i * 2]?.result as any;
      console.log("milestone", milestone);
      const interest = multicallData[i * 2 + 1]?.result as bigint;
      console.log("interest", interest);
      
      if (milestone) {
        flows.push({
          id: Number((milestoneIds as bigint[])[i]),
          client: milestone[1],
          worker: milestone[2],
          amount: milestone[0],
          taxBP: milestone[3],
          isReleased: milestone[4],
          yield: interest || BigInt(0),
          taxRecipient: milestone[7]
        });
      }
    }
    return flows.reverse(); // Newest first
  }, [multicallData, milestoneIds]);

  // 4. Aggregates
  const stats = React.useMemo(() => {
    const active = processedFlows.filter((f: MilestoneFlow) => !f.isReleased);
    const tvl = active.reduce((acc, curr) => acc + curr.amount, BigInt(0));
    const yieldAcc = active.reduce((acc, curr) => acc + curr.yield, BigInt(0));
    const taxLiab = active.reduce((acc, curr) => acc + (curr.amount * BigInt(curr.taxBP) / BigInt(10000)), BigInt(0));
    
    return {
      tvl: formatUnits(tvl, 6),
      yield: formatUnits(yieldAcc, 6),
      tax: formatUnits(taxLiab, 6)
    };
  }, [processedFlows]);

  const { writeContractAsync: releaseMilestone } = useWriteContract();
  const { writeContractAsync: createEscrow } = useWriteContract();
  const { writeContractAsync: approve } = useWriteContract();
  const { writeContractAsync: createEscrowWithAuth } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  
  // Update live yield ticker base
  useEffect(() => {
    if (stats.yield !== "0") {
      setYieldTicker(parseFloat(stats.yield));
    }
  }, [stats.yield]);

  // Live yield ticker animation effect
  useEffect(() => {
    const timer = setInterval(() => {
      setYieldTicker(prev => prev + 0.000001);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const handleCreateEscrow = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newWorker || !newAmount) return;
    
    try {
      const taxRecipient = selectedJurisId === 'custom' 
          ? customTaxAddr 
          : JURISDICTIONS.find(j => j.id === selectedJurisId)?.address;

      if (!taxRecipient || taxRecipient === '0x0000000000000000000000000000000000000000') {
          toast.error("Invalid Authority", { description: "You must select a valid tax jurisdiction." });
          return;
      }
      
      const { generateHashKeyAuthHeaders } = await import('@/lib/signature');
      const headers = await generateHashKeyAuthHeaders({ amount: newAmount, worker: newWorker });
      console.log("Generated HSP Headers (Replay Protection):", headers);

      let hash : Hex = '0x';

      if (symbol === 'USDC' || symbol === 'Mock USDC' || symbol === 'USDT') {
          try {
             toast.info("One-Click Settlement", { description: "Please sign the authorization request in your wallet." });
             const validAfter = BigInt(0);
             const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
             const nonce = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
                 .map(b => b.toString(16).padStart(2, '0')).join('') as \`0x\${string}\`;
             const amountValue = parseUnits(newAmount, decimals);

             const signature = await signTypedDataAsync({
                 domain: {
                     name: 'Mock USDC',
                     version: '1',
                     chainId: BigInt(chainId || 133),
                     verifyingContract: CONTRACTS.MockERC20.address as \`0x\${string}\`
                 },
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
                 message: {
                     from: address as \`0x\${string}\`,
                     to: CONTRACTS.HashFlowEscrow.address as \`0x\${string}\`,
                     value: amountValue,
                     validAfter: validAfter,
                     validBefore: validBefore,
                     nonce: nonce
                 }
             });

             const r = \`0x\${signature.substring(2, 66)}\` as \`0x\${string}\`;
             const s = \`0x\${signature.substring(66, 130)}\` as \`0x\${string}\`;
             const v = parseInt(signature.substring(130, 132), 16);

             hash = await createEscrowWithAuth({
                 address: CONTRACTS.HashFlowEscrow.address,
                 abi: CONTRACTS.HashFlowEscrow.abi as any,
                 functionName: 'createEscrowWithAuth',
                 args: [
                     newWorker as \`0x\${string}\`, 
                     amountValue, 
                     Number(newTax), 
                     taxRecipient as \`0x\${string}\`,
                     validAfter,
                     validBefore,
                     nonce,
                     v,
                     r,
                     s
                 ]
             });
             
             const createResult = await waitForTransactionReceipt(config, { hash });
             toast.success("Gasless Escrow Initiated", { description: \`TX: \${createResult.transactionHash.slice(0, 10)}...\` });
             setNewWorker('');
             setNewAmount('');
             refetchIds();
             return;
          } catch(err: any) {
              console.warn("EIP-3009 Failed or Rejected, falling back to standard approve", err);
              toast.info("Falling back to standard approval flow");
          }
      }

      hash = await approve({
        address: CONTRACTS.MockERC20.address,
        abi: CONTRACTS.MockERC20.abi as any,
        functionName: 'approve',
        args: [CONTRACTS.HashFlowEscrow.address, parseUnits(newAmount, decimals)]
      });
      const approvalResult = await waitForTransactionReceipt(config, { hash });
      if (approvalResult.status !== 'success') {
        toast.error("Approval Failed", { description: "Token approval transaction failed." });
        return;
      }

      hash = await createEscrow({
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi as any,
        functionName: 'createEscrow',
        args: [newWorker as `0x${string}`, taxRecipient as `0x${string}`, parseUnits(newAmount, 6), Number(newTax)]
      });

      const createResult = await waitForTransactionReceipt(config, { hash });
      toast.success("Escrow Initiated", { description: `TX: ${createResult.transactionHash.slice(0, 10)}...` });
      setNewWorker('');
      setNewAmount('');
      refetchIds();
    } catch (err: any) {
      toast.error("Creation Failed", { description: err.message });
    }
  };

  const handleRelease = async (id: number) => {
    try {
      await releaseMilestone({
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi as any,
        functionName: 'releaseMilestone',
        args: [BigInt(id)]
      });
      setShowShredder(true);
      toast.success("Milestone Released", { description: "Funds shredded and routed." });
      refetchIds();
    } catch (err: any) {
        toast.error("Release Failed", { description: err.message });
    }
  };

  const handleSimulatePayment = () => {
    const simId = Date.now();
    setPendingSimulations(prev => [{ id: simId, status: 'included' }, ...prev]);
    toast.info("Transaction Included", { description: "Waiting for block confirmation..." });
    
    setTimeout(() => {
        setPendingSimulations(prev => prev.map(p => p.id === simId ? { ...p, status: 'successful' } : p));
        toast.success("HSP Payment Settled!", { description: "Auto-escrow successfully created." });
        setShowShredder(true); // Trigger visuals when successful
        refetchIds();
        setTimeout(() => {
            setPendingSimulations(prev => prev.filter(p => p.id !== simId));
        }, 3000);
    }, 3000);
  };

  const handleMockVerify = () => {
    setIsVerified(true);
    toast.info("ZK-Identity Verified", {
      description: "Wallet cleared for HashKey compliance gate.",
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 glass-panel border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="HashFlow" width={24} height={24} className="object-contain" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-primary uppercase">HashFlow</h1>
            <p className="text-[10px] text-slate-500 font-mono -mt-1 uppercase tracking-widest">Settlement Protocol</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-500">
                <span className={cn("w-2 h-2 rounded-full", isLive ? "bg-accent animate-pulse" : "bg-slate-300")} />
                {isLive ? "HASHKEY MAINNET" : "SIMULATION MODE"}
            </div>
          <ConnectButton showBalance={true} chainStatus="none" accountStatus="avatar" />
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Section: Stats & Flows */}
        <div className="lg:col-span-3 flex flex-col gap-8">
          
          {/* Hero Stats */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              title="Merchant TVL" 
              value={`$${stats.tvl}`} 
              icon={Building2} 
              description="Current locked capital"
            />
            <StatCard 
              title="Portfolio Interest" 
              value={yieldTicker.toFixed(6)} 
              icon={Coins} 
              description="Live aggregate growth"
              isTicker={true}
              className="border-accent/20 bg-accent/[0.02]"
            />
            <StatCard 
              title="Tax Forecast" 
              value={`$${stats.tax}`} 
              icon={BarChart3} 
              description="Ready for regional remit"
            />
          </section>

          {/* Active Flows Table */}
          <section className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                <h2 className="text-lg font-semibold text-primary">Active Settlement Flows</h2>
              </div>
              <button 
                onClick={handleSimulatePayment}
                className="text-xs bg-primary text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors flex items-center gap-2"
              >
                <Zap className="w-3 h-3" /> Simulate HSP Payment
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left zebra-table min-w-[600px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Worker (ZK)</th>
                  <th className="px-6 py-3">Escrow Principal</th>
                  <th className="px-6 py-3">Tax Destination</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {pendingSimulations.map(sim => (
                  <tr key={sim.id} className="group bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-amber-500 animate-pulse">PENDING...</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">---</td>
                      <td className="px-6 py-4 text-slate-400">---</td>
                      <td className="px-6 py-4 text-slate-400">---</td>
                      <td className="px-6 py-4 text-right">
                          <span className={cn(
                              "px-2 py-1 rounded text-[10px] font-bold tracking-wider",
                              sim.status === 'included' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                              {sim.status === 'included' ? 'PAYMENT INCLUDED' : 'SUCCESSFUL'}
                          </span>
                      </td>
                  </tr>
                ))}
                {processedFlows.length === 0 && !isLoadingFlows && pendingSimulations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-mono text-xs">
                      NO ACTIVE FLOWS FOUND FOR THIS MERCHANT
                    </td>
                  </tr>
                )}
                {processedFlows.map((flow: MilestoneFlow) => (
                  <tr key={flow.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">#{flow.id}</td>
                    <td className="px-6 py-4 font-mono text-xs text-primary font-medium">{flow.worker.slice(0,6)}...{flow.worker.slice(-4)}</td>
                    <td className="px-6 py-4 font-bold">{formatUnits(flow.amount, 6)} HSP</td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded w-fit">
                            <Globe className="w-3 h-3 text-primary/50" />
                            {flow.taxRecipient?.slice(0,6)}...{flow.taxRecipient?.slice(-4)}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleRelease(flow.id)}
                        className={cn(
                        "px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ml-auto",
                        !flow.isReleased 
                          ? "bg-primary text-white shadow-sm hover:shadow-md" 
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      )}>
                        {!flow.isReleased ? (
                          <>Release <ArrowUpRight className="w-3 h-3" /></>
                        ) : (
                          "Settled"
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Section: Compliance & Actions */}
        <div className="lg:col-span-1 flex flex-col gap-8">
          
          {/* Create Escrow Form */}
          <section className="p-6 rounded-md border border-slate-200 bg-white shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Institutional Settlement</h3>
            <form onSubmit={handleCreateEscrow} className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Worker Address</label>
                    <input 
                        type="text" 
                        placeholder="0x..." 
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
                        value={newWorker}
                        onChange={(e) => setNewWorker(e.target.value)}
                    />
                </div>
                
                <JurisdictionSelector 
                    selectedId={selectedJurisId}
                    customAddress={customTaxAddr}
                    onSelect={setSelectedJurisId}
                    onCustomAddressChange={setCustomTaxAddr}
                />

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{`Amount ${symbol || 'USDT'}`}</label>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{`Bal: ${balance}`}</label>
                  </div>
                  <input 
                      type="number" 
                      placeholder="100.00" 
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <button 
                    type="submit"
                    className="w-full bg-primary text-white py-2 rounded-md text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                    <Zap className="w-3 h-3" /> Initiate Escrow
                </button>
            </form>
          </section>

          {/* Compliance Badge */}
          <section className="p-6 rounded-md border border-slate-200 bg-white shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Compliance Status</h3>
            <div className={cn(
                "flex flex-col items-center gap-4 p-6 rounded-lg border-2 border-dashed transition-colors",
                isVerified ? "border-accent/30 bg-accent/[0.02]" : "border-warning/30 bg-warning/[0.02]"
            )}>
              {isVerified ? (
                <ShieldCheck className="w-16 h-16 text-accent" />
              ) : (
                <ShieldAlert className="w-16 h-16 text-warning" />
              )}
              <div className="text-center">
                <p className="font-bold text-primary">{isVerified ? "IDENTIFIED" : "VERIFICATION REQUIRED"}</p>
                <p className="text-xs text-slate-400 mt-1">HashKey ZK-ID Compliance Gate</p>
              </div>
              
              {!isVerified && (
                <button 
                  onClick={handleMockVerify}
                  className="mt-2 w-full bg-warning/10 text-warning border border-warning/20 px-4 py-2 rounded-md text-xs font-bold hover:bg-warning/20 transition-all uppercase tracking-tighter"
                >
                  Mock Verify Now
                </button>
              )}
            </div>
          </section>

          {/* Quick Info */}
          <section className="glass-panel p-6 rounded-md">
            <div className="flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-primary">Protocol Insight</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              HashFlow automatically routes <strong>20% of accrued taxes</strong> to the global yield pool and <strong>80% to jurisdictional vaults</strong> upon settlement. This ensures zero-friction compliance for institutional PayFi.
            </p>
          </section>

        </div>
      </main>
      
      {/* Visualizations Overlay */}
      <ShredderViz isVisible={showShredder} onComplete={() => setShowShredder(false)} />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-400 font-medium">© 2026 HashFlow Protocol. Powering the HashKey PayFi Economy.</p>
        <div className="flex items-center gap-6">
            <span className="text-[10px] font-mono text-slate-300">BUILD: v0.3.2-BETA</span>
            <div className="flex gap-4">
                <div className="w-2 h-2 rounded-full bg-accent" title="RPC Online" />
                <div className="w-2 h-2 rounded-full bg-accent" title="Zebra Service Active" />
                <div className="w-2 h-2 rounded-full bg-slate-200" title="Governance Paused" />
            </div>
        </div>
      </footer>
    </div>
  );
}
