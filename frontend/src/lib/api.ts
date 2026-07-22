// Tiny API client. Talks to the FastAPI backend (proxied at /api in dev).

export type Platform = "meta" | "facebook" | "instagram" | "twitter" | "google" | "youtube";

export interface Product {
  name: string;
  category: string;
  description?: string;   // free-text paragraph about the company/product/service
  website?: string;       // optional company site URL — analysed by the model
  country: string;
  known_competitors: string[];
  platforms: Platform[];
}

export interface Competitor {
  id: string;
  name: string;
  reason: string;
  tier: string;              // leader | challenger | emerging
  confidence: number;
  share_of_voice?: number | null;
  kind?: string;             // Foundation model | AI API/platform | AI startup | Big-tech AI | AI infrastructure
  handle?: string;           // official social handle for reliable gathering
  origin?: string;           // "global" | "regional" (native to the selected region)
}

export interface Ad {
  id: string;
  advertiser: string;
  platform: Platform;
  country: string;
  format: string;
  language: string;
  headline_original: string;
  headline_translation: string;
  offer_type: string;
  days_active: number;
  performance_score: number;
  first_seen: string;
  url?: string;
  // media for in-card preview / play
  thumbnail_url?: string;
  media_url?: string;
  embed_url?: string;
  duration?: number | null;
  posted?: string;
  // engagement ("attraction")
  likes?: number | null;
  comments?: number | null;
  views?: number | null;
  shares?: number | null;
  // ad classification ("looks paid")
  is_ad?: boolean;
  ad_type?: string;
  ad_signal?: string;
  relevant?: boolean;   // false only when clearly off-topic vs the product
}

export interface CompetitorSummary {
  competitor: string;
  active_ads: number;
  share_of_voice: number;
  top_platform: string;
  platform_mix: Record<string, number>;
  longest_running_days: number;
}

// In dev, Vite proxies /api → :8000. In production (e.g. Vercel), set
// VITE_API_URL to the deployed backend origin (e.g. https://ad-agent.onrender.com).
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}/api${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json();
}

export const api = {
  health: () => get<{ status: string; data_source: string }>("/health"),
  discover: (product: Product) =>
    post<Competitor[]>("/competitors/discover", { product }),
  ads: (advertiser?: string, platform?: string, country?: string, handle?: string, topic?: string) => {
    const q = new URLSearchParams();
    if (advertiser) q.set("advertiser", advertiser);
    if (platform) q.set("platform", platform);
    if (country) q.set("country", country);
    if (handle) q.set("handle", handle);
    if (topic) q.set("topic", topic);
    const qs = q.toString();
    return get<Ad[]>(`/ads${qs ? "?" + qs : ""}`);
  },
  summary: () => get<CompetitorSummary[]>("/competitors/summary"),
};
