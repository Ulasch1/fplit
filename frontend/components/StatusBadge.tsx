import React from 'react';
import { formatMoney } from '@/lib/format';

interface StatusBadgeProps {
  netKurus: number;
  closed: boolean;
}

export default function StatusBadge({ netKurus, closed }: StatusBadgeProps) {
  let label: string;
  let color: string;

  if (closed) {
    label = '✓ settled';
    color = 'text-inkMuted';
  } else if (netKurus < 0) {
    label = `▼ you owe ${formatMoney(Math.abs(netKurus))}`;
    color = 'text-debtor';
  } else if (netKurus > 0) {
    label = `▲ owed to you ${formatMoney(Math.abs(netKurus))}`;
    color = 'text-creditor';
  } else {
    label = '✓ settled up';
    color = 'text-inkMuted';
  }

  return (
    <span className={`font-mono uppercase text-xs tracking-wide ${color}`}>
      {label}
    </span>
  );
}
