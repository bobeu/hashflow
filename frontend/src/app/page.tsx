'use client';

import React, { useState, useEffect } from 'react';
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
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWatchContractEvent } from 'wagmi';
import { CONTRACTS } from '@/contracts';
import { formatUnits, parseUnits } from 'viem';

// Mock data for initial "Full" UI demo
const MOCK_FLOWS = [
  { id: 1, client: "0x7aB...1192", worker: "0xf39...2266", amount: "12,500 HSP", status: "Locked", yield: "124.4 HSP" },
  { id: 2, client: "0x92A...1191", worker: "0x709...af8b", amount: "55,000 HSP", status: "Released", yield: "945.0 HSP" },
  { id: 3, client: "0x11B...9901", worker: "0xf39...2266", amount: "8,200 HSP", status: "Locked", yield: "82.1 HSP" },
  { id: 4, client: "0xFE2...0041", worker: "0x3C4...9981", amount: "4,500 HSP", status: "Released", yield: "12.0 HSP" },
  { id: 5, client: "0x88C...3371", worker: "0xf39...2266", amount: "1,200 HSP", status: "Locked", yield: "3.5 HSP" },
  { id: 6, client: "0xBB9...a411", worker: "0x709...af8b", amount: "250 HSP", status: "Released", yield: "1.2 HSP" },
];

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [isVerified, setIsVerified] = useState(false);
  const [showShredder, setShowShredder] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [yieldTicker, setYieldTicker] = useState(12450.88);
  
  // Form State
  const [newWorker, setNewWorker] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newTax, setNewTax] = useState('1000'); // Default 10%
  const [selectedJurisId, setSelectedJurisId] = useState('hk');
  const [customTaxAddr, setCustomTaxAddr] = useState('');

  // 1. Fetch my milestone IDs
  const { data: milestoneIds, refetch: refetchIds } = useReadContract({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi,
    functionName: 'getMyMilestones',
    args: [address as `0x${string}`],
    query: { enabled: !!address }
  });

  // 2. Batch fetch details for those IDs
  const { data: multicallData, isLoading: isLoadingFlows } = useReadContracts({
    contracts: (milestoneIds as bigint[] || []).flatMap(id => [
      {
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi,
        functionName: 'milestones',
        args: [id]
      },
      {
        address: CONTRACTS.HashFlowEscrow.address,
        abi: CONTRACTS.HashFlowEscrow.abi,
        functionName: 'getPendingYield',
        args: [id]
      }
    ]),
    query: { enabled: !!milestoneIds && milestoneIds.length > 0 }
  });

  // 3. Process Multicall Data
  const processedFlows = React.useMemo(() => {
    if (!multicallData || !milestoneIds) return [];
    
    const flows = [];
    for (let i = 0; i < milestoneIds.length; i++) {
      const milestone = multicallData[i * 2]?.result as any;
      const interest = multicallData[i * 2 + 1]?.result as bigint;
      
      if (milestone) {
        flows.push({
          id: Number(milestoneIds[i]),
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
    return flows.reverse(); // Newest first
  }, [multicallData, milestoneIds]);

  // 4. Aggregates
  const stats = React.useMemo(() => {
    const active = processedFlows.filter(f => !f.isReleased);
    const tvl = active.reduce((acc, curr) => acc + curr.amount, 0n);
    const yieldAcc = active.reduce((acc, curr) => acc + curr.yield, 0n);
    const taxLiab = active.reduce((acc, curr) => acc + (curr.amount * BigInt(curr.taxBP) / 10000n), 0n);
    
    return {
      tvl: formatUnits(tvl, 6),
      yield: formatUnits(yieldAcc, 6),
      tax: formatUnits(taxLiab, 6)
    };
  }, [processedFlows]);

  const { writeContractAsync: releaseMilestone } = useWriteContract();
  const { writeContractAsync: createEscrow } = useWriteContract();

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

  const handleCreateEscrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker || !newAmount) return;
    
        const taxRecipient = selectedJurisId === 'custom' 
            ? customTaxAddr 
            : JURISDICTIONS.find(j => j.id === selectedJurisId)?.address;

        if (!taxRecipient || taxRecipient === '0x0000000000000000000000000000000000000000') {
            toast.error("Invalid Authority", { description: "You must select a valid tax jurisdiction." });
            return;
        }

        const hash = await createEscrow({
            address: CONTRACTS.HashFlowEscrow.address,
            abi: CONTRACTS.HashFlowEscrow.abi,
            functionName: 'createEscrow',
            args: [newWorker as `0x${string}`, taxRecipient as `0x${string}`, parseUnits(newAmount, 6), Number(newTax)]
        });
        toast.success("Escrow Initiated", { description: `TX: ${hash.slice(0, 10)}...` });
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
            abi: CONTRACTS.HashFlowEscrow.abi,
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
    toast.success("HSP Payment Received!", {
      description: "Auto-escrow initiated for new milestone.",
    });
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
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
            <Zap className="text-white w-6 h-6" />
          </div>
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
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
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
                {processedFlows.length === 0 && !isLoadingFlows && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-mono text-xs">
                      NO ACTIVE FLOWS FOUND FOR THIS MERCHANT
                    </td>
                  </tr>
                )}
                {processedFlows.map((flow) => (
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Amount (HSP)</label>
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
