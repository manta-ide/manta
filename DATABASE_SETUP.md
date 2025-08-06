# Database Setup Guide

## Option 1: SQLite (Recommended for Development - Easiest)

SQLite is already configured and ready to use! No additional setup required.

```bash
# Just run the database setup
npm run setup-db

# Start the development server
npm run dev
```

The database file `mantaeditor.db` will be created automatically in your project root.

## Option 2: Local PostgreSQL Installation

### Windows
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer and follow the setup wizard
3. Remember the password you set for the `postgres` user
4. Create a database named `mantaeditor`

### macOS
```bash
# Using Homebrew
brew install postgresql
brew services start postgresql

# Create database
createdb mantaeditor
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres createdb mantaeditor
```

## Option 2: Docker (Easiest)

```bash
# Run PostgreSQL in Docker
docker run --name postgres-manta -e POSTGRES_PASSWORD=password -e POSTGRES_DB=mantaeditor -p 5432:5432 -d postgres:15

# Stop the container when done
docker stop postgres-manta

# Start it again
docker start postgres-manta
```

## Option 3: Cloud Database (Production)

### Supabase (Free tier available)
1. Go to https://supabase.com
2. Create a new project
3. Get your database URL from Settings > Database
4. Use the connection string as your `DATABASE_URL`

### Neon (Free tier available)
1. Go to https://neon.tech
2. Create a new project
3. Get your database URL from the dashboard
4. Use the connection string as your `DATABASE_URL`

## Environment Configuration

Create a `.env.local` file in your project root:

```env
# For local PostgreSQL:
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/mantaeditor"

# For Docker PostgreSQL:
DATABASE_URL="postgresql://postgres:password@localhost:5432/mantaeditor"

# For Supabase/Neon:
DATABASE_URL="postgresql://username:password@host:port/database"

# Better Auth Configuration
BETTER_AUTH_SECRET="your-secret-key-here-change-in-production"
BETTER_AUTH_URL="http://localhost:3000"
```

## Setup Database Tables

After setting up your database and environment variables:

```bash
# Install dependencies (if not already done)
npm install

# Run database migration
npm run setup-db

# Start the development server
npm run dev
```

## Troubleshooting

### Connection Issues
- Make sure PostgreSQL is running
- Verify the connection string format
- Check if the database exists
- Ensure the user has proper permissions

### Permission Issues
```sql
-- Connect to PostgreSQL as superuser
sudo -u postgres psql

-- Create user and database
CREATE USER mantaeditor WITH PASSWORD 'your_password';
CREATE DATABASE mantaeditor OWNER mantaeditor;
GRANT ALL PRIVILEGES ON DATABASE mantaeditor TO mantaeditor;
```

### Docker Issues
```bash
# Check if container is running
docker ps

# View logs
docker logs postgres-manta

# Remove and recreate container
docker rm postgres-manta
docker run --name postgres-manta -e POSTGRES_PASSWORD=password -e POSTGRES_DB=mantaeditor -p 5432:5432 -d postgres:15
``` 