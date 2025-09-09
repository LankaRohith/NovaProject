import { useEffect, useState } from "react";
import api from "../utils/api";

export default function Dashboard() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/api/auth/me");
      setMe(data);
    })();
  }, []);

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      {!me ? (
        <p className="mt-4 text-gray-600">Loading…</p>
      ) : (
        <div className="mt-6 border rounded p-6">
          <p className="text-lg">Welcome, <b>{me.name || me.email}</b></p>
          <p className="text-gray-600 mt-2">You’re logged in as {me.email}.</p>
        </div>
      )}
    </div>
  );
}
