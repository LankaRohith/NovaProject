// frontend/src/pages/Home.jsx
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="hp">
      {/* The container centers content and matches Dashboard spacing */}
      <div className="container hp__wrap">
        {/* HERO */}
        <section className="hp__hero">
          <h1 className="hp__title">
            Real-time conversations,<br /> powered by AI.
          </h1>
          <p className="hp__sub">
            Start a cloud room or a direct P2P call. Lightweight, fast, and built for modern devices.
          </p>

          <div className="hp__actions">
            <Link to="/live-cloud" className="btn btn--primary">Start in Cloud</Link>
            <Link to="/live" className="btn">Start P2P</Link>
            <Link to="/dashboard" className="btn btn--ghost">Dashboard</Link>
          </div>
        </section>

        {/* FEATURES */}
        <section className="hp__grid">
          <article className="hp-card">
            <div className="hp-card__icon">☁️</div>
            <h3 className="hp-card__title">Live (Cloud)</h3>
            <p className="hp-card__text">
              One-click room creation that works across networks.
            </p>
            <Link to="/live-cloud" className="hp-card__link">Create & Join →</Link>
          </article>

          <article className="hp-card">
            <div className="hp-card__icon">🔗</div>
            <h3 className="hp-card__title">Live (P2P)</h3>
            <p className="hp-card__text">
              Direct device-to-device with TURN fallback. Low latency.
            </p>
            <Link to="/live" className="hp-card__link">Open P2P →</Link>
          </article>

          <article className="hp-card">
            <div className="hp-card__icon">📊</div>
            <h3 className="hp-card__title">Dashboard</h3>
            <p className="hp-card__text">
              Manage sessions and profile with a clean, responsive UI.
            </p>
            <Link to="/dashboard" className="hp-card__link">Go to Dashboard →</Link>
          </article>
        </section>

        <footer className="hp__foot">
          © {new Date().getFullYear()} Nova — crafted for real-time AI conversations.
        </footer>
      </div>
    </main>
  );
}
