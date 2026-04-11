import React from 'react';
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  className?: string;
  isTicker?: boolean;
}

export function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  className,
  isTicker = false
}: StatCardProps) {
  return (
    <div className={cn(
      "p-6 rounded-md border border-slate-200 bg-white shadow-sm flex flex-col gap-2 transition-all hover:shadow-md",
      className
    )}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</span>
        <div className="p-2 rounded-md bg-slate-50 border border-slate-100">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn(
          "text-3xl font-bold tracking-tight text-primary",
          isTicker && "tabular-nums"
        )}>
          {value}
        </span>
      </div>
      {description && (
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      )}
    </div>
  );
}
