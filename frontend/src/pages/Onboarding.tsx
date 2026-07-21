import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Competitor, Platform, Product } from "../lib/api";

const ALL_PLATFORMS: Platform[] = ["meta", "instagram", "twitter", "google", "youtube"];
const PLAT_LABEL: Record<Platform, string> = {
  meta: "Meta Ads", facebook: "Facebook", instagram: "Instagram", twitter: "X", google: "Google", youtube: "YouTube",
};
const COUNTRIES = ["All regions (GCC & Levant)", "Qatar", "Saudi Arabia", "United Arab Emirates", "Kuwait", "Oman", "Bahrain", "Jordan"];

type Picked = Competitor & { selected: boolean };

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [product, setProduct] = useState<Product>({
    name: "", category: "", description: "", website: "", country: "Qatar",
    known_competitors: [], platforms: [...ALL_PLATFORMS],
  });
  const [competitors, setCompetitors] = useState<Picked[]>([]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // need either a description paragraph or a website URL for the model to analyse
  const canDiscover = !!((product.description || "").trim() || (product.website || "").trim());

  function togglePlatform(p: Platform) {
    setProduct((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter((x) => x !== p)
        : [...prev.platforms, p],
    }));
  }

  async function discover() {
    setLoading(true); setError("");
    try {
      // derive a short display name from the description / website for the dashboard
      const derived = product.name
        || (product.description || "").trim().split(/[.\n]/)[0].slice(0, 60)
        || (product.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const enriched = { ...product, name: derived || "My product" };
      setProduct(enriched);
      const found = await api.discover(enriched);
      // pre-select the top 6 (already ranked by market presence) so the dashboard
      // gathers & compares the six major competitors by default
      setCompetitors(found.map((c, i) => ({ ...c, selected: i < 6 })));
      setStep(2);
    } catch (e) {
      setError("Couldn't reach the discovery service. Is the backend running on :8000?");
    } finally {
      setLoading(false);
    }
  }

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    setCompetitors((prev) => [
      ...prev,
      { id: name.toLowerCase().replace(/\s+/g, "-"), name, reason: "Added by you",
        tier: "leader", confidence: 1, kind: "Added by you", handle: "", selected: true },
    ]);
    setCustom("");
  }

  function enterApp() {
    const chosen = competitors.filter((c) => c.selected);
    localStorage.setItem("gai.product", JSON.stringify(product));
    localStorage.setItem("gai.competitors", JSON.stringify(chosen));
    nav("/app");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--primary)" }} />
          <strong style={{ fontWeight: 600 }}>Gulf Ad Intelligence</strong>
        </div>
        <Link to="/" className="body-2" style={{ fontSize: 13 }}>Cancel</Link>
      </header>

      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto", padding: "48px 24px", flex: 1 }}>
        {/* progress */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          <Dot on={true} label="1 · Your product" />
          <Dot on={step === 2} label="2 · Confirm competitors" />
        </div>

        {step === 1 && (
          <div className="reveal in">
            <div className="label-mono">Set up</div>
            <h1 className="display-md" style={{ marginTop: 10 }}>Describe your company</h1>
            <p className="body-2" style={{ marginTop: 10 }}>
              Tell us about your AI product or service — a short paragraph, or just your
              website. Our model reads it, works out what you build, and finds the core AI
              companies you compete with. We never create ads — only gather and analyse theirs.
            </p>

            <div className="card" style={{ marginTop: 24 }}>
              <Field label="What does your company / product / service do?">
                <textarea style={{ ...inp, minHeight: 96, resize: "vertical", fontFamily: "var(--font-body)" }}
                  value={product.description || ""}
                  placeholder="e.g. We build a real-time voice AI agent that answers customer calls in Arabic and English, with sub-second latency and human-like speech."
                  onChange={(e) => setProduct({ ...product, description: e.target.value })} />
              </Field>
              <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                <Field label="Company website (optional)">
                  <input style={inp} value={product.website || ""} placeholder="e.g. yourcompany.ai"
                    onChange={(e) => setProduct({ ...product, website: e.target.value })} />
                </Field>
                <Field label="Market / region">
                  <select style={inp} value={product.country}
                    onChange={(e) => setProduct({ ...product, country: e.target.value })}>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 8 }}>Platforms to watch</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ALL_PLATFORMS.map((p) => {
                    const on = product.platforms.includes(p);
                    return (
                      <button key={p} onClick={() => togglePlatform(p)} className="pill"
                        style={{ cursor: "pointer", borderColor: on ? "var(--primary)" : "var(--border)", color: on ? "var(--primary)" : "var(--text-2)" }}>
                        {PLAT_LABEL[p]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && <p style={{ color: "#e66767", fontSize: 13, marginTop: 12 }}>{error}</p>}

            <button className="btn btn-primary" style={{ marginTop: 22, justifyContent: "center", width: "100%", opacity: canDiscover ? 1 : 0.5 }}
              disabled={!canDiscover || loading} onClick={discover}>
              {loading ? "Finding competitors…" : "Discover competitors →"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="reveal in">
            <div className="label-mono">Confirm</div>
            <h1 className="display-md" style={{ marginTop: 10 }}>Your competitors</h1>
            <p className="body-2" style={{ marginTop: 10 }}>
              We found these advertisers for <strong style={{ color: "var(--text)" }}>{product.name}</strong> in {product.country}.
              Toggle any off, or add your own.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
              {competitors.map((c, i) => (
                <label key={c.id} className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", padding: 16, borderColor: c.selected ? "rgba(163,230,53,0.4)" : "var(--border)" }}>
                  <input type="checkbox" checked={c.selected}
                    onChange={() => setCompetitors((prev) => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}
                    style={{ marginTop: 3, accentColor: "#a3e635", width: 16, height: 16 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <strong>{c.name}</strong>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {c.origin === "regional" && <span className="pill" style={{ borderColor: "#5bb8c4", color: "#5bb8c4" }}>📍 Native</span>}
                        {c.kind && <span className="pill" style={{ borderColor: "rgba(163,230,53,.4)", color: "var(--primary)" }}>{c.kind}</span>}
                        <span className="pill" style={{ color: "var(--text-2)" }}>{c.tier}</span>
                        <span className="body-2 tnum" style={{ fontSize: 12 }}>{Math.round(c.confidence * 100)}%</span>
                      </div>
                    </div>
                    <div className="body-2" style={{ fontSize: 13, marginTop: 4 }}>{c.reason}</div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input style={inp} value={custom} placeholder="Add a competitor by name"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()} />
              <button className="btn btn-ghost" onClick={addCustom} style={{ whiteSpace: "nowrap" }}>+ Add</button>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}
                disabled={!competitors.some((c) => c.selected)} onClick={enterApp}>
                Gather their ads → Enter dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <span style={{ height: 4, borderRadius: 4, flex: 1, background: on ? "var(--primary)" : "var(--border)" }} />
      <span className="label-mono" style={{ color: on ? "var(--primary)" : "var(--text-2)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontFamily: "var(--font-body)",
  fontSize: 15, outline: "none",
};
