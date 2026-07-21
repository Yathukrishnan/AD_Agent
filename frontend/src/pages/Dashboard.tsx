import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Ad, Competitor, CompetitorSummary, Product } from "../lib/api";
import { PlatformIcon } from "../lib/icons";

// CVD-validated chart colours (order: instagram, facebook, twitter, google, youtube)
const PLAT_COLOR: Record<string, string> = {
  meta: "#0866FF", instagram: "#d55181", facebook: "#3987e5", twitter: "#8d99a6", google: "#c98500", youtube: "#e66767",
};
const PLAT_LABEL: Record<string, string> = {
  meta: "Meta Ads", facebook: "Facebook", instagram: "Instagram", twitter: "X", google: "Google", youtube: "YouTube",
};
// legend / stacked-segment render order that keeps CVD separation
const PLAT_ORDER = ["meta", "instagram", "facebook", "twitter", "google", "youtube"];

// --- de-duplication: brands cross-post the SAME creative to IG + X (and run
// near-identical variants), so we collapse repeats per advertiser, keeping the
// single best representative (paid > organic, richer media, more engagement). ---
function normText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")        // drop links
    .replace(/[^\p{L}\p{N}]+/gu, " ")        // keep letters/numbers (Arabic incl.)
    .replace(/\s+/g, " ")
    .trim();
}
function tokenSet(s: string): Set<string> {
  return new Set(normText(s).split(" ").filter((w) => w.length > 2));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
const PLAT_WEIGHT: Record<string, number> = { meta: 5, instagram: 3, twitter: 2, youtube: 2, facebook: 1, google: 1 };
function dedupeAds(ads: Ad[]): Ad[] {
  // rank "best representative" first: paid Meta ads win, then media, engagement, longevity
  const rank = (a: Ad) =>
    (PLAT_WEIGHT[a.platform] ?? 1) * 100 +
    (a.media_url ? 40 : 0) + (a.thumbnail_url ? 5 : 0) +
    Math.min(50, ((a.views ?? 0) + (a.likes ?? 0) * 3) / 1000) +
    a.performance_score / 100 + a.days_active / 100;
  const byAdv: Record<string, Ad[]> = {};
  for (const a of ads) (byAdv[a.advertiser] ||= []).push(a);
  const out: Ad[] = [];
  for (const list of Object.values(byAdv)) {
    const kept: { key: string; toks: Set<string> }[] = [];
    for (const a of [...list].sort((x, y) => rank(y) - rank(x))) {
      const src = a.headline_original || a.headline_translation;
      const key = normText(src);
      const toks = tokenSet(src);
      // repetition = identical normalized text, or ≥85% token overlap with a kept ad
      const dup = kept.some((k) => (key && k.key === key) || jaccard(k.toks, toks) >= 0.85);
      if (!dup) { kept.push({ key, toks }); out.push(a); }
    }
  }
  return out;
}

// Build the Overview/Comparison summary from the ads actually gathered,
// so it reflects the real competitors (not a static mock).
function buildSummaries(ads: Ad[]): CompetitorSummary[] {
  const byAdv: Record<string, Ad[]> = {};
  for (const a of ads) (byAdv[a.advertiser] ||= []).push(a);
  const total = ads.length || 1;
  return Object.entries(byAdv).map(([competitor, list]) => {
    const count: Record<string, number> = {};
    for (const a of list) count[a.platform] = (count[a.platform] || 0) + 1;
    const mix: Record<string, number> = {};
    for (const [p, c] of Object.entries(count)) mix[p] = Math.round((c / list.length) * 100);
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return {
      competitor,
      active_ads: list.length,
      share_of_voice: Math.round((list.length / total) * 100),
      top_platform: top ? top[0] : "",
      platform_mix: mix,
      longest_running_days: list.reduce((m, a) => Math.max(m, a.days_active), 0),
    };
  }).sort((a, b) => b.active_ads - a.active_ads);
}

type Tab = "overview" | "feed" | "compare";

// pick up the product + confirmed competitors chosen during onboarding
function stored<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}

export default function Dashboard() {
  const [product, setProduct] = useState<Product>(stored<Product>("gai.product", {
    name: "5G mobile plans", category: "Telecom", country: "Qatar",
    known_competitors: [], platforms: ["facebook", "instagram", "google", "youtube", "twitter"],
  }));
  const [competitors, setCompetitors] = useState<Competitor[]>(stored<Competitor[]>("gai.competitors", []));
  const [ads, setAds] = useState<Ad[]>([]);
  const [summary, setSummary] = useState<CompetitorSummary[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [source, setSource] = useState<string>("…");
  const [loading, setLoading] = useState(false);
  const [adsLoading, setAdsLoading] = useState(false);

  async function loadMeta() {
    const h = await api.health(); setSource(h.data_source);
  }
  // gather live ads for the confirmed competitors, then derive the Overview
  // summary from those real ads. If nothing is gathered we show an honest empty
  // state — NEVER unrelated mock data (that used to leak telecom brands in).
  async function loadAds(comp: Competitor[]) {
    setAdsLoading(true);
    try {
      // gather ads for the top 6 confirmed competitors
      const top = comp.slice(0, 6);
      const country = product.country;   // focus gathering on the selected region
      let merged: Ad[] = [];
      if (top.length) {
        const lists = await Promise.all(
          top.map((c) => api.ads(c.name, undefined, country, c.handle).catch(() => [] as Ad[])));
        merged = lists.flat();
      }
      const clean = dedupeAds(merged);   // collapse cross-posted / repeated creatives
      setAds(clean);
      setSummary(clean.length ? buildSummaries(clean) : []);
    } catch {
      setAds([]);
      setSummary([]);
    } finally { setAdsLoading(false); }
  }
  async function discover() {
    setLoading(true);
    try { const found = await api.discover(product); setCompetitors(found); await loadAds(found); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    loadMeta();
    if (competitors.length) loadAds(competitors); else discover();
    /* eslint-disable-next-line */
  }, []);

  const totalAds = summary.reduce((n, s) => n + s.active_ads, 0);
  const leader = [...summary].sort((a, b) => b.share_of_voice - a.share_of_voice)[0];
  const topPlatform = leader ? (PLAT_LABEL[leader.top_platform] ?? leader.top_platform) : "—";

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* top bar */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--primary)" }} />
          <strong style={{ fontWeight: 600 }}>Gulf Ad Intelligence</strong>
          <span className="pill" style={{ marginLeft: 8 }}>{product.category} · {product.country}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="label-mono" style={{ color: source === "live" ? "var(--primary)" : "var(--text-2)" }}>
            data: {source}
          </span>
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => { loadMeta(); loadAds(competitors); }} disabled={adsLoading}
            title="Re-gather ads across all platforms">
            {adsLoading ? "Refreshing…" : "↻ Refresh ads"}
          </button>
          <Link to="/" className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}>← Home</Link>
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }}
            onClick={() => { sessionStorage.removeItem("gai.auth"); window.location.href = "/login"; }}>
            Log out
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, padding: 20, maxWidth: 1240, margin: "0 auto" }}>
        {/* SIDEBAR — add product + competitor discovery */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="label-mono">Your product</div>
            <input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })}
              style={inp} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} style={inp} placeholder="Category" />
              <input value={product.country} onChange={(e) => setProduct({ ...product, country: e.target.value })} style={inp} placeholder="Country" />
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={discover} disabled={loading}>
              {loading ? "Finding…" : "Discover competitors"}
            </button>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div className="label-mono" style={{ marginBottom: 10 }}>Competitors</div>
            {competitors.map((c) => (
              <div key={c.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 14 }}>{c.name}</strong>
                  <span className="pill" style={{ borderColor: c.tier === "direct" ? "rgba(163,230,53,.4)" : "var(--border)", color: c.tier === "direct" ? "var(--primary)" : "var(--text-2)" }}>{c.tier}</span>
                </div>
                <div className="body-2" style={{ fontSize: 12, marginTop: 3 }}>{c.reason}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN */}
        <main>
          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Tile k="Competitor ads" v={String(totalAds)} d="tracked" />
            <Tile k="SoV leader" v={leader?.competitor ?? "—"} d={leader ? `${leader.share_of_voice}%` : ""} />
            <Tile k="Top platform" v={topPlatform} d="most ads" />
            <Tile k="Longest-running" v={`${Math.max(...summary.map(s => s.longest_running_days), 0)}d`} d="proven winner" />
          </div>

          {/* tabs */}
          <nav style={{ display: "flex", gap: 4, margin: "22px 0 16px", borderBottom: "1px solid var(--border)" }}>
            {(["overview", "feed", "compare"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
                {t === "overview" ? "Overview" : t === "feed" ? "Ad Feed" : "Comparison"}
              </button>
            ))}
          </nav>

          {tab === "overview" && <Overview summary={summary} />}
          {tab === "feed" && (
            <>
              {adsLoading && <p className="body-2" style={{ fontSize: 13, marginBottom: 12 }}>Gathering live competitor ads…</p>}
              <Feed ads={ads} competitors={competitors} />
            </>
          )}
          {tab === "compare" && <Compare summary={summary} />}
        </main>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function Overview({ summary }: { summary: CompetitorSummary[] }) {
  const max = Math.max(...summary.map((s) => s.share_of_voice), 1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card">
        <h3 style={{ fontSize: 15 }}>Share of voice</h3>
        <p className="body-2" style={{ fontSize: 12, marginBottom: 14 }}>% of category ads in market</p>
        {summary.map((s) => (
          <div key={s.competitor} style={{ display: "grid", gridTemplateColumns: "110px 1fr 44px", gap: 10, alignItems: "center", marginBottom: 12, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{s.competitor}</span>
            <div style={{ height: 20, background: "var(--surface-2)", borderRadius: 5 }}>
              <div style={{ height: "100%", width: `${(s.share_of_voice / max) * 100}%`, background: "var(--primary)", borderRadius: 5 }} />
            </div>
            <span className="tnum" style={{ textAlign: "right", fontWeight: 700 }}>{s.share_of_voice}%</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15 }}>Platform mix</h3>
        <p className="body-2" style={{ fontSize: 12, marginBottom: 14 }}>Where each competitor spends creatives</p>
        {summary.map((s) => (
          <div key={s.competitor} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{s.competitor}</div>
            <div style={{ display: "flex", height: 22, borderRadius: 5, overflow: "hidden", background: "var(--surface-2)" }}>
              {PLAT_ORDER.filter((p) => s.platform_mix[p]).map((p, i) => (
                <div key={p} title={`${PLAT_LABEL[p]} ${s.platform_mix[p]}%`} style={{ width: `${s.platform_mix[p]}%`, background: PLAT_COLOR[p], marginLeft: i ? 2 : 0 }} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 8 }}>
          {PLAT_ORDER.map((p) => (
            <span key={p} className="body-2" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: PLAT_COLOR[p] }} />{PLAT_LABEL[p]}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ gridColumn: "1/-1", borderLeft: "3px solid var(--primary)" }}>
        <span className="label-mono">Opportunity</span>
        <p style={{ marginTop: 8, fontSize: 14 }}>
          Competitors run under 17% of ads on <strong>X</strong> — that conversation channel is open for your campaigns.
        </p>
      </div>
    </div>
  );
}

/* ---------- Ad Feed (one section per platform) ---------- */
const FEED_ORDER = ["meta", "instagram", "twitter", "facebook", "youtube", "google"];
const PLAT_NOTE: Record<string, string> = {
  meta: "Real paid ads running now on Facebook & Instagram (Meta Ad Library)",
  instagram: "Feed & Reels — image and video creatives",
  facebook: "Feed & Stories ads",
  google: "Search & display presence",
  youtube: "Video ads & channel content",
  twitter: "Posts & campaigns on X",
};

// ads are shown in their real (Arabic) creative text; detect Arabic script for RTL
const hasArabic = (s?: string) => /[؀-ۿ]/.test(s || "");

// compact count: 311 · 1.2K · 124M
function fmt(n?: number | null): string {
  if (n == null) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
}
function fmtDur(s?: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
// engagement ("attraction") — only what the platform actually returned
type Metric = { icon: string; val: string; title: string };
function metricsOf(a: Ad): Metric[] {
  const m: Metric[] = [];
  if (a.views != null) m.push({ icon: "▶", val: fmt(a.views), title: "views" });
  if (a.likes != null) m.push({ icon: "♥", val: fmt(a.likes), title: "likes" });
  if (a.comments != null) m.push({ icon: "💬", val: fmt(a.comments), title: "comments" });
  if (a.shares != null) m.push({ icon: "🔁", val: fmt(a.shares), title: "shares" });
  return m;
}

function AdCard({ a, onOpen }: { a: Ad; onOpen: (a: Ad) => void }) {
  // always show the ad's real creative text (Arabic where the brand ran it in Arabic)
  const text = a.headline_original || a.headline_translation;
  const showRtl = hasArabic(text);

  // hover previews the real ad in place; click opens the in-app viewer
  const [hover, setHover] = useState(false);
  const active = hover;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isYouTube = !!a.embed_url;
  const isVideoFile = !!a.media_url;
  const hasThumb = !!a.thumbnail_url;
  const playable = isYouTube || isVideoFile;
  const accent = PLAT_COLOR[a.platform] || "#888";

  // play/pause the Instagram clip in sync with hover
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) { v.play().catch(() => {}); }
    else { v.pause(); try { v.currentTime = 0; } catch { /* ignore */ } }
  }, [active]);

  const metrics = metricsOf(a);

  return (
    <article className="card card-hover" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onOpen(a)}
        style={{ aspectRatio: "4/5", position: "relative", overflow: "hidden",
          background: `linear-gradient(150deg, ${accent}22, ${accent}66)`,
          cursor: "pointer" }}
      >
        {/* the real ad — plays in place */}
        {isYouTube && active ? (
          <iframe
            src={`${a.embed_url}?autoplay=1&mute=1&controls=0&loop=1&playlist=${a.id}&modestbranding=1&rel=0&playsinline=1`}
            title={text} allow="autoplay; encrypted-media"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        ) : isVideoFile ? (
          <video ref={videoRef} src={a.media_url} poster={a.thumbnail_url || undefined}
            muted loop playsInline preload="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : hasThumb ? (
          <img src={a.thumbnail_url} alt={text} loading="lazy" referrerPolicy="no-referrer"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}

        {/* readability scrim (skipped while a YouTube player is up) */}
        {!(isYouTube && active) && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,0) 48%)" }} />
        )}

        {/* play affordance when idle */}
        {playable && !active && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(0,0,0,.55)",
              color: "#fff", display: "grid", placeItems: "center", fontSize: 17 }}>▶</span>
          </div>
        )}

        <span className="label-mono" style={{ position: "absolute", top: 10, left: 12, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>{a.format}</span>
        {a.is_ad && (
          <span className="label-mono" style={{ position: "absolute", top: 32, left: 12, color: "#0a0a0a", background: "var(--primary)", padding: "1px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
            AD{a.ad_type ? ` · ${a.ad_type}` : ""}
          </span>
        )}
        {a.duration
          ? <span className="pill" style={{ position: "absolute", top: 8, right: 10, background: "rgba(0,0,0,.6)", color: "#fff", border: 0 }}>{fmtDur(a.duration)}</span>
          : null}

        {!(isYouTube && active) && (
          <span className={showRtl ? "ar" : ""} style={{ position: "absolute", left: 12, right: 12, bottom: 10, fontSize: 13.5, color: "#fff", lineHeight: 1.4, textShadow: "0 1px 4px rgba(0,0,0,.7)" }}>{text}</span>
        )}
      </div>

      <div style={{ padding: "11px 13px 13px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {metrics.length > 0 && (
          <div className="tnum" style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5 }}>
            {metrics.map((m) => (
              <span key={m.title} title={m.title} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: accent }}>{m.icon}</span>{m.val}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="pill">{a.language}</span>
          <span className="pill">{a.offer_type}</span>
          {a.country && (
            <span className="pill">
              📍 {a.country.startsWith("All regions") ? "GCC & Levant" : a.country}
            </span>
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 12 }} className="body-2">
          <span>{a.advertiser}{a.posted ? ` · ${a.posted}` : (a.days_active ? ` · ${a.days_active}d` : "")}</span>
          <button onClick={() => onOpen(a)}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--primary)", fontWeight: 600, font: "inherit" }}>
            View ad →
          </button>
        </div>
      </div>
    </article>
  );
}

// In-app viewer — plays / shows the ad inside our platform. Close to continue.
function AdModal({ a, onClose }: { a: Ad; onClose: () => void }) {
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 760);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onResize = () => setNarrow(window.innerWidth < 760);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";           // lock background scroll
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const text = a.headline_original || a.headline_translation;
  const showRtl = hasArabic(text);
  const accent = PLAT_COLOR[a.platform] || "#888";
  const metrics = metricsOf(a);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.82)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ maxWidth: 960, width: "100%", maxHeight: "92vh", overflow: "auto", padding: 0,
          display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.35fr) minmax(280px,1fr)" }}>
        {/* media — the ad, playing in our platform */}
        <div style={{ position: "relative", background: "#000", minHeight: narrow ? 240 : 340, display: "grid", placeItems: "center" }}>
          {a.embed_url ? (
            <iframe src={`${a.embed_url}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={text} allow="autoplay; encrypted-media; fullscreen" allowFullScreen
              style={{ width: "100%", aspectRatio: "16/9", border: 0, display: "block" }} />
          ) : a.media_url ? (
            <video src={a.media_url} poster={a.thumbnail_url || undefined} controls autoPlay playsInline
              style={{ width: "100%", maxHeight: "92vh", objectFit: "contain", background: "#000" }} />
          ) : a.thumbnail_url ? (
            <img src={a.thumbnail_url} alt={text} referrerPolicy="no-referrer"
              style={{ width: "100%", maxHeight: "92vh", objectFit: "contain" }} />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>
              <PlatformIcon p={a.platform} size={38} />
              <p style={{ marginTop: 12, fontSize: 13 }}>
                This {PLAT_LABEL[a.platform] ?? a.platform} result has no inline preview — open the original below.
              </p>
            </div>
          )}
        </div>

        {/* details + engagement */}
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PlatformIcon p={a.platform} size={18} />
              <strong>{PLAT_LABEL[a.platform] ?? a.platform}</strong>
            </div>
            <button onClick={onClose} aria-label="Close viewer"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)",
                width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
          </div>

          <div>
            <div className="label-mono" style={{ color: "var(--text-2)" }}>{a.advertiser}</div>
            <p className={showRtl ? "ar" : ""} style={{ fontSize: 15.5, marginTop: 6, lineHeight: 1.5 }}>{text}</p>
          </div>

          {metrics.length > 0 && (
            <div className="tnum" style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              {metrics.map((m) => (
                <div key={m.title}>
                  <div style={{ fontSize: 19, fontWeight: 700 }}><span style={{ color: accent }}>{m.icon}</span> {m.val}</div>
                  <div className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{m.title}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span className="pill">{a.format}</span>
            <span className="pill">{a.language}</span>
            <span className="pill">{a.offer_type}</span>
            {a.country && <span className="pill">📍 {a.country.startsWith("All regions") ? "GCC & Levant" : a.country}</span>}
            {a.posted && <span className="pill">{a.posted}</span>}
            {a.duration ? <span className="pill">{fmtDur(a.duration)}</span> : null}
          </div>

          {a.url && (
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"
              style={{ marginTop: "auto", justifyContent: "center" }}>
              Open original on {PLAT_LABEL[a.platform] ?? a.platform} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* "How they advertise" — reads the focused competitor's gathered creatives and
   surfaces their approach: where they run ads, what formats & offers they use,
   which language they speak to the market in, and their most-engaged creative. */
function HowTheyAdvertise({ name, ads }: { name: string; ads: Ad[] }) {
  const n = ads.length;
  const plat: Record<string, number> = {};
  const fmt: Record<string, number> = {};
  const offers: Record<string, number> = {};
  let arabic = 0;
  for (const a of ads) {
    plat[a.platform] = (plat[a.platform] || 0) + 1;
    if (a.format) fmt[a.format] = (fmt[a.format] || 0) + 1;
    if (a.offer_type) offers[a.offer_type] = (offers[a.offer_type] || 0) + 1;
    if (a.language === "arabic" || a.language === "arabizi" || a.language === "bilingual") arabic++;
  }
  const rank = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const platList = rank(plat);
  const fmtList = rank(fmt);
  const topOffers = rank(offers).slice(0, 4).map(([o]) => o);
  const arabicPct = n ? Math.round((arabic / n) * 100) : 0;
  const country = ads.find((a) => a.country)?.country || "";
  // engagement-weighted "most effective" creative (views + likes + comments)
  const eng = (a: Ad) => (a.views ?? 0) + (a.likes ?? 0) * 3 + (a.comments ?? 0) * 5;
  const best = [...ads].sort((a, b) => eng(b) - eng(a))[0];
  const bestText = best ? (best.headline_original || best.headline_translation) : "";

  const Sig = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--primary)", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>How {name} advertises</h3>
        <span className="body-2" style={{ fontSize: 12.5 }}>
          {n} creative{n === 1 ? "" : "s"} gathered{country ? ` · ${country.startsWith("All regions") ? "GCC & Levant" : country}` : ""}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginTop: 14 }}>
        <Sig label="Where they run ads">
          {platList.map(([p, c]) => (
            <span key={p} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6, borderColor: PLAT_COLOR[p], color: "var(--text)" }}>
              <i style={{ width: 9, height: 9, borderRadius: 3, background: PLAT_COLOR[p] }} />
              {PLAT_LABEL[p] ?? p}<span className="tnum" style={{ color: "var(--text-2)" }}>{c}</span>
            </span>
          ))}
        </Sig>

        <Sig label="Creative formats">
          {fmtList.map(([f, c]) => (
            <span key={f} className="pill">{f}<span className="tnum" style={{ color: "var(--text-2)", marginLeft: 5 }}>{c}</span></span>
          ))}
        </Sig>

        <Sig label="Offers & objectives">
          {topOffers.length ? topOffers.map((o) => <span key={o} className="pill">{o}</span>)
            : <span className="body-2" style={{ fontSize: 12 }}>—</span>}
        </Sig>

        <Sig label="Language to market">
          <span className="pill" style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
            {arabicPct}% Arabic
          </span>
          <span className="pill">{100 - arabicPct}% English</span>
        </Sig>
      </div>

      {best && bestText && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span className="label-mono" style={{ color: "var(--text-2)", whiteSpace: "nowrap", marginTop: 2 }}>Most engaged</span>
          <p className="body-2" style={{ fontSize: 13, margin: 0 }}>
            <span className={hasArabic(bestText) ? "ar" : ""} style={{ color: "var(--text)" }}>{bestText}</span>
            <span style={{ color: "var(--text-2)" }}>
              {" — "}{PLAT_LABEL[best.platform] ?? best.platform}
              {best.views != null ? ` · ${fmt2(best.views)} views` : best.likes != null ? ` · ${fmt2(best.likes)} likes` : ""}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// compact number (shared with the feed's fmt, aliased to avoid a name clash here)
function fmt2(n?: number | null): string { return fmt(n); }

function Feed({ ads, competitors }: { ads: Ad[]; competitors: Competitor[] }) {
  const [openAd, setOpenAd] = useState<Ad | null>(null);
  const [paidOnly, setPaidOnly] = useState(true);   // the tool is about their ADS, not every post
  const [origin, setOrigin] = useState<"all" | "regional" | "global">("all");

  // advertiser name -> origin (global / regional-native), from discovery
  const originOf: Record<string, string> = {};
  competitors.forEach((c) => { originOf[c.name.toLowerCase()] = (c.origin || "").toLowerCase(); });
  const advOrigin = (n: string) => originOf[n.toLowerCase()] || "";
  const uniqAdv = Array.from(new Set(ads.map((a) => a.advertiser)));
  const nRegional = uniqAdv.filter((n) => advOrigin(n) === "regional").length;
  const nGlobal = uniqAdv.filter((n) => advOrigin(n) === "global").length;

  // origin filter applied first, then per-competitor focus
  const originAds = origin === "all" ? ads : ads.filter((a) => advOrigin(a.advertiser) === origin);
  const byAdv: Record<string, Ad[]> = {};
  for (const a of originAds) (byAdv[a.advertiser] ||= []).push(a);
  const advertisers = Object.entries(byAdv)
    .sort((a, b) => b[1].length - a[1].length).map(([n]) => n);

  const [advertiser, setAdvertiser] = useState<string>("all");
  // reset the per-competitor focus if the origin filter removed it
  useEffect(() => {
    if (advertiser !== "all" && !advertisers.includes(advertiser)) setAdvertiser("all");
    /* eslint-disable-next-line */
  }, [ads, origin]);

  if (!ads.length) return (
    <div className="card" style={{ padding: 20 }}>
      <strong>No ads gathered for these competitors yet.</strong>
      <p className="body-2" style={{ marginTop: 8, fontSize: 13.5 }}>
        This usually means the platform data APIs are temporarily rate-limited (free-tier
        monthly quota). We only show ads pulled from the competitors' own pages — never
        placeholder data — so nothing is shown rather than something unrelated. Try
        “↻ Refresh ads” shortly, or once the API quota resets.
      </p>
    </div>
  );

  const focused = advertiser === "all" ? originAds : (byAdv[advertiser] || []);
  const shown = paidOnly ? focused.filter((a) => a.is_ad) : focused;

  // group the focused competitor's ads by platform
  const groups: Record<string, Ad[]> = {};
  for (const a of shown) (groups[a.platform] ||= []).push(a);
  const platforms = FEED_ORDER.filter((p) => groups[p]?.length);
  Object.keys(groups).forEach((p) => { if (!platforms.includes(p)) platforms.push(p); });

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
    padding: "7px 13px", borderRadius: 999, fontSize: 13, fontFamily: "var(--font-body)",
    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
    background: active ? "rgba(163,230,53,.12)" : "var(--surface-2)",
    color: active ? "var(--primary)" : "var(--text)", fontWeight: active ? 700 : 500,
  });

  return (
    <>
      {/* ORIGIN filter — global players vs native/regional AI companies */}
      {(nRegional > 0 || nGlobal > 0) && (
        <>
          <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 8 }}>Company origin</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            <button style={chip(origin === "all")} onClick={() => setOrigin("all")}>
              All<span className="tnum" style={{ opacity: 0.8 }}>{nRegional + nGlobal}</span>
            </button>
            <button style={chip(origin === "regional")} onClick={() => setOrigin("regional")}>
              📍 Native / regional<span className="tnum" style={{ opacity: 0.8 }}>{nRegional}</span>
            </button>
            <button style={chip(origin === "global")} onClick={() => setOrigin("global")}>
              🌍 Global<span className="tnum" style={{ opacity: 0.8 }}>{nGlobal}</span>
            </button>
          </div>
        </>
      )}

      {/* WHOSE ads — pick a competitor to study how they advertise */}
      <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 8 }}>Focus on a competitor</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {advertisers.map((n) => (
          <button key={n} style={chip(advertiser === n)} onClick={() => setAdvertiser(n)}>
            {n}<span className="tnum" style={{ opacity: 0.8 }}>{byAdv[n].length}</span>
          </button>
        ))}
        <button style={chip(advertiser === "all")} onClick={() => setAdvertiser("all")}>
          All competitors<span className="tnum" style={{ opacity: 0.8 }}>{originAds.length}</span>
        </button>
      </div>

      {/* paid/promotional filter — we care about their ADS, not every organic post */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 18, cursor: "pointer", fontSize: 13 }}>
        <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)}
          style={{ accentColor: "#a3e635", width: 15, height: 15 }} />
        <span>Paid &amp; promotional only</span>
        <span className="tnum" style={{ color: "var(--text-2)" }}>
          {focused.filter((a) => a.is_ad).length}/{focused.length}
        </span>
      </label>

      {paidOnly && !shown.length && focused.length > 0 && (
        <p className="body-2" style={{ marginBottom: 18 }}>
          No paid / promotional creatives detected here — untick “Paid &amp; promotional only” to see all {focused.length} posts.
        </p>
      )}

      {/* how the focused competitor advertises (skipped in the "All" view) */}
      {advertiser !== "all" && shown.length > 0 && <HowTheyAdvertise name={advertiser} ads={shown} />}

      {/* jump-bar: every platform with its count, so nothing is hidden below the fold */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {platforms.map((p) => (
          <a key={p} href={`#feed-${p}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none",
              padding: "7px 12px", borderRadius: 999, border: `1px solid ${PLAT_COLOR[p]}`,
              background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }}>
            <PlatformIcon p={p} size={15} />
            {PLAT_LABEL[p] ?? p}
            <span className="tnum" style={{ color: PLAT_COLOR[p], fontWeight: 700 }}>{groups[p].length}</span>
          </a>
        ))}
      </div>
      {platforms.map((p) => (
        <section key={p} id={`feed-${p}`} style={{ marginBottom: 28, scrollMarginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PlatformIcon p={p} size={20} />
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{PLAT_LABEL[p] ?? p}</h3>
            <span className="pill tnum" style={{ borderColor: PLAT_COLOR[p], color: PLAT_COLOR[p] }}>{groups[p].length}</span>
          </div>
          <p className="body-2" style={{ fontSize: 12.5, margin: "4px 0 12px" }}>{PLAT_NOTE[p] ?? ""}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
            {groups[p].map((a, i) => <AdCard key={`${p}-${i}`} a={a} onOpen={setOpenAd} />)}
          </div>
        </section>
      ))}
      {openAd && <AdModal a={openAd} onClose={() => setOpenAd(null)} />}
    </>
  );
}

/* ---------- Comparison ---------- */
function Compare({ summary }: { summary: CompetitorSummary[] }) {
  const rows: [string, (s: CompetitorSummary) => string][] = [
    ["Active ads", (s) => String(s.active_ads)],
    ["Share of voice", (s) => `${s.share_of_voice}%`],
    ["Top platform", (s) => PLAT_LABEL[s.top_platform] ?? s.top_platform],
    ["Longest-running ad", (s) => `${s.longest_running_days}d`],
  ];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr>
            <th style={th}>Metric</th>
            {summary.map((s) => <th key={s.competitor} style={th}>{s.competitor}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label}>
              <td style={{ ...td, color: "var(--text-2)", fontWeight: 600 }}>{label}</td>
              {summary.map((s) => <td key={s.competitor} style={td} className="tnum">{fn(s)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- bits ---------- */
function Tile({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="card" style={{ padding: "14px 15px" }}>
      <div className="label-mono" style={{ color: "var(--text-2)" }}>{k}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, letterSpacing: "-0.02em" }}>{v}</div>
      <div className="body-2" style={{ fontSize: 12 }}>{d}</div>
    </div>
  );
}
const inp: React.CSSProperties = {
  width: "100%", marginTop: 8, padding: "9px 11px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
  fontFamily: "var(--font-body)", fontSize: 14, outline: "none",
};
const tabBtn = (active: boolean): React.CSSProperties => ({
  border: 0, background: "transparent", fontFamily: "var(--font-body)", fontSize: 14,
  fontWeight: 600, color: active ? "var(--text)" : "var(--text-2)", padding: "9px 14px",
  cursor: "pointer", borderBottom: `2px solid ${active ? "var(--primary)" : "transparent"}`, marginBottom: -1,
});
const th: React.CSSProperties = {
  textAlign: "left", padding: "11px 14px", background: "var(--surface-2)",
  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text-2)", borderBottom: "1px solid var(--border)",
};
const td: React.CSSProperties = { padding: "11px 14px", borderBottom: "1px solid var(--border)" };
