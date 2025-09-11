// frontend/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/Navbar";
import Home from "./pages/Home";
import LiveCloud from "./pages/LiveCloud";
import LiveConversation from "./pages/LiveConversation";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/live-cloud" element={<LiveCloud />} />
        <Route path="/live" element={<LiveConversation />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
