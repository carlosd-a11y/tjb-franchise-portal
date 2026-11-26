import { FirebaseError } from "firebase/app";

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
