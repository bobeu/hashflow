'use client';

import React, { useState } from 'react';
import { History, Zap, Search } from 'lucide-react';
import { useHashFlow } from '@/context/HashFlowContext';
import { formatUnits } from 'viem';
import { cn } from '@/lib/utils';
import { MilestoneDetailModal } from './MilestoneDetailModal';

export function SettlementFlows() {
  const { milestones, isLoading, stats } = useHashFlow();
  const [selectedFlow, setSelectedFlow] = useState<any>(null);

  if (isLoading && milestones.length === 0) {
    return (
      <div className="bg-white rounded-md border border-slate-200 p-12 text-center animate-pulse">
        <div className="w-12 h-12 bg-slate-100 rounded-full mx-auto mb-4" />
        <p className="text-slate-400 font-mono text-xs uppercase tracking-widest">Hydrating Institutional Data...</p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-primary">Active Settlement Flows</h2>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left zebra-table min-w-[600px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">ID</th>
              <th className="px-6 py-3">Worker (ZK)</th>
              <th className="px-6 py-3">Escrow Principal</th>
              <th className="px-6 py-3">Accrued Yield</th>
              <th className="px-6 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-100">
            {milestones.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-mono text-xs">
                  NO ACTIVE FLOWS FOUND FOR THIS MERCHANT
                </td>
              </tr>
            )}
            {milestones.map((flow) => (
              <tr 
                key={flow.id} 
                className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => setSelectedFlow(flow)}
              >
                <td className="px-6 py-4 font-mono text-xs text-slate-500">#{flow.id}</td>
                <td className="px-6 py-4 font-mono text-xs text-primary font-medium">
                  {flow.worker.slice(0, 6)}...{flow.worker.slice(-4)}
                </td>
                <td className="px-6 py-4 font-bold">{formatUnits(flow.amount, 6)} {stats.symbol}</td>
                <td className="px-6 py-4">
                  <span className="text-accent font-mono text-xs flex items-center gap-1 font-bold">
                    <Zap className="w-3 h-3" />
                    {parseFloat(formatUnits(flow.yield, 6)).toFixed(6)} {stats.symbol}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    className={cn(
                      "px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ml-auto shadow-sm group-hover:bg-primary group-hover:text-white",
                      flow.isReleased ? "bg-slate-100 text-slate-400" : "bg-white border border-slate-200 text-slate-600"
                    )}
                  >
                    View <Search className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MilestoneDetailModal 
        flow={selectedFlow} 
        onClose={() => setSelectedFlow(null)} 
      />
    </section>
  );
}
