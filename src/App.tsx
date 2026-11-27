import { useEffect, useState, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { DemoBar } from "./components/DemoBar";
import { Layout } from "./components/Layout";
import { isDemo } from "./env";
import { AddLocationPage } from "./pages/AddLocationPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { ImportPage } from "./pages/ImportPage";
import { LocationDetailPage } from "./pages/LocationDetailPage";
import { LocationsPage } from "./pages/LocationsPage";
import { NoAccessPage } from "./pages/NoAccessPage";
import { RejectionsPage } from "./pages/RejectionsPage";
import { ScoutsPage } from "./pages/ScoutsPage";

function Gate() {
  const { state } = useAuth();
  if (state.status === "loading") {
    return (
      <div className="center-screen">
        <p>Loading</p>
      </div>
    );
  }
  if (state.status === "unconfigured") {
    return (
      <div className="center-screen">
        <div className="auth-card stack">
          <h1>Setup needed</h1>
          <p className="lede">Add Firebase web config to .env.production, then rebuild.</p>
        </div>
      </div>
    );
  }
  if (state.status === "signed-out" || state.status === "mfa-challenge") {
    return <Navigate to="/login" replace />;
  }
  if (state.status === "needs-mfa") return <Navigate to="/mfa" replace />;
  if (state.status === "no-access") return <NoAccessPage />;
  return <Layout />;
}

function AdminGate() {
  const { state } = useAuth();
  if (state.status !== "ready" || state.profile.role !== "admin") {
    return <Navigate to="/locations" replace />;
  }
  return <AdminUsersPage />;
}

function ScoutsRoute() {
  const { state } = useAuth();
  if (state.status !== "ready" || state.profile.role !== "admin") {
    return <Navigate to="/locations" replace />;
  }
  return <ScoutsPage />;
}

function ImportRoute() {
  const { state } = useAuth();
  if (state.status !== "ready" || state.profile.role !== "admin") {
    return <Navigate to="/locations" replace />;
  }
  return <ImportPage />;
}

function LiveLogin() {
  const [Page, setPage] = useState<ComponentType | null>(null);
  useEffect(() => {
    void import("./pages/LoginPage").then((mod) => setPage(() => mod.LoginPage));
  }, []);
  if (!Page) {
    return (
      <div className="center-screen">
        <p>Loading</p>
      </div>
    );
  }
  return <Page />;
}

function LiveMfa() {
  const [Page, setPage] = useState<ComponentType | null>(null);
  useEffect(() => {
    void import("./pages/MfaPage").then((mod) => setPage(() => mod.MfaPage));
  }, []);
  if (!Page) {
    return (
      <div className="center-screen">
        <p>Loading</p>
      </div>
    );
  }
  return <Page />;
}

export function App() {
  return (
    <>
      {isDemo ? <DemoBar /> : null}
      <Routes>
        {isDemo ? null : (
          <>
            <Route path="/login" element={<LiveLogin />} />
            <Route path="/mfa" element={<LiveMfa />} />
          </>
        )}
        <Route element={<Gate />}>
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/locations/new" element={<AddLocationPage />} />
          <Route path="/locations/:id" element={<LocationDetailPage />} />
          <Route path="/rejections" element={<RejectionsPage />} />
          <Route path="/admin/users" element={<AdminGate />} />
          <Route path="/admin/scouts" element={<ScoutsRoute />} />
          <Route path="/admin/import" element={<ImportRoute />} />
          <Route path="*" element={<Navigate to="/locations" replace />} />
        </Route>
      </Routes>
    </>
  );
}
