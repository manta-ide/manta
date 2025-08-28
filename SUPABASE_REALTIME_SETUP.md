# Supabase Realtime Integration Setup

This guide will help you set up Supabase realtime functionality for the Manta Editor graph system.

## Overview

The system now supports **dual storage** with **Supabase as the priority** and the existing backend API as a fallback:

- ✅ **Supabase Realtime**: Real-time graph synchronization across users
- ✅ **Automatic Fallback**: Falls back to backend API if Supabase is unavailable
- ✅ **Row Level Security**: User-isolated data with proper authentication
- ✅ **Live Updates**: Real-time node, edge, and property changes

## Setup Steps

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for the project to be fully initialized

### 2. Run the Database Schema

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `scripts/setup-supabase-tables.sql`
4. Click **Run** to create all tables, policies, and triggers

### 3. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-here"

# Optional: Service Role Key (for server-side operations)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

**To get these values:**
- Go to Settings → API in your Supabase project
- Copy the Project URL as `NEXT_PUBLIC_SUPABASE_URL`
- Copy the `anon public` key as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Enable Realtime

1. In your Supabase project, go to **Settings → API**
2. Navigate to the **Realtime** section
3. Ensure that the following tables are enabled for realtime:
   - `graph_nodes`
   - `graph_edges` 
   - `graph_properties`

Alternatively, the SQL script should have already added them to the `supabase_realtime` publication.

### 5. Test the Integration

1. Start your development server: `npm run dev`
2. Sign in to the application
3. The system should automatically connect to Supabase Realtime
4. Check the browser console for connection messages:
   - `✅ Connected to Supabase Realtime` - Success
   - `⚠️ Supabase connection failed, falling back to EventSource` - Using fallback

## How It Works

### Priority System

1. **Supabase First**: All graph operations try Supabase first
2. **Automatic Fallback**: If Supabase fails, falls back to backend API
3. **Real-time Updates**: Changes are broadcast in real-time to all connected clients

### Database Schema

```sql
-- Main tables
graph_nodes      -- Stores nodes with positions, state, etc.
graph_edges      -- Stores connections between nodes  
graph_properties -- Stores configurable node properties

-- Features
✅ Row Level Security (RLS) - Users only see their own data
✅ Real-time subscriptions - Live updates via Postgres Changes
✅ Automatic timestamps - created_at, updated_at
✅ Foreign key constraints - Data integrity
✅ Indexed for performance
```

### Real-time Events

The system listens for these Postgres changes:

- **Node Created**: New nodes appear in real-time
- **Node Updated**: State, position, property changes
- **Node Deleted**: Nodes removed from graph
- **Property Updated**: Individual property value changes

## Features

### ✅ Real-time Collaboration
- Multiple users can work on the same graph
- Changes appear instantly across all connected clients
- Conflict resolution through last-write-wins

### ✅ Offline Resilience  
- Automatic fallback to backend API if Supabase is unavailable
- Graceful error handling and user feedback
- Reconnection attempts with exponential backoff

### ✅ Data Security
- Row Level Security ensures users only access their own data
- JWT-based authentication integration
- Secure real-time subscriptions

### ✅ Performance Optimized
- Database indexes for fast queries
- Efficient real-time filtering
- Debounced property updates to reduce API calls

## Troubleshooting

### Connection Issues

**Problem**: `Supabase not initialized. Check environment variables.`
**Solution**: Verify your environment variables are set correctly

**Problem**: `Failed to connect to Supabase Realtime`
**Solution**: 
1. Check your Supabase project is active
2. Verify the anon key has correct permissions
3. Ensure realtime is enabled for the tables

### Authentication Issues

**Problem**: `Row Level Security` blocking queries
**Solution**: Make sure you're authenticated and the user ID matches

**Problem**: `auth.uid()` returns null
**Solution**: Check that your authentication system is properly integrated

### Performance Issues

**Problem**: Slow real-time updates
**Solution**: 
1. Check database indexes are created
2. Monitor Supabase dashboard for performance metrics
3. Consider upgrading Supabase plan for higher limits

## Development vs Production

### Development
- Use the free Supabase tier
- Enable verbose logging in browser console
- Test with multiple browser tabs for real-time features

### Production  
- Upgrade to Supabase Pro for better performance
- Set up proper monitoring and alerts
- Configure backup strategies
- Use environment-specific Supabase projects

## Migration from Backend-Only

The integration is **non-breaking**:

1. ✅ Existing backend API continues to work
2. ✅ Automatic fallback if Supabase is not configured
3. ✅ Gradual migration - can enable Supabase per user
4. ✅ Data can be synced between systems if needed

## Next Steps

1. **Set up your Supabase project** following this guide
2. **Test the real-time features** with multiple browser tabs
3. **Monitor performance** in the Supabase dashboard
4. **Consider additional features** like presence indicators, conflict resolution, etc.

## Support

- Check the browser console for detailed error messages
- Monitor the Supabase dashboard for API usage and errors
- Review the `src/lib/supabase-realtime.ts` service for debugging

The system is designed to be robust and will always fall back to the existing backend API if Supabase is unavailable.
