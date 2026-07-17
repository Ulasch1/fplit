import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export default function Card({ className, children, ...rest }: CardProps) {
  const cardSurfaceClasses =
    'bg-card border-[3px] border-ink rounded-[6px] shadow-[5px_5px_0_rgba(0,0,0,0.08)]';

  return (
    <div className={`${cardSurfaceClasses} ${className ?? ''}`} {...rest}>
      {children}
    </div>
  );
}
