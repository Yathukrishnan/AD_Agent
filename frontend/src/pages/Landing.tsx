import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Platform } from "../lib/api";

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const COUNTRIES = ["Qatar", "Saudi Arabia", "UAE", "Kuwait", "Oman", "Bahrain", "Jordan"];

/* real brand icons (inline SVG, self-contained) */
const ICONS: Record<Platform, JSX.Element> = {
  meta: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0866FF" strokeWidth="2.1" strokeLinecap="round"><path d="M2 15.5c0-4.5 1.9-8 4.7-8 2 0 3.3 1.8 5.3 5.2 2 3.4 3.3 5.2 5.3 5.2 2.5 0 4-3 4-6.4 0-3.7-1.7-6-4-6-2.4 0-4.4 2.4-6.6 6C7.8 14.6 5.8 17 3.6 17" /></svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="#1877F2"><path d="M24 12A12 12 0 1 0 10.13 23.85V15.47H7.08V12h3.05V9.36c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z" /></svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#E1306C" strokeWidth="2"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.6" cy="6.4" r="1.1" fill="#E1306C" stroke="none" /></svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" rx="5" fill="#000" /><path fill="#fff" d="M17.53 4.5h2.9l-6.34 7.24L21.5 19.5h-5.6l-4.38-5.73-5.02 5.73H3.6l6.78-7.75L2.9 4.5h5.74l3.96 5.24L17.53 4.5Zm-1.02 13.2h1.6L8.02 6.2H6.3l10.2 11.5Z" /></svg>
  ),
  google: (
    <svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285F4" d="M23 12.25c0-.79-.07-1.55-.2-2.28H12v4.32h6.18a5.29 5.29 0 0 1-2.29 3.47v2.88h3.7C21.46 18.63 23 15.72 23 12.25z" /><path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.59-2.78l-3.7-2.88c-1.03.69-2.35 1.1-3.89 1.1-2.99 0-5.52-2.02-6.43-4.73H1.75v2.97A11.5 11.5 0 0 0 12 23.5z" /><path fill="#FBBC05" d="M5.57 14.21a6.9 6.9 0 0 1 0-4.42V6.82H1.75a11.5 11.5 0 0 0 0 10.36l3.82-2.97z" /><path fill="#EA4335" d="M12 5.04c1.69 0 3.2.58 4.39 1.72l3.28-3.28A11.5 11.5 0 0 0 12 .5 11.5 11.5 0 0 0 1.75 6.82l3.82 2.97C6.48 7.06 9.01 5.04 12 5.04z" /></svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" width="22" height="22"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000" /><path d="M10 8.5 L16 12 L10 15.5 Z" fill="#fff" /></svg>
  ),
};

/* 5 platform nodes feed the intelligence core */
const NODES: { x: number; label: string; platform: Platform; d: string; dash: number; begin: string }[] = [
  { x: 16.67, label: "Meta Ads", platform: "meta", d: "M450 300 C 450 200, 300 120, 150 30", dash: 600, begin: "0s" },
  { x: 33.33, label: "Instagram", platform: "instagram", d: "M450 300 C 450 210, 360 130, 300 30", dash: 520, begin: "0.2s" },
  { x: 50, label: "X", platform: "twitter", d: "M450 300 C 450 180, 450 90, 450 30", dash: 300, begin: "0.4s" },
  { x: 66.67, label: "Google", platform: "google", d: "M450 300 C 450 210, 540 130, 600 30", dash: 520, begin: "0.6s" },
  { x: 83.33, label: "YouTube", platform: "youtube", d: "M450 300 C 450 200, 600 120, 750 30", dash: 600, begin: "0.8s" },
];
const NODE_X = [150, 300, 450, 600, 750];

const FEATURES = [
  { k: "Competitor discovery", d: "Enter your product — we find who advertises the same thing to the same audience, and you confirm the list." },
  { k: "Multi-platform gather", d: "Their ads pulled from Facebook, Instagram, X, Google and YouTube — one place, always current." },
  { k: "Bilingual understanding", d: "Arabic (incl. Gulf dialect & Arabizi) and English read, translated, and classified automatically." },
  { k: "Ranked by performance", d: "Sorted by longevity, reach and variants — so the ads that actually work rise to the top." },
];
const ROW = ["Multi-platform gather", "Bilingual AR + EN", "Ranked by performance", "Confirm-and-go setup"];

function Title() {
  const words = "See how your competitors advertise.".split(" ");
  return (
    <h1 className="display-lg" style={{ marginTop: 18, maxWidth: 820, marginInline: "auto" }}>
      {words.map((w, i) => (
        <span className="mask-word" key={i}>
          <span className="mask-inner" style={{ animationDelay: `${i * 0.07}s`, color: w.startsWith("advertise") ? "var(--primary)" : undefined }}>{w}</span>
        </span>
      ))}
    </h1>
  );
}

export default function Landing() {
  useReveal();
  return (
    <div>
      <div style={{ pointerEvents: "none", position: "absolute", inset: 0, overflow: "hidden", display: "flex", justifyContent: "center" }}>
        <div style={{ height: 760, width: 760, borderRadius: "50%", background: "rgba(163,230,53,0.05)", filter: "blur(120px)" }} />
      </div>

      <header className="container" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--primary)" }} />
          <strong style={{ fontWeight: 600 }}>Gulf Ad Intelligence</strong>
        </div>
        <Link to="/onboard" className="btn btn-ghost" style={{ padding: "9px 16px", fontSize: 14 }}>Launch app</Link>
      </header>

      <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--border)" }}>
        <div className="container" style={{ position: "relative", padding: "72px 24px 96px", textAlign: "center", zIndex: 1 }}>
          <div className="pill" style={{ color: "var(--primary)", borderColor: "rgba(163,230,53,0.25)", background: "rgba(163,230,53,0.08)" }}>
            Competitor ad intelligence · GCC
          </div>
          <Title />
          <p className="body-2" style={{ fontSize: 18, marginTop: 20, maxWidth: 640, marginInline: "auto" }}>
            One product in. Every competitor's ad out — gathered from Facebook, Instagram, X, Google
            and YouTube, read in Arabic and English, and ranked by what's working.
          </p>

          {/* converging-lines visualization with brand-icon nodes */}
          <div className="viz" style={{ marginTop: 64 }}>
            <svg viewBox="0 0 900 360" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} fill="none" preserveAspectRatio="xMidYMin slice">
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              {NODES.map((n, i) => <path key={"bg" + i} d={n.d} stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />)}
              {NODES.map((n, i) => (
                <path key={"ln" + i} d={n.d} stroke="#A3E635" strokeWidth="1.5" strokeLinecap="round" fill="none" style={{ strokeDasharray: n.dash, strokeDashoffset: n.dash }}>
                  <animate attributeName="stroke-dashoffset" values={`${n.dash};0;${n.dash}`} dur="3s" begin={n.begin} repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" />
                </path>
              ))}
              {NODE_X.map((x, i) => (
                <circle key={x} cx={x} cy={30} r="3" fill="#A3E635" filter="url(#glow)">
                  <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </svg>

            {NODES.map((n) => (
              <div key={n.label} className="node" style={{ left: `${n.x}%` }} title={n.label}>
                <div className="node-in">{ICONS[n.platform]}</div>
                <span className="node-label label-mono" style={{ color: "var(--text-2)" }}>{n.label}</span>
              </div>
            ))}

            <div className="core">
              <div className="core-in">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#A3E635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 L4 14 h7 l-1 8 L20 10 h-7 z" /></svg>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 56, flexWrap: "wrap" }}>
            <Link to="/onboard" className="btn btn-primary">Launch app →</Link>
            <a href="#how" className="btn btn-ghost">How it works</a>
          </div>

          <div style={{ marginTop: 48, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            {ROW.map((t, i) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "var(--text-2)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--primary)" }} />{t}
                </span>
                {i < ROW.length - 1 && <span style={{ width: 40, height: 1, borderTop: "1px dashed var(--border)" }} />}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 40 }}>
            <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 12 }}>Covering the GCC & Levant</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {COUNTRIES.map((c) => <span key={c} className="pill">{c}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="section">
        <div className="container">
          <div className="label-mono reveal">One platform, full competitor picture</div>
          <h2 className="display-md reveal d1" style={{ marginTop: 12, maxWidth: 620 }}>Connect the platforms your rivals advertise on.</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "var(--gap)", marginTop: 40 }}>
            {FEATURES.map((f, i) => (
              <div key={f.k} className={`card card-hover reveal d${i + 1}`}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(163,230,53,0.12)", border: "1px solid rgba(163,230,53,0.35)", display: "grid", placeItems: "center", marginBottom: 16 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--primary)" }} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>{f.k}</h3>
                <p className="body-2" style={{ marginTop: 8, fontSize: 14.5 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="card reveal" style={{ textAlign: "center", padding: "56px 24px", background: "linear-gradient(180deg,#1a1a1d,#141416)" }}>
            <h2 className="display-md" style={{ maxWidth: 520, marginInline: "auto" }}>Add your product. Watch the competition.</h2>
            <p className="body-2" style={{ marginTop: 14, maxWidth: 460, marginInline: "auto" }}>We never build ads — we gather and analyse the ones your competitors are already running.</p>
            <Link to="/onboard" className="btn btn-primary" style={{ marginTop: 26 }}>Launch app →</Link>
          </div>
        </div>
      </section>

      <footer className="container" style={{ padding: "28px 24px 48px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span className="body-2" style={{ fontSize: 13 }}>Gulf Ad Intelligence — analysis only, never generates ads.</span>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Facebook · Instagram · X · Google · YouTube</span>
      </footer>
    </div>
  );
}
