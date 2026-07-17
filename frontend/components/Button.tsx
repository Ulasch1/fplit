'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'link';
  fullWidth?: boolean;
}

export default function Button({
  variant = 'primary',
  fullWidth = false,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  const baseClasses = 'font-mono uppercase tracking-wide';

  const variantClasses =
    variant === 'primary'
      ? 'bg-accent text-white border-[3px] border-ink rounded-[6px] shadow-[3px_3px_0_rgba(0,0,0,0.12)] px-5 py-2.5 hover:brightness-110 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed'
      : 'text-ink underline underline-offset-4 text-sm tracking-wide';

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      type={type ?? 'button'}
      className={`${baseClasses} ${variantClasses} ${widthClass} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
