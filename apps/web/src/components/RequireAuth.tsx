import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.js";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="auth-loading" role="status">Checking your sign-in...</div>;
  if (!user) {
    return <Navigate to="/" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}
