import { useAuth } from "../auth/AuthProvider";

export function DemoBar() {
  const { demo } = useAuth();
  if (!demo) return null;
  return (
    <div className="demo-banner">
      <strong>Demo, sample data only</strong>
      <div className="demo-switch" role="group" aria-label="Role">
        <button
          type="button"
          className={`chip${demo.role === "franchisee" ? " on" : ""}`}
          onClick={() => demo.setRole("franchisee")}
        >
          Franchisee
        </button>
        <button
          type="button"
          className={`chip${demo.role === "admin" ? " on" : ""}`}
          onClick={() => demo.setRole("admin")}
        >
          Admin
        </button>
      </div>
      <button type="button" className="text-btn" onClick={() => demo.reset()}>
        Reset sample data
      </button>
    </div>
  );
}
