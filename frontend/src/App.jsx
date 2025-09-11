import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";            // or Header – see next block
import LiveCloud from "./pages/LiveCloud";
import LiveConversation from "./pages/LiveConversation";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        {/* No Home page – land on Live (Cloud) */}
        <Route path="/" element={<Navigate to="/live-cloud" replace />} />
        <Route path="/live-cloud" element={<LiveCloud />} />
        <Route path="/live" element={<LiveConversation />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {/* Catch-all back to Live (Cloud) */}
        <Route path="*" element={<Navigate to="/live-cloud" replace />} />
      </Routes>
    </>
  );
}
