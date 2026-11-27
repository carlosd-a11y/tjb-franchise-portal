export const isDemo = import.meta.env.VITE_DEMO === "true";

export const useEmulators = !isDemo && import.meta.env.VITE_USE_EMULATORS === "true";

/** The server on the VPS instead of Firestore. See docs/adr-001-backend-on-the-vps.md. */
export const useServer = !isDemo && import.meta.env.VITE_BACKEND === "server";

/** Production defaults to required. The demo build never asks for TOTP. */
export const requireTotp = !isDemo && import.meta.env.VITE_REQUIRE_TOTP !== "false";

export const firebaseConfigured =
  !isDemo &&
  Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
