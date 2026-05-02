import React from 'react';

const pillMap: Record<'indigo' | 'green' | 'red' | 'yellow' | 'slate', string> = {
  indigo: 'rs-pill rs-pill--brand',
  green: 'rs-pill rs-pill--success',
  red: 'rs-pill rs-pill--danger',
  yellow: 'rs-pill rs-pill--warning',
  slate: 'rs-pill rs-pill--neutral',
};

export const Badge: React.FC<{
  children: React.ReactNode;
  color?: 'indigo' | 'green' | 'red' | 'yellow' | 'slate';
  /** Keeps label on one line inside narrow cells (tables, tight columns). */
  noWrap?: boolean;
  className?: string;
  title?: string;
}> = ({ children, color = 'indigo', noWrap = false, className = '', title }) => {
  const layout = noWrap
    ? 'inline-flex items-center justify-center whitespace-nowrap max-w-none shrink-0 text-center'
    : 'inline-flex items-center';

  return (
    <span title={title} className={`${pillMap[color]} ${layout} ${className}`.trim()}>
      {children}
    </span>
  );
};
