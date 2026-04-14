'use client';

import React from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { cn } from '@/lib/utils';
import { Globe, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { useHashFlow } from '@/context/HashFlowContext';
import { AnalyticCards } from '@/components/analytics/AnalyticCards';
import { SettlementFlows } from '@/components/escrow/SettlementFlows';
import { EscrowForm } from '@/components/escrow/EscrowForm';
import { TransactionModal } from '@/components/TransactionModal';
import { ShredderViz } from '@/components/dashboard/shredder-viz';

export default function DashboardPage() {
  const { chainId } = useAccount();
  const { modal, showShredder, setShowShredder, refresh, selectedFlowForShredder, setSelectedFlowForShredder } = useHashFlow();

  const isLive = chainId !== undefined && chainId === 177;

  const handleSimulatePayment = () => {
    toast.info("Institutional HSP Trigger Simulated", { 
      description: "Hashflow will detect the payment and auto-deploy the escrow." 
    });
    // For demo purposes, we just refresh after a delay
    setTimeout(() => {
      refresh();
      toast.success("Settlement Detected", { description: "New escrow milestone generated from HSP." });
    }, 2000);
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
          <AnalyticCards />
          
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Institutional Hub</h2>
              <button
                onClick={handleSimulatePayment}
                className="text-[10px] bg-primary text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors flex items-center gap-2 font-bold uppercase tracking-tighter"
              >
                <Zap className="w-3 h-3" /> Simulate HSP Payment
              </button>
            </div>
            <SettlementFlows />
          </div>
        </div>

        {/* Right Section: Actions & Compliance */}
        <div className="lg:col-span-1 flex flex-col gap-8">
          <EscrowForm />

          {/* Protocol Info */}
          <section className="glass-panel p-6 rounded-md">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-sm font-bold text-primary uppercase">Protocol Insight</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              HashFlow transforms static settlement capital into dynamic assets.
              Our <strong>Shadow Spread</strong> model captures platform fees strictly from yield, 
              ensuring zero-cost principal routing for institutions.
            </p>
          </section>
        </div>
      </main>

      {/* Global Overlays */}
      <TransactionModal 
        stage={modal.stage} 
        txHash={modal.txHash} 
        errorMessage={modal.error} 
      />
      <ShredderViz 
        isVisible={showShredder} 
        flow={selectedFlowForShredder}
        onComplete={() => { setShowShredder(false); setSelectedFlowForShredder(null); }} 
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-400 font-medium tracking-tight">© 2026 HashFlow Protocol. Powering the HashKey PayFi Economy.</p>
        <div className="flex items-center gap-6">
          <span className="text-[10px] font-mono text-slate-300">BUILD: v1.0.0-STABLE</span>
          <div className="flex gap-4">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <div className="w-2 h-2 rounded-full bg-accent" />
            <div className="w-2 h-2 rounded-full bg-slate-200" />
          </div>
        </div>
      </footer>
    </div>
  );
}
