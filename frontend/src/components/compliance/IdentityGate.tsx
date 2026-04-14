'use client';

import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHashFlow } from '@/context/HashFlowContext';
import { useReadContract, useAccount } from 'wagmi';
import { CONTRACTS } from '@/contracts';
import { isAddress, Hex } from 'viem';

interface Props {
  workerAddress: string;
  onVerified: (v: boolean) => void;
}

export function IdentityGate({ workerAddress, onVerified }: Props) {
  const { address } = useAccount();
  const { mockVerify } = useHashFlow();
  
  const isValid = isAddress(workerAddress);

  const { data: isZkVerified } = useReadContract({
    address: CONTRACTS.MockZKVerifier.address,
    abi: CONTRACTS.MockZKVerifier.abi as any,
    functionName: 'isVerified',
    args: [workerAddress as Hex],
    query: { 
      enabled: isValid,
      //@ts-ignore
      refetchInterval: 5000 
    }
  });

  const verified = isValid && Boolean(isZkVerified);
  
  // Update parent when status changes
  React.useEffect(() => {
    onVerified(verified);
  }, [verified, onVerified]);

  if (!isValid) return null;

  return (
    <div className="space-y-4">
      {!verified && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-4 transition-all">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-orange-600">ZK-Identity Registry: Worker Not Found</p>
              <p className="text-[10px] text-orange-500/80 mb-3 mt-1">Institutional compliance requires a valid proof of residency/ID.</p>
              <button 
                type="button"
                onClick={() => mockVerify(workerAddress)}
                className="text-[10px] bg-[#00FFD1] text-slate-900 font-bold px-4 py-2 rounded-full hover:bg-[#00FFD1]/80 transition-shadow shadow-[0_0_10px_rgba(0,255,209,0.2)]"
              >
                One-Click ZK-Verification
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "flex flex-col items-center gap-4 p-6 rounded-lg border-2 border-dashed transition-all",
        verified ? "border-accent/30 bg-accent/[0.02]" : "border-warning/30 bg-warning/[0.02]"
      )}>
        {verified ? (
          <ShieldCheck className="w-16 h-16 text-accent" />
        ) : (
          <ShieldAlert className="w-16 h-16 text-warning" />
        )}
        <div className="text-center">
          <p className="font-bold text-primary">{verified ? "IDENTITY SECURED" : "VERIFICATION PENDING"}</p>
          <p className="text-xs text-slate-400 mt-1">HashKey ZK-ID Compliance Gate</p>
        </div>
      </div>
    </div>
  );
}
