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
  Info
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { ShredderViz } from '@/components/dashboard/shredder-viz';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAccount, useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi';
import { CONTRACTS } from '@/contracts';

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

  const { data: realYield } = useReadContract({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi,
    functionName: 'getPendingYield',
    args: [BigInt(1)], // Mocking ID 1 for now
    query: { enabled: !!address }
  });

  const { writeContractAsync: releaseMilestone } = useWriteContract();

  // Live yield ticker effect
  useEffect(() => {
    const timer = setInterval(() => {
      setYieldTicker(prev => prev + 0.0001);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const handleRelease = async (id: number) => {
    setShowShredder(true);
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
              title="Total Value Locked" 
              value="$1.25M" 
              icon={Building2} 
              description="+24.8% from last month"
            />
            <StatCard 
              title="Accrued Yield" 
              value={yieldTicker.toFixed(4)} 
              icon={Coins} 
              description="Live HSK accumulation"
              isTicker={true}
              className="border-accent/20 bg-accent/[0.02]"
            />
            <StatCard 
              title="Tax Liability" 
              value="$250.4K" 
              icon={BarChart3} 
              description="Pending Shredder routing"
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
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Worker (ZK)</th>
                  <th className="px-6 py-3">Escrow Amount</th>
                  <th className="px-6 py-3">Unrealized Yield</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {MOCK_FLOWS.map((flow) => (
                  <tr key={flow.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">{flow.client}</td>
                    <td className="px-6 py-4 font-mono text-xs text-primary font-medium">{flow.worker}</td>
                    <td className="px-6 py-4 font-bold">{flow.amount}</td>
                    <td className="px-6 py-4 text-accent font-medium tabular-nums">{flow.yield}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleRelease(flow.id)}
                        className={cn(
                        "px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ml-auto",
                        flow.status === "Locked" 
                          ? "bg-primary text-white shadow-sm hover:shadow-md" 
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      )}>
                        {flow.status === "Locked" ? (
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
