import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, ShieldCheck, XCircle, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TransactionStage = 'idle' | 'awaiting_auth' | 'payment_included' | 'verifying' | 'success' | 'error';

interface TransactionModalProps {
  stage: TransactionStage;
  txHash?: string;
  errorMessage?: string;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ stage, txHash, errorMessage }) => {
  if (stage === 'idle') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-slate-900/40"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-slate-900 border border-slate-700 shadow-2xl rounded-xl overflow-hidden font-sans"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#00FFD1]" />
              Settlement Pulse
            </h2>
            {/* Pulsing indicator */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                {stage === 'success' ? 'Finalized' : stage === 'error' ? 'Failed' : 'Processing'}
              </span>
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  stage === 'success' ? "bg-[#00FFD1]" : stage === 'error' ? "bg-red-500" : "bg-amber-400 animate-pulse"
                )}
              />
            </div>
          </div>

          {/* Stepper Content */}
          <div className="p-6 space-y-6">
            <StepItem
              active={stage === 'awaiting_auth' || stage === 'payment_included' || stage === 'verifying' || stage === 'success'}
              completed={stage === 'payment_included' || stage === 'verifying' || stage === 'success'}
              error={stage === 'error'}
              icon={<ShieldCheck className="w-4 h-4" />}
              title="Awaiting Authorization"
              description="Sign typed data or approve funds"
            />
            
            <div className="ml-4 pl-1 border-l-2 border-slate-700/50 h-4 -my-4" />

            <StepItem
              active={stage === 'payment_included' || stage === 'verifying' || stage === 'success'}
              completed={stage === 'verifying' || stage === 'success'}
              error={stage === 'error'}
              icon={<Loader2 className="w-4 h-4" />}
              title="Payment Included"
              description={txHash ? `Block included: ${txHash.slice(0, 8)}...${txHash.slice(-6)}` : "Awaiting network confirmation"}
              pulse={stage === 'payment_included'}
            />

            <div className="ml-4 pl-1 border-l-2 border-slate-700/50 h-4 -my-4" />

            <StepItem
              active={stage === 'verifying' || stage === 'success'}
              completed={stage === 'success'}
              error={stage === 'error'}
              icon={<Check className="w-4 h-4" />}
              title="Institutional Verification"
              description="Finalizing compliance checkpoints"
              pulse={stage === 'verifying'}
            />
          </div>

          {/* Footer & Progress Bar */}
          <div className="bg-slate-800/50 p-4 border-t border-slate-800 flex flex-col items-center">
            {stage === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-[#00FFD1] text-xs font-bold uppercase tracking-widest"
              >
                <Check className="w-4 h-4" /> Settlement Finalized
              </motion.div>
            )}
            
            {stage === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-1 text-red-500 text-xs font-bold uppercase tracking-widest"
              >
                <div className="flex items-center gap-2"><XCircle className="w-4 h-4" /> Settlement Error</div>
                <span className="text-[10px] text-slate-400 capitalize font-mono text-center">{errorMessage}</span>
              </motion.div>
            )}

            {!['success', 'error'].includes(stage) && (
              <div className="text-[10px] text-slate-400 font-mono uppercase">
                Please do not close this window
              </div>
            )}
            
            {stage === 'success' && txHash && (
              <a
                href={`https://hashkey.blockscout.com/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-1 text-[10px] text-slate-300 hover:text-white font-mono transition-colors"
              >
                View on HashKey Explorer <ArrowRight className="w-3 h-3" />
              </a>
            )}
          </div>
          
          {/* Cyber Mint Progress Line */}
          <div className="h-1 w-full bg-slate-800">
            <motion.div 
              className={cn("h-full", stage === 'error' ? "bg-red-500" : "bg-[#00FFD1]")}
              initial={{ width: "0%" }}
              animate={{ 
                width: stage === 'success' || stage === 'error' ? "100%" 
                     : stage === 'verifying' ? "75%"
                     : stage === 'payment_included' ? "50%"
                     : stage === 'awaiting_auth' ? "25%"
                     : "0%"
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const StepItem = ({ active, completed, error, title, description, icon, pulse }: any) => {
  const isActiveOrCompleted = active || completed;
  
  return (
    <div className={cn("flex items-start gap-4 transition-opacity duration-300", isActiveOrCompleted ? "opacity-100" : "opacity-40")}>
      <div className={cn(
        "mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300",
        completed ? "border-[#00FFD1] bg-[#00FFD1]/10 text-[#00FFD1]" :
        active && !error ? "border-amber-400 bg-amber-400/10 text-amber-400" :
        error && active ? "border-red-500 bg-red-500/10 text-red-500" :
        "border-slate-700 bg-slate-800 text-slate-500",
        pulse && !error && "shadow-[0_0_15px_rgba(251,191,36,0.3)]" // yellow glow if pulsing
      )}>
        <span className={cn("transition-transform duration-500", completed ? "scale-100" : pulse ? "animate-spin-slow" : "scale-100")}>
          {completed ? <Check className="w-4 h-4" /> : error && active ? <XCircle className="w-4 h-4" /> : icon}
        </span>
      </div>
      <div>
        <h4 className={cn(
          "text-sm font-bold tracking-wide",
          completed ? "text-[#00FFD1]" : error && active ? "text-red-500" : active ? "text-white" : "text-slate-500"
        )}>
          {title}
        </h4>
        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{description}</p>
      </div>
    </div>
  );
};
