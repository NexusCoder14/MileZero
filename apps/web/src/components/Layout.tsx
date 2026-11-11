import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Wordmark } from "./Logo.js";
import { ThemeSwitch } from "./ThemeSwitch.js";
import { useAuth } from "../lib/AuthContext.js";

export function Layout() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    document.getElementById("main")?.focus();
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container bar">
          <NavLink to="/" className="brand" aria-label="MileZero home">
            <Wordmark />
          </NavLink>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <ThemeSwitch />
            {user && <nav aria-label="Main">
              {user && <NavLink to="/" end>Plan Journey</NavLink>}
              {user && <NavLink to="/impact">My Impact</NavLink>}
              {user && <NavLink to="/groups">Groups</NavLink>}
              <NavLink to="/status">Data status</NavLink>
              {user?.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
              <button type="button" onClick={() => logout()} className="button-link">
                Sign out ({user.displayName})
              </button>
            </nav>}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      {!loading && !user && pathname === "/" ? null : <footer className="site-footer">
        <div className="container foot">
          <div className="footer-links">
            {!user && pathname === "/" ? <><NavLink to="/privacy">Privacy</NavLink><NavLink to="/terms">Terms</NavLink></> : <>
            <NavLink to="/about">About & Calculations</NavLink>
            <NavLink to="/fares-factors">Fares & Factors</NavLink>
            <NavLink to="/privacy">Privacy</NavLink>
            <NavLink to="/terms">Terms</NavLink>
            <NavLink to="/status">Data Status</NavLink>
            </>}
          </div>
          {user && <p>
            <strong>MileZero</strong> &middot; Every journey. A better way. Built for Mumbai first. Map data from OpenStreetMap contributors.
          </p>}
        </div>
      </footer>}
    </>
  );
}
