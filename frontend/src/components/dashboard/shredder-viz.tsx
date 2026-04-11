'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ShredderVizProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function ShredderViz({ isVisible, onComplete }: ShredderVizProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/20 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white p-12 rounded-lg shadow-2xl border border-slate-200 max-w-2xl w-full mx-4"
      >
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-primary tracking-tight">Settling Milestone...</h2>
          <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-widest">Executing Programmable PayFi Shredder</p>
        </div>

        <div className="relative h-64 w-full flex items-center justify-center font-mono">
          <svg viewBox="0 0 400 200" className="w-full h-full">
            {/* Prism / Shredder Core */}
            <motion.path 
                d="M 180 80 L 220 80 L 230 120 L 170 120 Z"
                fill="#001B3D"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
            />
            
            {/* Input Line (Payment) */}
            <motion.line 
                x1="0" y1="100" x2="180" y2="100" 
                stroke="#001730" strokeWidth="3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, ease: "easeIn" }}
            />
            <motion.circle 
                cx="0" cy="100" r="4" fill="#10B981"
                animate={{ cx: 180 }}
                transition={{ duration: 1, ease: "easeIn" }}
            />

            {/* Path 1: Worker (Net) */}
            <motion.line 
                x1="220" y1="100" x2="350" y2="60" 
                stroke="#10B981" strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1, duration: 0.8 }}
            />
            <motion.text 
                x="360" y="55" fontSize="10" fontWeight="bold" fill="#10B981"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.8 }}
            >
                WORKER (NET)
            </motion.text>

            {/* Path 2: Gov (80% Tax) */}
            <motion.line 
                x1="220" y1="100" x2="350" y2="100" 
                stroke="#F59E0B" strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1.2, duration: 0.8 }}
            />
            <motion.text 
                x="360" y="105" fontSize="10" fontWeight="bold" fill="#F59E0B"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
            >
                GOVERNANCE (80%)
            </motion.text>

            {/* Path 3: Platform (20% Yield) */}
            <motion.line 
                x1="220" y1="100" x2="350" y2="140" 
                stroke="#001B3D" strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1.4, duration: 0.8 }}
            />
             <motion.text 
                x="360" y="145" fontSize="10" fontWeight="bold" fill="#001B3D"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.2 }}
            >
                PLATFORM (20%)
            </motion.text>
          </svg>
        </div>

        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3 }}
            className="flex justify-center mt-6"
        >
            <button 
                onClick={onComplete}
                className="bg-primary text-white px-8 py-2 rounded-md font-bold text-sm tracking-widest uppercase hover:bg-slate-800 transition-all"
            >
                Close Trace
            </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
