import { betterAuth } from "better-auth";
import postgres from "postgres";
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
  },
  user: {
    additionalFields: {
      name: { type: "string" },
      avatar: { type: "string", required: false },
    },
  },
});

// Export types
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user; 