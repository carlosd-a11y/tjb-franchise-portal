import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { isDemo } from "../env";
import { DemoAuthProvider } from "./DemoAuth";

export { useAuth } from "./authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (isDemo) return <DemoAuthProvider>{children}</DemoAuthProvider>;
  return <LiveGate>{children}</LiveGate>;
}

function LiveGate({ children }: { children: ReactNode }) {
  const [Live, setLive] = useState<ComponentType<{ children: ReactNode }> | null>(null);
  useEffect(() => {
    void import("./LiveAuth").then((mod) => setLive(() => mod.LiveAuthProvider));
  }, []);
  if (!Live) {
    return (
      <div className="center-screen">
        <p>Loading</p>
      </div>
    );
  }
  return <Live>{children}</Live>;
}
