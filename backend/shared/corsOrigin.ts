/** When `CORS_ORIGIN` is unset, allow common Vite dev URLs (ports shift when 3000 is busy). */
export function corsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw) return raw.split(',').map((s) => s.trim());
  const bases = ['http://localhost', 'http://127.0.0.1'];
  const ports = [3000, 3001, 3002, 3003, 3004, 3005, 5173, 5174];
  const urls: string[] = [];
  for (const h of bases) {
    for (const p of ports) urls.push(`${h}:${p}`);
  }
  return urls;
}
