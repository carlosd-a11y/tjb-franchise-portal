import { createContext, useContext } from "react";
import type { MultiFactorResolver } from "firebase/auth";
import type { UserProfile } from "../types";

export type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "mfa-challenge"; resolver: MultiFactorResolver }
  | { status: "needs-mfa" }
  | { status: "no-access"; reason: "missing" | "inactive" }
  | { status: "ready"; profile: UserProfile };

export type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  completeChallenge: (code: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  noteMfaEnrolled: () => void;
  demo?: {
    role: "admin" | "franchisee";
    setRole: (role: "admin" | "franchisee") => void;
    reset: () => void;
  };
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
