import { NavLink, Outlet } from "react-router-dom";
import { isDemo } from "../env";
import { useAuth } from "../auth/AuthProvider";

export function Layout() {
  const { state, signOutUser } = useAuth();
  const profile = state.status === "ready" ? state.profile : null;
  const admin = profile?.role === "admin";

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <NavLink to="/locations" className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Tropical Juice Bar
          </NavLink>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/locations" className={({ isActive }) => `nav-link${isActive ? " on" : ""}`}>
              Locations
            </NavLink>
            <NavLink to="/rejections" className={({ isActive }) => `nav-link${isActive ? " on" : ""}`}>
              Rejected
            </NavLink>
            {admin ? (
              <NavLink to="/admin/users" className={({ isActive }) => `nav-link${isActive ? " on" : ""}`}>
                Users
              </NavLink>
            ) : null}
            {admin ? (
              <NavLink to="/admin/scouts" className={({ isActive }) => `nav-link${isActive ? " on" : ""}`}>
                Scouts
              </NavLink>
            ) : null}
            {admin ? (
              <NavLink to="/admin/import" className={({ isActive }) => `nav-link${isActive ? " on" : ""}`}>
                Import
              </NavLink>
            ) : null}
          </nav>
          <div className="who">
            <span>
              {profile?.name} · {admin ? "Admin" : "Franchisee"}
            </span>
            {isDemo ? null : (
              <button className="text-btn" type="button" onClick={() => void signOutUser()}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
