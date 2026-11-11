import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, fetchMe, loginUser, registerUser, logoutUser } from "../lib/api.js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then((res) => {
        if (res?.user) setUser(res.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (data: { email: string; password: string }) => {
    const res = await loginUser(data);
    setUser(res.user);
  };

  const register = async (data: { email: string; password: string; displayName: string }) => {
    const res = await registerUser(data);
    setUser(res.user);
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

