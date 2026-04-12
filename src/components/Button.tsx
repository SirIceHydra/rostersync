import React from 'react';

export const Button: React.FC<{ 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}> = ({ children, onClick, variant = 'primary', className = "", disabled, type = 'button' }) => {
  const base = "px-4 py-2.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-sm";
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    danger: 'bg-rose-500 text-white hover:bg-rose-600',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  return (
    <button disabled={disabled} onClick={onClick} type={type} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};
