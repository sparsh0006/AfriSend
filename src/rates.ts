// Supported African + major currencies with display names and flags
export const CURRENCIES: Record<string, { name: string; flag: string }> = {
  ngn: { name: "Nigerian Naira",       flag: "🇳🇬" },
  ghs: { name: "Ghanaian Cedi",        flag: "🇬🇭" },
  kes: { name: "Kenyan Shilling",      flag: "🇰🇪" },
  zar: { name: "South African Rand",   flag: "🇿🇦" },
  tzs: { name: "Tanzanian Shilling",   flag: "🇹🇿" },
  ugx: { name: "Ugandan Shilling",     flag: "🇺🇬" },
  etb: { name: "Ethiopian Birr",       flag: "🇪🇹" },
  xof: { name: "West African CFA",     flag: "🌍" },
  egp: { name: "Egyptian Pound",       flag: "🇪🇬" },
  usd: { name: "US Dollar",            flag: "🇺🇸" },
  eur: { name: "Euro",                 flag: "🇪🇺" },
  gbp: { name: "British Pound",        flag: "🇬🇧" },
  inr: { name: "Indian Rupee",         flag: "🇮🇳" },
};

// CoinGecko free API — no key needed, 30 calls/min limit
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

// Cache rates for 5 minutes to avoid hitting rate limits
let cache: { rates: Record<string, number>; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.rates;

  const vsCurrencies = Object.keys(CURRENCIES).join(",");
  const url = `${COINGECKO_URL}?ids=tether&vs_currencies=${vsCurrencies}`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

  const data = await res.json() as { tether: Record<string, number> };
  const rates = data.tether;

  cache = { rates, ts: now };
  return rates;
}

// Convert USDT amount to a target currency
export async function convert(
  usdtAmount: number,
  targetCurrency: string
): Promise<{ result: number; rate: number; currency: string }> {
  const rates = await getRates();
  const key   = targetCurrency.toLowerCase();

  if (!rates[key]) throw new Error(`Currency ${targetCurrency.toUpperCase()} not supported`);

  const rate   = rates[key];
  const result = usdtAmount * rate;
  return { result, rate, currency: key };
}