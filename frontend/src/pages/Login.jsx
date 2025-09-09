import { useState } from "react";
import api, { setAuthToken } from "../utils/api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [tab, setTab] = useState("login"); // 'login' | 'register'
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (tab === "register") {
        await api.post("/api/auth/register", {
          email: form.email, password: form.password, name: form.name
        });
        setMsg("Registered! You can now log in.");
        setTab("login");
        return;
      }

      const { data } = await api.post("/api/auth/login", {
        email: form.email, password: form.password
      });
      setAuthToken(data.access_token);
      navigate("/dashboard");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Something went wrong");
    }
  }

  return (
    <div className="container py-16 max-w-md">
      <div className="flex gap-6 mb-6">
        <button className={`btn ${tab==='login'?'bg-black text-white':''}`} onClick={() => setTab("login")}>Login</button>
        <button className={`btn ${tab==='register'?'bg-black text-white':''}`} onClick={() => setTab("register")}>Register</button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {tab === "register" && (
          <input className="w-full border rounded p-3" name="name" placeholder="Name" onChange={handleChange} />
        )}
        <input className="w-full border rounded p-3" name="email" type="email" placeholder="Email" onChange={handleChange} required/>
        <input className="w-full border rounded p-3" name="password" type="password" placeholder="Password" onChange={handleChange} required/>
        <button className="btn w-full" type="submit">{tab === "login" ? "Login" : "Create Account"}</button>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </form>
    </div>
  );
}
