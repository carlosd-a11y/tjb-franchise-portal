import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_ROLE_KEY, getDemoDb, type DemoStorage } from "../demo/database";
import { AuthContext, type AuthState } from "./authContext";

export type DemoRole = "admin" | "franchisee";

const ROLE_UID: Record<DemoRole, string> = {
  admin: "uid-admin",
  franchisee: "uid-alex",
};

export function readDemoRole(storage: DemoStorage = localStorage): DemoRole {
  return storage.getItem(DEMO_ROLE_KEY) === "admin" ? "admin" : "franchisee";
}

export function writeDemoRole(role: DemoRole, storage: DemoStorage = localStorage) {
  storage.setItem(DEMO_ROLE_KEY, role);
}

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<DemoRole>(() => readDemoRole());
  const [version, setVersion] = useState(0);

  useEffect(() => getDemoDb().subscribe(() => setVersion((value) => value + 1)), []);

  const profile = getDemoDb().userById(ROLE_UID[role]);
  const state: AuthState = !profile
    ? { status: "no-access", reason: "missing" }
    : !profile.active
      ? { status: "no-access", reason: "inactive" }
      : { status: "ready", profile };

  const value = useMemo(
    () => ({
      state,
      signIn: async () => {},
      completeChallenge: async () => {},
      signOutUser: async () => {},
      noteMfaEnrolled: () => {},
      demo: {
        role,
        setRole: (next: DemoRole) => {
          writeDemoRole(next);
          setRoleState(next);
        },
        reset: () => getDemoDb().reset(),
      },
    }),
    [state, role, version],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
