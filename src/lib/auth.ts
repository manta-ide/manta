import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

// Better Auth configuration
export const auth = betterAuth({
  database: new Pool({
    ssl: true,
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  plugins: [
    organization(),
    twoFactor(),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
  cookies: {
    // Ensure secure session cookies
    sessionToken: {
      name: "better-auth.session_token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days in milliseconds
      },
    },
  },
  user: {
    additionalFields: {
      name: { type: "string" },
      avatar: { type: "string", required: false },
      sandboxId: { type: "string", required: false },
      chat_history: { type: "string", required: false },
    },
  },
});

// Export types
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user; 