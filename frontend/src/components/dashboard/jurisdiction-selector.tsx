'use client';

import React from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const JURISDICTIONS = [
  { 
    id: 'hk', 
    name: 'Hong Kong IRD', 
    address: '0xF1450c7F1CADE2Ff5Ec70e2Ffb191107352F4720',
    flag: '🇭🇰'
  },
  { 
    id: 'sg', 
    name: 'Singapore IRAS', 
    address: '0x4045FD2c1ce56Fe5C50c6F631EC5df8e6bcc4b00',
    flag: '🇸🇬'
  },
  { 
    id: 'uae', 
    name: 'UAE FTA Portal', 
    address: '0xa1f70ffA4322E3609dD905b41f17Bf3913366bC1',
    flag: '🇦🇪'
  },
  { 
    id: 'custom', 
    name: 'Custom Authority', 
    address: '',
    flag: '🌐'
  }
];

interface JurisdictionSelectorProps {
  selectedId: string;
  customAddress: string;
  onSelect: (id: string) => void;
  onCustomAddressChange: (addr: string) => void;
}

export function JurisdictionSelector({ 
  selectedId, 
  customAddress, 
  onSelect, 
  onCustomAddressChange 
}: JurisdictionSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selected = JURISDICTIONS.find(j => j.id === selectedId) || JURISDICTIONS[0];

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Tax Jurisdiction</label>
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs hover:border-primary/30 transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{selected.flag}</span>
            <span className="font-medium text-slate-700">{selected.name}</span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
            {JURISDICTIONS.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => {
                  onSelect(j.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{j.flag}</span>
                  <span className={cn(selectedId === j.id ? "font-bold text-primary" : "text-slate-600")}>
                    {j.name}
                  </span>
                </div>
                {selectedId === j.id && <Check className="w-3 h-3 text-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedId === 'custom' && (
        <input
          type="text"
          placeholder="Enter Custom Tax Authority Address (0x...)"
          value={customAddress}
          onChange={(e) => onCustomAddressChange(e.target.value)}
          className="w-full mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono animate-in slide-in-from-top-1 duration-200"
        />
      )}
      
      <div className="flex items-center gap-2 max-w-sm px-1 text-[9px] text-slate-400 font-medium italic overflow-auto">
        <Globe className="w-3 h-3" />
        Destination: {selectedId === 'custom' ? (customAddress || 'Required') : selected.address}
      </div>
    </div>
  );
}
