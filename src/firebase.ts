import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

/** Production defaults to required. Set VITE_REQUIRE_TOTP=false only for the local emulator. */
export const requireTotp = import.meta.env.VITE_REQUIRE_TOTP !== "false";

const app = initializeApp(
  firebaseConfigured
    ? config
    : {
        apiKey: "missing",
        authDomain: "missing.firebaseapp.com",
        projectId: "missing",
        storageBucket: "missing.appspot.com",
        messagingSenderId: "0",
        appId: "missing",
      },
);

export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulators) {
  const flag = "__tjbEmulatorsConnected";
  const globalScope = globalThis as typeof globalThis & { [flag]?: boolean };
  if (!globalScope[flag]) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    globalScope[flag] = true;
  }
}
