import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';

type LocalSession = { user: { id: string; email?: string } };

const _auth = LOCAL_MODE
  ? ({
      api: {
        async getSession(): Promise<LocalSession> {
          return { user: { id: 'local', email: 'local@example.com' } };
        },
      },
    } as const)
  : betterAuth({
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

export const auth = _auth as any;

// Export types (loose compatibility in local mode)
export type Session = LocalSession;
export type User = Session['user'];
