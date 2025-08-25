# Better Auth Setup Guide

This guide will help you set up authentication in your Manta Editor project using Better Auth.

## Prerequisites

1. **PostgreSQL Database**: You need a PostgreSQL database running locally or remotely
2. **Node.js**: Make sure you have Node.js installed

## Setup Steps

### 1. Environment Variables

Create a `.env.local` file in your project root with the following variables:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/mantaeditor"

# Better Auth Configuration
BETTER_AUTH_SECRET="your-secret-key-here-change-in-production"
BETTER_AUTH_URL="BACKEND_URL"

# Optional: Email configuration for email verification
# SMTP_HOST="smtp.gmail.com"
# SMTP_PORT="587"
# SMTP_USER="your-email@gmail.com"
# SMTP_PASS="your-app-password"
```

### 2. Database Setup

Run the database setup script to create all necessary tables:

```bash
npm run setup-db
```

### 3. Start the Development Server

```bash
npm run dev
```

## Features Implemented

### Authentication Features
- ✅ Email and password authentication
- ✅ User registration and login
- ✅ Session management
- ✅ Protected routes
- ✅ User profile with avatar support
- ✅ Sign out functionality

### UI Components
- ✅ Sign in form
- ✅ Sign up form
- ✅ Protected route wrapper
- ✅ User dropdown menu
- ✅ Loading states
- ✅ Error handling with toast notifications

### Security Features
- ✅ Password hashing (handled by Better Auth)
- ✅ Session-based authentication
- ✅ CSRF protection
- ✅ Secure cookie handling

## File Structure

```
src/
├── app/
│   ├── api/auth/[...better-auth]/route.ts  # Auth API routes
│   ├── dashboard/page.tsx                  # Protected dashboard
│   ├── signin/page.tsx                     # Sign in page
│   ├── signup/page.tsx                     # Sign up page
│   └── page.tsx                           # Redirect logic
├── components/
│   └── auth/
│       ├── SignInForm.tsx                 # Sign in form component
│       ├── SignUpForm.tsx                 # Sign up form component
│       └── ProtectedRoute.tsx             # Route protection
└── lib/
    ├── auth.ts                           # Better Auth configuration
    └── auth-context.tsx                  # React context for auth state
```

## Usage

### Protecting Routes

Wrap any component that requires authentication with the `ProtectedRoute` component:

```tsx
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function MyProtectedPage() {
  return (
    <ProtectedRoute>
      <div>This content is only visible to authenticated users</div>
    </ProtectedRoute>
  );
}
```

### Using Authentication State

Use the `useAuth` hook to access user information and authentication functions:

```tsx
import { useAuth } from '@/lib/auth-context';

export default function MyComponent() {
  const { user, session, loading, signOut } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Please sign in</div>;

  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

## Customization

### Adding Social Login

To add social login providers (Google, GitHub, etc.), modify the auth configuration in `src/lib/auth.ts`:

```tsx
export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  // ... other config
});
```

### Adding Two-Factor Authentication

Two-factor authentication is already enabled in the configuration. Users can enable it from their profile settings.

### Custom User Fields

To add custom user fields, modify the user configuration in `src/lib/auth.ts`:

```tsx
user: {
  additionalFields: {
    name: { type: "string" },
    avatar: { type: "string" },
    bio: { type: "string" },
    // Add more fields as needed
  },
},
```

## Troubleshooting

### Database Connection Issues

1. Make sure PostgreSQL is running
2. Verify your `DATABASE_URL` is correct
3. Ensure the database exists
4. Check that the user has proper permissions

### Authentication Issues

1. Verify `BETTER_AUTH_SECRET` is set
2. Check that `BETTER_AUTH_URL` matches your development URL
3. Ensure all environment variables are loaded correctly

### Build Issues

1. Make sure all dependencies are installed: `npm install`
2. Check TypeScript compilation: `npm run lint`
3. Verify all imports are correct

## Production Deployment

For production deployment:

1. Set `requireEmailVerification: true` in the auth configuration
2. Use a strong, unique `BETTER_AUTH_SECRET`
3. Configure proper email settings for verification
4. Set up HTTPS
5. Use a production database
6. Configure proper CORS settings if needed

## Support

For more information about Better Auth, visit:
- [Better Auth Documentation](https://www.better-auth.com/)
- [Better Auth GitHub](https://github.com/better-auth/better-auth) 