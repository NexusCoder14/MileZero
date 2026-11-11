import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/AuthContext.js";
import { useAuth } from "./lib/AuthContext.js";
import { Layout } from "./components/Layout.js";
import { Home } from "./pages/Home.js";
import { Status } from "./pages/Status.js";
import { Login, Register } from "./pages/Auth.js";
import { Impact } from "./pages/Impact.js";
import { Groups } from "./pages/Groups.js";
import { GroupDetail } from "./pages/GroupDetail.js";
import { Admin } from "./pages/Admin.js";
import { About, FaresAndFactors, Privacy, Terms } from "./pages/PublicPages.js";
import { NotFound } from "./pages/NotFound.js";
import { RequireAuth } from "./components/RequireAuth.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RootPage() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading" role="status">Checking your sign-in...</div>;
  return user ? <Home /> : <Login />;
}

function Protected({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<RootPage />} />
              <Route path="status" element={<Protected><Status /></Protected>} />
              <Route path="impact" element={<Protected><Impact /></Protected>} />
              <Route path="groups" element={<Protected><Groups /></Protected>} />
              <Route path="groups/:id" element={<Protected><GroupDetail /></Protected>} />
              <Route path="admin" element={<Protected><Admin /></Protected>} />
              <Route path="auth/login" element={<Login />} />
              <Route path="auth/register" element={<Register />} />
              <Route path="about" element={<About />} />
              <Route path="fares-factors" element={<FaresAndFactors />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
