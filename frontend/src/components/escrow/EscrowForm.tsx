'use client';

import React, { useState } from 'react';
import { Zap, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHashFlow } from '@/context/HashFlowContext';
import { JurisdictionSelector } from '@/components/dashboard/jurisdiction-selector';
import { IdentityGate } from '../compliance/IdentityGate';

export function EscrowForm() {
  const { createEscrow, stats } = useHashFlow();
  
  const [worker, setWorker] = useState('');
  const [amount, setAmount] = useState('');
  const [taxBP, setTaxBP] = useState('300');
  const [jurisId, setJurisId] = useState('hk');
  const [customTaxAddr, setCustomTaxAddr] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const taxRecipient = jurisId === 'custom' ? customTaxAddr : '0x090624e647aE1032Ad50624C78E0a7BA7B7EC6F9'; // Placeholder or find from JURISDICTIONS
    // Better: pull from the selector or logic
    await createEscrow({ worker, amount, taxBP: Number(taxBP), taxRecipient });
    setWorker('');
    setAmount('');
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Identity Gate Control */}
      <IdentityGate workerAddress={worker} onVerified={setIsVerified} />

      {/* Create Escrow Form */}
      <section className={cn(
        "p-6 rounded-md border bg-white shadow-sm transition-all duration-300",
        isVerified ? "border-slate-200" : "border-warning/30"
      )}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Institutional Settlement</h3>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
            isVerified ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
          )}>
            {isVerified ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
            {isVerified ? "Verified" : "Locked"}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Worker Address</label>
            <input
              type="text"
              placeholder="0x..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={worker}
              onChange={(e) => setWorker(e.target.value)}
            />
          </div>

          <div className={cn("space-y-4 transition-all", !isVerified && "opacity-50 grayscale pointer-events-none")}>
            <JurisdictionSelector
              selectedId={jurisId}
              customAddress={customTaxAddr}
              onSelect={setJurisId}
              onCustomAddressChange={setCustomTaxAddr}
            />

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tax Rate (bps)</label>
                <span className="text-[10px] text-slate-400 font-mono">{(Number(taxBP) / 100).toFixed(2)}%</span>
              </div>
              <input
                type="number"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
                value={taxBP}
                onChange={(e) => setTaxBP(e.target.value)}
                disabled={!isVerified}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Amount {stats.symbol}</label>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Bal: {stats.balance}</label>
              </div>
              <input
                type="number"
                placeholder="100.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!isVerified}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!isVerified}
            className={cn(
              "w-full py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-2",
              isVerified ? "bg-primary text-white hover:bg-slate-800 shadow-md" : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            <Zap className="w-3 h-3" />
            {isVerified ? "Initiate Escrow" : "Identity Verification Required"}
          </button>
        </form>
      </section>
    </div>
  );
}
