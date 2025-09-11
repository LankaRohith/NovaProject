// frontend/src/pages/Home.jsx
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="hp">
      {/* HERO */}
      <section className="hp-hero">
        <div className="hp-hero__copy">
          <span className="hp-chip">NOVA</span>
          <h1 className="hp-title">
            Real-time conversations,
            <br /> powered by AI.
          </h1>
          <p className="hp-sub">
            Spin up a cloud room or start a direct peer-to-peer call.
            Lightweight, fast, and designed for modern devices.
          </p>

          <div className="hp-actions">
            <Link to="/live-cloud" className="btn btn--primary">Start in Cloud</Link>
            <Link to="/live" className="btn btn--outline">Start P2P</Link>
            <Link to="/dashboard" className="btn btn--ghost">Go to Dashboard</Link>
          </div>
        </div>

        <div className="hp-hero__card">
          <div className="hp-hero__cardHeader">
            <div className="hp-dots"><i/><i/><i/></div>
            <span>Preview</span>
          </div>
          <div className="hp-hero__preview">
            <div className="hp-preview__tile"></div>
            <div className="hp-preview__tile"></div>
            <div className="hp-preview__tile"></div>
            <div className="hp-preview__tile"></div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="hp-grid">
        <article className="hp-card">
          <div className="hp-card__icon">☁️</div>
          <h3 className="hp-card__title">Live (Cloud)</h3>
          <p className="hp-card__text">
            The easiest way to connect. Room is created for you, works across networks.
          </p>
          <Link to="/live-cloud" className="hp-card__link">Create & Join →</Link>
        </article>

        <article className="hp-card">
          <div className="hp-card__icon">🔗</div>
          <h3 className="hp-card__title">Live (P2P)</h3>
          <p className="hp-card__text">
            Direct device-to-device with TURN fallback. Low latency when local.
          </p>
          <Link to="/live" className="hp-card__link">Open P2P →</Link>
        </article>

        <article className="hp-card">
          <div className="hp-card__icon">📊</div>
          <h3 className="hp-card__title">Dashboard</h3>
          <p className="hp-card__text">
            Manage sessions and profile. Built with a clean, responsive UI.
          </p>
          <Link to="/dashboard" className="hp-card__link">Go to Dashboard →</Link>
        </article>
      </section>

      <footer className="hp-foot">
        © {new Date().getFullYear()} Nova — crafted for real-time AI conversations.
      </footer>
    </main>
  );
}
