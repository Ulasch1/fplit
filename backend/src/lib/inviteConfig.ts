export function getActivationWindowMs(): number {
  const minutes = parseFloat(process.env.INVITE_ACTIVATION_WINDOW_MINUTES ?? '');
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes * 60 * 1000;
  }
  return 30 * 60 * 1000; // 30‑minute default
}
