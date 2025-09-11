// frontend/src/components/NavBar.jsx
import { NavLink, useNavigate } from "react-router-dom";

export default function NavBar() {
  const navigate = useNavigate();
  const cls = ({ isActive }) => "nav__link" + (isActive ? " is-active" : "");

  return (
    <header className="site-header">
      <div className="site-header__inner">
        {/* Brand sends users to Live (Cloud) */}
        <button className="brand" onClick={() => navigate("/live-cloud")}>
          NOVA
        </button>

        <nav className="nav">
          <NavLink to="/live-cloud" className={cls}>Live (Cloud)</NavLink>
          <NavLink to="/live" className={cls}>Live</NavLink>
          <NavLink to="/dashboard" className={cls}>Dashboard</NavLink>
        </nav>

        <div className="nav__end">
          <NavLink to="/login" className="btn btn--ghost">Logout</NavLink>
        </div>
      </div>
    </header>
  );
}
