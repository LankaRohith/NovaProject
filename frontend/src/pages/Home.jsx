import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="ai">
      {/* HERO */}
      <section className="ai-hero">
        <div className="ai-hero__eyebrow">NOVA • Realtime AI</div>
        <h1 className="ai-hero__title">
          Build realtime experiences <span>with NOVA</span>
        </h1>
        <p className="ai-hero__subtitle">
          Video, voice, and signaling you can stand up in minutes.
          Private by default. Built for speed. Ready for production.
        </p>

        <div className="ai-hero__actions">
          <Link className="btn btn--primary" to="/live-cloud">Start a Cloud Room</Link>
          <Link className="btn btn--ghost" to="/live">Try P2P Demo</Link>
        </div>

        <div className="ai-hero__stats">
          <div><strong>50ms</strong><span>Avg TURN Latency</span></div>
          <div><strong>99.95%</strong><span>Uptime</span></div>
          <div><strong>2</strong><span>Lines to Join</span></div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="ai-features">
        <article className="ai-card">
          <div className="ai-card__icon">🎥</div>
          <h3>Realtime Video</h3>
          <p>STUN/TURN baked in, tuned for mobile networks and NATs. Smooth media with graceful fallbacks.</p>
          <Link className="ai-link" to="/live-cloud">Live (Cloud)</Link>
        </article>

        <article className="ai-card">
          <div className="ai-card__icon">⚡</div>
          <h3>Low-latency Signaling</h3>
          <p>Socket.IO signaling with simple room semantics. Join with one emit; scale when you need.</p>
          <Link className="ai-link" to="/live">P2P Demo</Link>
        </article>

        <article className="ai-card">
          <div className="ai-card__icon">🔒</div>
          <h3>Privacy-first Auth</h3>
          <p>JWT sessions backed by SQLite. Minimal surface, no tracking, and easy to swap databases.</p>
          <Link className="ai-link" to="/dashboard">Dashboard</Link>
        </article>
      </section>

      {/* CALLOUT */}
      <section className="ai-cta">
        <h2>Ship in hours, not weeks.</h2>
        <p>Clone the repo, set your env, deploy. NOVA gives you a polished baseline you can extend safely.</p>
        <div className="ai-cta__actions">
          <Link className="btn btn--primary" to="/live-cloud">Create a Room</Link>
          <Link className="btn btn--ghost" to="/dashboard">Open Dashboard</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ai-foot">
        <div>NOVA © {new Date().getFullYear()}</div>
        <nav>
          <Link to="/live-cloud">Live (Cloud)</Link>
          <Link to="/live">Live</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </footer>
    </main>
  );
}
