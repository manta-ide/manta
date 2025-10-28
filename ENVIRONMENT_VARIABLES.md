# Environment Variables Configuration

## Clerk Authentication (NEW)

To enable Clerk authentication with Supabase integration, set the following environment variables:

### Required Clerk Variables

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key_here

# Clerk URLs (optional - Clerk will provide defaults)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

### Required Supabase Variables

```bash
# Supabase Configuration (following Clerk documentation)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=your_publishable_key_here
```

**Note**: Following Clerk's Supabase integration documentation, use `NEXT_PUBLIC_SUPABASE_KEY` for the publishable key from Supabase. This matches the variable naming in Clerk's official examples.

### Clerk Webhook Configuration

**Environment Variables:**
```bash
# Clerk Webhook Secret (for webhook verification)
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**Webhook Endpoint:** Supabase Edge Function `clerk-webhooks`

**Supported Events:**
- `user.created` - Syncs user to `clerk_users` table
- `user.updated` - Updates user in `clerk_users` table
- `user.deleted` - Removes user from `clerk_users` table

**Deploy the Edge Function:**
```bash
# Link your project (if not already linked)
npx supabase link --project-ref jrwakwgkztccxfvfixyi

# Deploy the function
npx supabase functions deploy clerk-webhooks
```

✅ **Status**: Edge Function deployed successfully at `https://jrwakwgkztccxfvfixyi.supabase.co/functions/v1/clerk-webhooks`

**Setup in Supabase Dashboard:**
1. Go to **Edge Functions** → **clerk-webhooks**
2. Copy the function URL (e.g., `https://your-project.supabase.co/functions/v1/clerk-webhooks`)
3. **Important**: Disable **Enforce JWT verification** in function settings

**Add Secrets to Supabase:**
```bash
# Set the webhook signing secret
npx supabase secrets set CLERK_WEBHOOK_SECRET=your_actual_signing_secret_from_clerk
```

**Setup in Clerk Dashboard:**
1. Go to **Webhooks** → **Add Endpoint**
2. Use the Supabase Edge Function URL as the endpoint
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret** from the webhook configuration
5. Update the Supabase secret with the actual signing secret value

**Function Access:**
The function automatically has access to:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLERK_WEBHOOK_SECRET` (that you set above)

**Verify Integration:**
1. Go to Supabase Dashboard → Authentication → Third-party auth
2. Ensure Clerk is configured as a provider
3. Test the webhook from Clerk dashboard to ensure data syncs to `clerk_users` table

**Benefits of Edge Functions:**
- ✅ **Better Performance**: Runs closer to database
- ✅ **Service Role Access**: Secure admin operations
- ✅ **Scalable**: Built for high-volume webhooks
- ✅ **Isolated**: Separate from main application
- ✅ **Secure Verification**: Uses Clerk's official webhook verification

**Technical Details:**
- Uses `verifyWebhook` from `@clerk/backend/webhooks` for signature verification
- Processes `user.created`, `user.updated`, `user.deleted` events
- Syncs data to `users` table with service role permissions
- Runs in Supabase Edge Runtime (Deno-compatible)

**Database Schema:**
- **users** table: `id`, `first_name`, `last_name`, `avatar_url`, `created_at`, `updated_at`
- RLS enabled with policies for user access and service role management
- Foreign key relationships with `api_keys` and `user_projects` tables

## Setup Instructions

1. **Create a Clerk application** at [dashboard.clerk.com](https://dashboard.clerk.com)
2. **Configure Supabase integration** in Clerk Dashboard → Setup → Supabase
3. **Create a `.env.local` file** in the project root
4. **Add the Clerk and Supabase variables** with your actual values
5. ✅ **RLS policies set up** - Row Level Security has been configured for all tables

## Clerk + Supabase Integration

✅ **COMPLETED**: Using official Clerk + Supabase integration as documented at:
- [Clerk Supabase Integration](https://clerk.com/docs/guides/integrations/databases/supabase)
- [Supabase Clerk Integration](https://supabase.com/docs/guides/auth/third-party/clerk)

**Integration Features:**
- Clerk session tokens automatically include `role: "authenticated"` claim
- Supabase handles user authentication without manual user creation
- RLS policies use `auth.jwt()->>'sub'` to identify users
- Seamless integration between Clerk and Supabase Auth

### Public and Private Projects

✅ **COMPLETED**: Projects now support public and private visibility settings.

**Database Schema:**
- Projects table includes `is_public` boolean field (defaults to `true`)
- All existing projects have been set to public
- Index on `is_public` for efficient filtering

**Access Control:**
- **Public Projects**: Anyone can view public projects and their nodes/edges
- **Private Projects**: Only users with explicit access can view private projects
- **Modifications**: Only project members can modify nodes/edges
- **Project Settings**: Only project owners can update project settings (including visibility)

**API Endpoints:**
- `GET /api/projects` - Returns all projects the user has access to (includes `is_public` field)
- `POST /api/projects` - Create a new project with optional `is_public` field (defaults to `true`)
- `PATCH /api/projects` - Update project settings including `is_public` (owner only)

## Row Level Security (RLS)

✅ **COMPLETED**: All RLS policies have been successfully applied to your Supabase database.

**User Management:**
- Uses Supabase's internal `auth.users` table (managed by Supabase Auth)
- `clerk_users` table tracks user data from Clerk webhooks (RLS disabled for webhook access)
- Clerk integration should manage users in `auth.users` through third-party auth
- Clerk webhooks sync user data to `clerk_users` table for reliability
- RLS policies use `auth.jwt()->>'sub'` to identify users
- Follows [Supabase user management best practices](https://supabase.com/docs/guides/auth/managing-user-data)

### API Keys Management

✅ **COMPLETED**: API keys functionality has been fully implemented.

**Database Schema:**
```sql
CREATE TABLE api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL, -- References Clerk user ID (managed by auth.users)
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone
);
```

**RLS Policies Applied:**
- SELECT: Users can view their own API keys
- INSERT: Users can create their own API keys
- UPDATE: Users can update their own API keys
- DELETE: Users can delete their own API keys

**Security Features:**
- API keys are hashed using SHA-256 before storage
- Only the hash is stored in the database
- Actual API keys are never retrievable after creation
- Keys are generated with secure random bytes
- All operations are protected by RLS policies
- Users are automatically managed through Clerk + Supabase integration

The following SQL commands were executed to set up Row Level Security:

```sql
-- Enable RLS and create policies for existing tables
-- Note: Replace with actual Clerk user IDs when testing

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for users table (users can only see their own record)
CREATE POLICY "Users can view their own record" ON users
FOR SELECT USING (auth.jwt()->>'sub' = id);

CREATE POLICY "Users can update their own record" ON users
FOR UPDATE USING (auth.jwt()->>'sub' = id);

-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy for projects table (users can see projects they have access to)
CREATE POLICY "Users can view projects they have access to" ON projects
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = projects.id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

CREATE POLICY "Users can insert their own projects" ON projects
FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update projects they have access to" ON projects
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = projects.id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

-- Enable RLS on user_projects table
ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;

-- Policy for user_projects table
CREATE POLICY "Users can view their project memberships" ON user_projects
FOR SELECT USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can create project memberships for themselves" ON user_projects
FOR INSERT WITH CHECK (user_id = auth.jwt()->>'sub');

-- Enable RLS on nodes table
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

-- Policy for nodes table
CREATE POLICY "Users can view nodes in projects they have access to" ON nodes
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = nodes.project_id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

CREATE POLICY "Users can insert nodes in projects they have access to" ON nodes
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = nodes.project_id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

CREATE POLICY "Users can update nodes in projects they have access to" ON nodes
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = nodes.project_id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

-- Enable RLS on edges table
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;

-- Policy for edges table
CREATE POLICY "Users can view edges in projects they have access to" ON edges
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = edges.project_id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

CREATE POLICY "Users can insert edges in projects they have access to" ON edges
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = edges.project_id
    AND up.user_id = auth.jwt()->>'sub'
  )
);

CREATE POLICY "Users can update edges in projects they have access to" ON edges
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_projects up
    WHERE up.project_id = edges.project_id
    AND up.user_id = auth.jwt()->>'sub'
  )
);
```

## MCP Authentication

MCP authentication uses API keys generated through the UI at `/api-keys`. Include your API key in the request using the `MANTA_API_KEY` header:

```json
{
  "mcpServers": {
    "manta-graph-reader": {
      "url": "https://your-manta-instance.com/api/mcp",
      "headers": {
        "MANTA_API_KEY": "manta_your-generated-api-key"
      }
    }
  }
}
```

### Claude Code Integration

For Claude Code to connect to the MCP server, you need to set the `MANTA_API_KEY` environment variable:

```bash
# API key for Claude Code to connect to MCP server
MANTA_API_KEY=manta_your-generated-api-key
```

**Setup Steps:**
1. Generate an API key through the UI at `/api-keys`
2. Add the `MANTA_API_KEY` variable to your `.env.local` file
3. Claude Code will automatically use this key to authenticate with the MCP server at `/api/mcp`

### Legacy Environment Variables (Deprecated)

The following legacy environment variables are no longer used:

### OAUTH_AUTHORIZATION_SERVER_URL
The URL of your OAuth authorization server that issues valid tokens.
```
OAUTH_AUTHORIZATION_SERVER_URL=https://your-oauth-server.com
```

## Usage

1. Create a `.env.local` file in the project root
2. Add the above variables with your actual values
3. The MCP server will use these for token verification

## Production Setup

For production deployments, you should:
1. Use proper OAuth/OIDC providers (Clerk, Auth0, Keycloak, etc.)
2. Implement JWT token validation instead of simple token comparison
3. Set up proper token expiration and refresh logic
4. Configure appropriate scopes for your MCP tools

## Current Implementation

The current implementation uses a simple token comparison for demonstration. Replace the `verifyToken` function in `src/app/api/mcp/route.ts` with proper JWT/OAuth validation for production use.
