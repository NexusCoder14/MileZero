import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";
import { usePageTitle } from "../lib/usePageTitle.js";

export function Login() {
  usePageTitle("Sign In");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [navigate, user]);
  if (user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || "/", { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Sign in to MileZero</h2>
        <p className="sub">Access your logged trips, challenges, and team leaderboards.</p>

        {error && <div className="notice notice-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="button button-primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p style={{ marginTop: "16px", fontSize: "14px" }}>
          Don't have an account? <Link to="/auth/register">Create one</Link>
        </p>
        <p style={{ fontSize: "14px" }}>If you forget your password, ask the administrator of this installation to reset it.</p>
        <p className="auth-legal-links"><Link to="/privacy">Privacy</Link> <Link to="/terms">Terms</Link></p>
      </div>
    </div>
  );
}

export function Register() {
  usePageTitle("Register Account");
  const { register } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await register({ displayName, email, password });
      navigate("/");
    } catch (err: unknown) {
      setError((err as Error).message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Create MileZero Account</h2>
        <p className="sub">The first registered account automatically becomes Administrator.</p>

        {error && <div className="notice notice-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reg-name">Display Name</label>
            <input
              id="reg-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email address</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password (at least 8 characters)</label>
            <input
              id="reg-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="button button-primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Registering..." : "Create Account"}
          </button>
        </form>

        <p style={{ marginTop: "16px", fontSize: "14px" }}>
          Already have an account? <Link to="/auth/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
