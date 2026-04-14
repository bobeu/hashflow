'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserCheck, Zap, Shield, TrendingUp, Landmark } from 'lucide-react';
import { useHashFlow } from '@/context/HashFlowContext';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { cn, MilestoneFlow } from '@/lib/utils';
import { CONTRACTS } from '@/contracts';

interface Props {
  flow: MilestoneFlow | null;
  onClose: () => void;
}

export function MilestoneDetailModal({ flow, onClose }: Props) {
  const { releaseMilestone, stats, setSelectedFlowForShredder } = useHashFlow();

  // Fetch real yield from blockchain
  const { data: blockchainYield } = useReadContract({
    address: CONTRACTS.HashFlowEscrow.address,
    abi: CONTRACTS.HashFlowEscrow.abi as any,
    functionName: 'getPendingYield',
    args: flow ? [BigInt(flow.id)] : undefined,
    query: { 
      enabled: !!flow,
      refetchInterval: 5000 // Refresh every 5 seconds for live yield
    }
  });

  const liveYield = (blockchainYield as bigint) ?? flow?.yield ?? 0n;

  if (!flow) return null;

  const principal = flow.amount;
  const tax = (principal * BigInt(flow.taxBP)) / 10000n;
  const netPrincipal = principal - tax;
  
  // Platform takes 50% of yield
  const protocolFee = liveYield / 5n;
  const workerYield = liveYield - protocolFee;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white border-2 border-primary rounded-xl overflow-hidden max-w-lg w-full max-h-[calc(100vh-1rem)] my-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
        >
          {/* Header */}
          <div className="bg-primary p-6 flex items-center justify-between text-white">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-70">Settlement ID</p>
              <h2 className="text-xl font-bold font-mono">#{flow.id.toString().padStart(6, '0')}</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-6rem)]">
            {/* Value Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 border border-slate-100 rounded-lg">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Gross Principal</p>
                <p className="text-xl font-bold text-primary font-mono">{formatUnits(principal, 6)} {stats.symbol}</p>
              </div>
              <div className="bg-accent/5 p-4 border border-accent/20 rounded-lg relative overflow-hidden">
                <p className="text-[10px] text-accent font-bold uppercase mb-1">Live Accrued Yield</p>
                <p className="text-xl font-bold text-accent font-mono transition-all">
                  {formatUnits(liveYield, 6)}
                </p>
                <div className="absolute top-0 right-0 p-2">
                  <TrendingUp className="w-3 h-3 text-accent animate-pulse" />
                </div>
              </div>
            </div>

            {/* Detailed Analytics */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Landmark className="w-3 h-3" /> Distributable Liquidity
              </h3>
              
              <div className="space-y-3">
                <DetailRow label="Worker Net Transfer" value={`$${formatUnits(netPrincipal, 6)}`} sub="Principal - Tax" />
                <DetailRow label="Worker Yield (50%)" value={`$${formatUnits(workerYield, 6)}`} sub="Base Growth" color="text-emerald-600" />
                <DetailRow label="Jurisdictional Tax" value={`$${formatUnits(tax, 6)}`} sub={`${flow.taxBP/100}% Remittance`} color="text-amber-600" />
                <DetailRow label="Protocol Revenue" value={`$${formatUnits(protocolFee, 6)}`} sub="Service Portion" color="text-primary" />
              </div>
            </div>

            {/* Tax Destination */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Tax Destination</span>
                <div className={`flex items-center gap-1 text-[10px] ${flow.isReleased? 'text-emerald-600' : 'text-red-300'} font-bold`}>
                  <UserCheck className="w-3 h-3" /> {`${flow.isReleased ? 'REMITTED' : 'PENDING REMITTANCE'}`}
                </div>
              </div>
              <p className="text-xs font-mono break-all text-slate-400">{flow.taxRecipient}</p>
            </div>

            {/* Destination Verification */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">ZK-Identified Worker</span>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                  <Shield className="w-3 h-3" /> VERIFIED
                </div>
              </div>
              <p className="text-xs font-mono break-all text-slate-400">{flow.worker}</p>
            </div>

            {/* Actions */}
            <button
              onClick={() => {
                setSelectedFlowForShredder(flow);
                releaseMilestone(flow.id);
                onClose();
              }}
              disabled={flow.isReleased}
              className={cn(
                "w-full py-4 rounded-lg font-bold flex items-center justify-center gap-3 transition-all",
                flow.isReleased 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                  : "bg-primary text-white hover:bg-slate-800 shadow-xl hover:shadow-[#00FFD1]/20 active:scale-[0.98]"
              )}
            >
              <Zap className="w-4 h-4" />
              {flow.isReleased ? "SETTLED" : "EXECUTE RELEASE & SHRED"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function DetailRow({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-[9px] text-slate-400 uppercase font-medium tracking-tight">{sub}</p>
      </div>
      <p className={cn("font-bold text-sm font-mono", color || "text-slate-900")}>{value}</p>
    </div>
  );
}
