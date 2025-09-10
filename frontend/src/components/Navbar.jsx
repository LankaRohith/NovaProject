import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate?.();

  const close = () => setOpen(false);
  const logout = () => {
    try { localStorage.removeItem("token"); } catch {}
    if (navigate) navigate("/login");
  };

  return (
    <header className={`navbar ${open ? "nav--open" : ""}`}>
      <div className="container nav__inner">
        <Link to="/" className="nav__brand" onClick={close}>
          <span className="nav__logo-dot" />
          <span>NOVA</span>
        </Link>

        <button
          className="nav__toggle"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className="nav__links" onClick={close}>
          <Link to="/">Home</Link>
          <Link to="/live-cloud">Live (Cloud)</Link>
          <Link to="/live">Live</Link>
          <Link to="/dashboard">Dashboard</Link>
          <button className="btn nav__logout" onClick={logout}>Logout</button>
        </nav>
      </div>

      {/* Backdrop for mobile menu */}
      <div className="nav__backdrop" onClick={close} />
    </header>
  );
}
