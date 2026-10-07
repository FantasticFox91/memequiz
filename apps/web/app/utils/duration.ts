// 75_000 → «1:15», 3_725_000 → «1:02:05»; null — «—» (у старых результатов времени нет)
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
