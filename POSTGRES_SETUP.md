# PostgreSQL Setup Guide

This guide will help you set up PostgreSQL for your Manta Editor project.

## Prerequisites

1. **PostgreSQL**: Install PostgreSQL on your system
   - Windows: Download from https://www.postgresql.org/download/windows/
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql postgresql-contrib`

2. **Node.js**: Make sure you have Node.js installed

## Setup Steps

### 1. Create PostgreSQL Database

1. Start PostgreSQL service
2. Create a new database:
   ```sql
   CREATE DATABASE mantaeditor;
   ```
3. Create a user (optional, you can use the default postgres user):
   ```sql
   CREATE USER mantaeditor WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE mantaeditor TO mantaeditor;
   ```

### 2. Environment Variables

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

**Replace the placeholders:**
- `username`: Your PostgreSQL username (e.g., `postgres` or `mantaeditor`)
- `password`: Your PostgreSQL password
- `localhost:5432`: Your PostgreSQL host and port (default is localhost:5432)
- `mantaeditor`: Your database name

### 3. Install Dependencies

```bash
npm install
```

### 4. Setup Database

Run the database setup script to test the connection:

```bash
npm run setup-db
```

### 5. Start the Development Server

```bash
npm run dev
```

## Database URL Examples

### Local Development
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mantaeditor"
```

### Using Supabase (Free Tier)
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

### Using Railway
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres"
```

### Using Neon
```env
DATABASE_URL="postgresql://[USER]:[PASSWORD]@[HOST]/[DATABASE]?sslmode=require"
```

## Troubleshooting

### Connection Issues
1. Make sure PostgreSQL is running
2. Verify your `DATABASE_URL` is correct
3. Check that the database exists
4. Ensure the user has proper permissions

### SSL Issues (Production)
If you're using a cloud database provider, you might need SSL:
```env
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

### Port Issues
If PostgreSQL is running on a different port, update the URL:
```env
DATABASE_URL="postgresql://username:password@localhost:5433/mantaeditor"
```

## Migration from SQLite

The project has been migrated from SQLite to PostgreSQL. The following changes were made:

1. ✅ Replaced `better-sqlite3` with `postgres` package
2. ✅ Updated database connection in `src/lib/auth.ts`
3. ✅ Updated setup script in `scripts/setup-db.ts`
4. ✅ Removed SQLite dependencies from `package.json`
5. ✅ Deleted the SQLite database file (`mantaeditor.db`)

## Next Steps

1. Set up your PostgreSQL database
2. Configure your `.env.local` file
3. Run `npm run setup-db` to test the connection
4. Start your development server with `npm run dev`

The authentication system will automatically create all necessary tables on first use. 