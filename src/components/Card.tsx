import React from 'react';

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  const hasCustomBg = className.includes('bg-');
  const shell = `rounded-[var(--rs-r-lg)] border border-[var(--rs-slate-200)] overflow-hidden ${
    hasCustomBg ? '' : 'bg-[var(--rs-white)]'
  }`;
  return <div className={`${shell} ${className}`.trim()}>{children}</div>;
};
