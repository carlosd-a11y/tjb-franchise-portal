import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { auth, db } from "../firebaseLive";
import { firebaseConfigured, requireTotp } from "../env";
import type { UserProfile } from "../types";
import { AuthContext, type AuthState } from "./authContext";

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

export function LiveAuthProvider({ children }: { children: ReactNode }) {
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
