import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui";

export function NoAccessPage() {
  const { state, signOutUser } = useAuth();
  const inactive = state.status === "no-access" && state.reason === "inactive";
  return (
    <div className="center-screen">
      <div className="auth-card stack">
        <h1>{inactive ? "Account off" : "No access"}</h1>
        <p className="lede">
          {inactive
            ? "An admin turned this account off."
            : "Ask an admin to add your user id before you can view locations."}
        </p>
        <Button type="button" variant="secondary" onClick={() => void signOutUser()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
