import React from 'react';

export const Badge: React.FC<{ 
  children: React.ReactNode; 
  color?: 'indigo' | 'green' | 'red' | 'yellow' | 'slate' 
}> = ({ children, color = 'indigo' }) => {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-rose-50 text-rose-700 border-rose-100',
    yellow: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight border ${colors[color]}`}>
      {children}
    </span>
  );
};
