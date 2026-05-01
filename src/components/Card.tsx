import React from 'react';

export const Card: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className = "" }) => {
  const hasCustomBg = className.includes('bg-');
  const baseClasses = hasCustomBg
    ? 'rounded-3xl shadow-sm border border-slate-200 overflow-hidden'
    : 'bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden';
  
  return (
    <div className={`${baseClasses} ${className}`}>
      {children}
    </div>
  );
};
