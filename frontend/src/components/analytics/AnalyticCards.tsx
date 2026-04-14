'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Coins, BarChart3 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { useHashFlow } from '@/context/HashFlowContext';

export function AnalyticCards() {
  const { stats } = useHashFlow();
  const [localYield, setLocalYield] = useState(0);

  // Growth Ticker simulation overlaying the base blockchain value
  // To make it look "live" even between blocks
  useEffect(() => {
    // Sync with blockchain stat base
    setLocalYield(parseFloat(stats.yield));
    
    const interval = setInterval(() => {
      setLocalYield(prev => prev + 0.000001); // Visible ticking
    }, 100);
    
    return () => clearInterval(interval);
  }, [stats.yield]);

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <StatCard
        title="Merchant TVL"
        value={`$${stats.tvl}`}
        icon={Building2}
        description="Live on-chain principal"
      />
      <StatCard
        title="Portfolio Interest"
        value={localYield.toFixed(6)}
        icon={Coins}
        description="Real-time streamed growth"
        isTicker={true}
        className="border-accent/20 bg-accent/[0.02]"
      />
      <StatCard
        title="Tax Forecast"
        value={`$${stats.tax}`}
        icon={BarChart3}
        description="Projected jurisdictional liability"
      />
    </section>
  );
}
