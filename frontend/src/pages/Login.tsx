import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Demo credentials (client-side only — this is a prototype gate, not real auth).
const DEMO = { email: "admin@gulfai.io", password: "GulfAI@2026" };

export default function Login() {
  const nav = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // on-brand background: signals converging into the intelligence "core"
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, cx = 0, cy = 0, maxR = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    type P = { a: number; r: number; sp: number; tl: number };
    let parts: P[] = [];

    const spawn = (): P => ({
      a: Math.random() * Math.PI * 2,
      r: maxR * (0.75 + Math.random() * 0.45),
      sp: 0.5 + Math.random() * 1.4,
      tl: 26 + Math.random() * 60,
    });

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      cx = w / 2; cy = h * 0.44; maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 40;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(90, Math.round((w * h) / 16000));
      parts = Array.from({ length: n }, spawn);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawCore = (t: number) => {
      const pulse = 0.5 + 0.5 * Math.sin(t / 900);
      const rad = 46 + pulse * 16;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 2.4);
      g.addColorStop(0, `rgba(163,230,53,${0.30 + pulse * 0.18})`);
      g.addColorStop(0.5, "rgba(163,230,53,0.06)");
      g.addColorStop(1, "rgba(163,230,53,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rad * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(163,230,53,${0.55 + pulse * 0.35})`;
      ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
    };

    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // faint converging guide-rings
      ctx.strokeStyle = "rgba(163,230,53,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, i * 120, 0, Math.PI * 2); ctx.stroke(); }
      // signals travelling inward
      for (const p of parts) {
        const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r;
        const tx = cx + Math.cos(p.a) * (p.r + p.tl), ty = cy + Math.sin(p.a) * (p.r + p.tl);
        const near = 1 - Math.min(1, p.r / maxR);          // brighter closer to core
        const grad = ctx.createLinearGradient(tx, ty, x, y);
        grad.addColorStop(0, "rgba(163,230,53,0)");
        grad.addColorStop(1, `rgba(163,230,53,${0.10 + near * 0.55})`);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = `rgba(197,247,120,${0.25 + near * 0.6})`;
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
        p.r -= p.sp;
        if (p.r < 26) Object.assign(p, spawn());
      }
      drawCore(t);
      raf = requestAnimationFrame(frame);
    };

    let raf = 0;
    if (reduce) { drawCore(0); } else { raf = requestAnimationFrame(frame); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    // small delay for feedback; validate against demo credentials
    setTimeout(() => {
      if (email.trim().toLowerCase() === DEMO.email && password === DEMO.password) {
        // sessionStorage (not localStorage): the session ends when the tab is
        // closed, so reopening requires signing in again.
        sessionStorage.setItem("gai.auth", email.trim().toLowerCase());
        nav("/onboard");
      } else {
        setError("Incorrect email or password.");
        setBusy(false);
      }
    }, 450);
  }

  return (
    <div className="login-wrap">
      <canvas ref={canvasRef} className="login-canvas" aria-hidden="true" />
      <div className="login-veil" />

      <form className="login-card" onSubmit={submit}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className="login-brandmark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3e635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 L4 14 h7 l-1 8 L20 10 h-7 z" />
            </svg>
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Gulf Ad Intelligence</div>
            <div className="label-mono" style={{ color: "var(--text-2)", fontSize: 10.5 }}>Competitor ad intelligence · GCC</div>
          </div>
        </div>

        <h1 className="display-md" style={{ fontSize: 26, marginTop: 22 }}>Sign in</h1>
        <p className="body-2" style={{ fontSize: 13.5, marginTop: 6 }}>
          Access the dashboard to gather and analyse competitors' ads.
        </p>

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <label>
            <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 7 }}>Email</div>
            <input className="login-input" type="email" autoComplete="username" value={email}
              placeholder="you@company.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <div className="label-mono" style={{ color: "var(--text-2)", marginBottom: 7 }}>Password</div>
            <div style={{ position: "relative" }}>
              <input className="login-input" type={show ? "text" : "password"} autoComplete="current-password"
                value={password} placeholder="••••••••" style={{ paddingRight: 62 }}
                onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow((s) => !s)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", color: "var(--text-2)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                {show ? "HIDE" : "SHOW"}
              </button>
            </div>
          </label>
        </div>

        {error && <p style={{ color: "#e66767", fontSize: 12.5, marginTop: 12 }}>{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 20, opacity: busy ? 0.7 : 1 }}>
          {busy ? "Signing in…" : "Sign in →"}
        </button>

        <p className="body-2" style={{ fontSize: 11.5, marginTop: 16, textAlign: "center", opacity: 0.7 }}>
          Authorised access only · sessions end when you close the tab
        </p>
      </form>
    </div>
  );
}
