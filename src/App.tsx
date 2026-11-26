import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { Layout } from "./components/Layout";
import { AddLocationPage } from "./pages/AddLocationPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { ImportPage } from "./pages/ImportPage";
import { LocationDetailPage } from "./pages/LocationDetailPage";
import { LocationsPage } from "./pages/LocationsPage";
import { LoginPage } from "./pages/LoginPage";
import { MfaPage } from "./pages/MfaPage";
import { NoAccessPage } from "./pages/NoAccessPage";
import { RejectionsPage } from "./pages/RejectionsPage";

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

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route element={<Gate />}>
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/locations/new" element={<AddLocationPage />} />
        <Route path="/locations/:id" element={<LocationDetailPage />} />
        <Route path="/rejections" element={<RejectionsPage />} />
        <Route path="/admin/users" element={<AdminGate />} />
        <Route path="/admin/import" element={<ImportRoute />} />
        <Route path="*" element={<Navigate to="/locations" replace />} />
      </Route>
    </Routes>
  );
}

function ImportRoute() {
  const { state } = useAuth();
  if (state.status !== "ready" || state.profile.role !== "admin") {
    return <Navigate to="/locations" replace />;
  }
  return <ImportPage />;
}
