import { Link, useNavigate } from "react-router-dom";
import { setAuthToken } from "../utils/api";


// import { Link } from "react-router-dom";

// export default function Nav() {
//   return (
//     <nav className="flex gap-4">
//       <Link to="/">Home</Link>
//       <Link to="/dashboard">Dashboard</Link>
//       <Link to="/live">Live</Link>
//       <Link to="/live-cloud">Live (Cloud)</Link> {/* <-- new */}
//       {/* ... */}
//     </nav>
//   );
// }



export default function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  function logout() {
    setAuthToken(null);
    navigate("/login");
  }

  return (
    <header className="border-b">
      <nav className="container flex items-center justify-between py-4">
        <Link to="/" className="text-xl tracking-widest font-semibold">NOVA</Link>
        <div className="flex gap-4">
          <Link to="/" className="hover:underline">Home</Link>
          <Link to="/live-cloud">Live (Cloud)</Link> 
          {token && <Link to="/dashboard" className="hover:underline">Dashboard</Link>}
          {token && <Link to="/live" className="hover:underline">Live</Link>}
          {!token ? (
            <Link to="/login" className="btn">Login</Link>
          ) : (
            <button onClick={logout} className="btn">Logout</button>
          )}
        </div>
      </nav>
    </header>
  );
}
