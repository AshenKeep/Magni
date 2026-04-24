import { useState } from "react";
import { setToken } from "@/lib/api";

interface Props { onComplete: () => void; }

export default function SetupPage({ onComplete }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Setup failed");
      }
      const { access_token } = await res.json();
      setToken(access_token);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-blue tracking-tight">Magni</h1>
          <p className="text-secondary mt-2 text-sm">Create your account to get started</p>
          <span className="mt-3 inline-block text-xs px-3 py-1 rounded-full bg-blue-glow text-blue border border-blue/20">
            First-time setup
          </span>
        </div>
        <form onSubmit={handleSubmit} className="card p-8 space-y-4">
          {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="label">Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="input" placeholder="Your name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input" />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="input" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="text-center text-xs text-secondary/50 mt-4">
          This page is only accessible once.
        </p>
      </div>
    </div>
  );
}
