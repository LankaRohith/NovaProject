import { NavLink, useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <header className="nav">
      <div className="container nav-inner">
        <div className="brand" style={{fontSize: 22}}>NOVA</div>

        <nav className="nav-links">
          <NavLink className="nav-link" to="/">Home</NavLink>
          <NavLink className="nav-link" to="/live-cloud">Live (Cloud)</NavLink>
          <NavLink className="nav-link" to="/live">Live</NavLink>
          <NavLink className="nav-link" to="/dashboard">Dashboard</NavLink>
        </nav>

        <div className="nav-links">
          {token ? (
            <button className="btn ghost" onClick={logout}>Logout</button>
          ) : (
            <NavLink className="btn secondary" to="/login">Login</NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
