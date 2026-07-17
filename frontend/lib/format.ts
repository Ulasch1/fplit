export function formatMoney(amountKurus: number): string {
  const sign = amountKurus < 0 ? '-' : '';
  const abs = Math.abs(amountKurus);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function dollarsToKurus(input: string): number | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (s === '') return null;
  if (s.startsWith('$')) {
    s = s.slice(1);
  }
  if (s.length > 12) {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  const value = Number(s);
  const kurus = Math.round(value * 100);
  if (!Number.isFinite(kurus) || kurus <= 0) {
    return null;
  }
  return kurus;
}
