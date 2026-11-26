export const isDemo = import.meta.env.VITE_DEMO === "true";

export const useEmulators = !isDemo && import.meta.env.VITE_USE_EMULATORS === "true";

/** Production defaults to required. The demo build never asks for TOTP. */
export const requireTotp = !isDemo && import.meta.env.VITE_REQUIRE_TOTP !== "false";

export const firebaseConfigured =
  !isDemo &&
  Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
