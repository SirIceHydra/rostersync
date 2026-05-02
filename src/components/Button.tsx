import React from 'react';

const variantClass: Record<'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'accent', string> = {
  primary: 'rs-btn rs-btn--primary',
  secondary: 'rs-btn rs-btn--secondary',
  danger: 'rs-btn rs-btn--danger',
  success: 'rs-btn rs-btn--success',
  ghost: 'rs-btn rs-btn--ghost',
  accent: 'rs-btn rs-btn--accent',
};

export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'accent';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}> = ({ children, onClick, variant = 'primary', className = '', disabled, type = 'button', title }) => {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      type={type}
      title={title}
      className={`${variantClass[variant]} active:scale-[0.98] ${className}`.trim()}
    >
      {children}
    </button>
  );
};
