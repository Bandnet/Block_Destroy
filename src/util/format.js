const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function trim(str) {
  return str.includes('.') ? str.replace(/\.?0+$/, '') : str;
}

/** 1234 -> "1.23K", 5.2e9 -> "5.2B". Falls back to exponent form past 1e36. */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '0';
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) {
    if (Number.isInteger(n)) return String(n);
    return trim(n.toFixed(n < 10 ? 2 : 1));
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('e+', 'e');
  let scaled = n / Math.pow(1000, tier);
  let decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  let text = scaled.toFixed(decimals);
  if (parseFloat(text) >= 1000 && tier + 1 < SUFFIXES.length) {
    tier++;
    scaled = n / Math.pow(1000, tier);
    decimals = scaled < 10 ? 2 : 1;
    text = scaled.toFixed(decimals);
  }
  return trim(text) + SUFFIXES[tier];
}

/** Whole numbers with thousands separators (for counters like blocks destroyed). */
export function formatInt(n) {
  if (n >= 1e15) return formatNumber(n);
  return Math.floor(n).toLocaleString('en-US');
}

/** Milliseconds -> "m:ss.cc" or "h:mm:ss.cc". */
export function formatTime(ms, { centis = true } = {}) {
  if (ms == null || !Number.isFinite(ms)) return '--:--';
  const total = Math.max(0, ms);
  const cs = Math.floor((total % 1000) / 10);
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const pad = (v, n = 2) => String(v).padStart(n, '0');
  const tail = centis ? `.${pad(cs)}` : '';
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}${tail}` : `${m}:${pad(s)}${tail}`;
}

/** Percent with sensible precision: 0.256 -> "25.6%". */
export function formatPercent(fraction, digits = 1) {
  return `${trim((fraction * 100).toFixed(digits))}%`;
}
