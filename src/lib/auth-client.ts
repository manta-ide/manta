'use client';

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : `${process.env.BACKEND_URL}`,
  // Ensure credentials are included for persistent sessions
  fetchOptions: {
    credentials: "include",
  },
});

// Export the auth client types for TypeScript
export type AuthClient = typeof authClient;
