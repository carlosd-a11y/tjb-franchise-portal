import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FirebaseError } from "firebase/app";
import {
  getMultiFactorResolver,
  multiFactor,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, firebaseConfigured, requireTotp } from "../firebase";
import type { UserProfile } from "../types";

export type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "mfa-challenge"; resolver: MultiFactorResolver }
  | { status: "needs-mfa" }
  | { status: "no-access"; reason: "missing" | "inactive" }
  | { status: "ready"; profile: UserProfile };

type AuthContextValue = {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  completeChallenge: (code: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  noteMfaEnrolled: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveState(input: {
  firebaseConfigured: boolean;
  user: User | null | undefined;
  profile: UserProfile | null | undefined;
  resolver: MultiFactorResolver | null;
  totpOn: boolean;
  requireTotp: boolean;
}): AuthState {
  if (!input.firebaseConfigured) return { status: "unconfigured" };
  if (input.user === undefined || (input.user && input.profile === undefined)) return { status: "loading" };
  if (input.resolver) return { status: "mfa-challenge", resolver: input.resolver };
  if (!input.user) return { status: "signed-out" };
  if (!input.profile || !input.profile.active) {
    return { status: "no-access", reason: input.profile ? "inactive" : "missing" };
  }
  if (input.profile.role !== "admin" && input.profile.role !== "franchisee") {
    return { status: "no-access", reason: "inactive" };
  }
  if (input.requireTotp && !input.totpOn) return { status: "needs-mfa" };
  return { status: "ready", profile: input.profile };
}

function hasTotp(user: User | null): boolean {
  if (!user) return false;
  return multiFactor(user).enrolledFactors.some(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
}

export function authMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/wrong-password" ||
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-email"
    ) {
      return "Email or password is incorrect.";
    }
    if (error.code === "auth/too-many-requests") return "Too many attempts. Wait and try again.";
    if (error.code === "auth/user-disabled") return "This account is disabled.";
    if (error.code === "auth/invalid-verification-code" || error.code === "code-expired") {
      return "That code is wrong.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not sign in.";
}

export function mfaSetupMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/unverified-email") {
      return "Verify this email first. Invited users should be marked verified when created.";
    }
    if (
      error.code === "auth/operation-not-allowed" ||
      error.code === "auth/invalid-argument" ||
      error.message.includes("phoneEnrollmentInfo") ||
      error.message.toLowerCase().includes("totp")
    ) {
      return "TOTP isn't available here. Enable Identity Platform and the TOTP factor on the Firebase project. The local Auth emulator cannot issue authenticator secrets, so local demo uses VITE_REQUIRE_TOTP=false.";
    }
  }
  return authMessage(error);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [totpVersion, setTotpVersion] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (!next) {
        setProfile(undefined);
        setResolver(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          return;
        }
        const data = snap.data() as UserProfile;
        setProfile({ ...data, uid: user.uid });
      },
      () => setProfile(null),
    );
  }, [user]);

  const totpOn = useMemo(() => hasTotp(user ?? null), [user, totpVersion]);
  const state = deriveState({ firebaseConfigured, user, profile, resolver, totpOn, requireTotp });

  async function signIn(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      if (error instanceof FirebaseError && error.code === "auth/multi-factor-auth-required") {
        setResolver(getMultiFactorResolver(auth, error as MultiFactorError));
        return;
      }
      throw error;
    }
  }

  async function completeChallenge(code: string) {
    if (!resolver) throw new Error("Start sign-in again.");
    const hint = resolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw new Error("This account has no authenticator factor.");
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
    await resolver.resolveSignIn(assertion);
    setResolver(null);
  }

  async function signOutUser() {
    setResolver(null);
    await signOut(auth);
  }

  const value = useMemo(
    () => ({
      state,
      signIn,
      completeChallenge,
      signOutUser,
      noteMfaEnrolled: () => setTotpVersion((version) => version + 1),
    }),
    [state, resolver],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
