import { useState } from "react";
import api, { setAuthToken } from "../utils/api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", username: "" });
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
          email: form.email,
          password: form.password,
          username: form.username || form.email.split("@")[0],
        });
        setMsg("✅ Account created. You can log in now.");
        setTab("login");
        return;
      }

      const { data } = await api.post("/api/auth/login", {
        email: form.email,
        password: form.password,
      });
      setAuthToken(data.access_token);
      navigate("/dashboard");
    } catch (err) {
      setMsg(err?.response?.data?.message || err?.response?.data?.error || "Something went wrong");
    }
  }

  return (
    <div className="container" style={{paddingTop: "7vh", paddingBottom: "7vh"}}>
      <div className="card" style={{maxWidth: 560, margin: "0 auto"}}>
        <div className="card-header">Welcome back 👋</div>
        <div className="card-body">
          <div className="tabs">
            <button className={`tab ${tab==="login" ? "active":""}`} onClick={() => setTab("login")}>Login</button>
            <button className={`tab ${tab==="register" ? "active":""}`} onClick={() => setTab("register")}>Register</button>
          </div>

          <form onSubmit={submit} className="mt-4" style={{display:"grid", gap:12}}>
            {tab === "register" && (
              <input name="username" placeholder="Name" onChange={handleChange} />
            )}
            <input name="email" type="email" placeholder="Email" onChange={handleChange} required />
            <input name="password" type="password" placeholder="Password" onChange={handleChange} required />
            <button className="btn" type="submit">{tab==="login" ? "Login" : "Create Account"}</button>
            {msg && <div className="badge" style={{borderColor:"transparent", background:"#2a1f61"}}>{msg}</div>}
          </form>

          <p className="mt-4" style={{color:"var(--muted)", fontSize:14}}>
            By continuing you agree to our <a href="#">Terms</a> and <a href="#">Privacy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
