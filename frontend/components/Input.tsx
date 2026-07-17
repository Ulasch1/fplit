'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export default function Input({ label, id, className, ...rest }: InputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  const underlineInputClasses =
    'bg-transparent border-b-[3px] border-ink px-1 py-2 text-ink focus:outline-none focus:border-accent';

  return (
    <div className="flex flex-col gap-1 w-full">
      <label htmlFor={inputId} className="font-mono uppercase text-xs tracking-wider text-inkSecondary">
        {label}
      </label>
      <input id={inputId} className={`${underlineInputClasses} ${className ?? ''}`} {...rest} />
    </div>
  );
}
