import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import LiveConversation from "./pages/LiveConversation.jsx";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}


// import { Routes, Route } from "react-router-dom";
// import LiveConversation from "./pages/LiveConversation";
import LiveCloud from "./pages/LiveCloud.jsx"; // <-- add



export default function App() {
  return (
    <div className="min-h-screen bg-white text-black">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/live" element={<LiveConversation />} />
        <Route path="/live-cloud" element={<LiveCloud />} /> 
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live"
          element={
            <ProtectedRoute>
              <LiveConversation />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}
