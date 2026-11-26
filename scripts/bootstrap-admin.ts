import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Owner-only bootstrap for the FIRST admin on a real Firebase project.
 * This file is not run by tests or by the local demo. It exits unless every
 * guard below is set. Do not point it at a project you have not created yourself.
 */
const confirm = process.env.BOOTSTRAP_CONFIRM;
const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const email = (process.env.BOOTSTRAP_EMAIL ?? "").trim().toLowerCase();
const name = (process.env.BOOTSTRAP_NAME ?? "").trim();
const password = process.env.BOOTSTRAP_PASSWORD ?? "";

if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing: emulator hosts are set. Use npm run seed for local data.");
  process.exit(1);
}
if (confirm !== "yes") {
  console.error("Refusing: set BOOTSTRAP_CONFIRM=yes only when you intend to create the first admin.");
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing: GOOGLE_APPLICATION_CREDENTIALS must point at a service account JSON file.");
  process.exit(1);
}
if (!projectId || projectId.startsWith("demo-")) {
  console.error("Refusing: set FIREBASE_PROJECT_ID to the real project id.");
  process.exit(1);
}
if (!email.includes("@") || name.length < 2 || password.length < 12) {
  console.error("Refusing: set BOOTSTRAP_EMAIL, BOOTSTRAP_NAME, and a BOOTSTRAP_PASSWORD of at least 12 characters.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const db = getFirestore();

const existing = await db.collection("users").where("role", "==", "admin").where("active", "==", true).limit(1).get();
if (!existing.empty) {
  console.log("An active admin already exists. No changes made.");
  process.exit(0);
}

const user = await auth.createUser({ email, password, displayName: name, emailVerified: true });
await db.collection("users").doc(user.uid).set({
  uid: user.uid,
  email,
  name,
  role: "admin",
  active: true,
});
console.log(`Created admin ${email} uid ${user.uid}. Password was not printed.`);
