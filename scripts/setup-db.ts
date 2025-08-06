import { auth } from '../src/lib/auth';
import postgres from 'postgres';

async function setupDatabase() {
  try {
    console.log('Setting up PostgreSQL database...');
    
    // Test database connection
    const sql = postgres(process.env.DATABASE_URL!, {
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
    
    console.log('Testing database connection...');
    await sql`SELECT 1`;
    console.log('✅ Database connection successful!');
    
    // Better Auth will automatically create tables when first used
    console.log('Tables will be created automatically on first use.');
    
    await sql.end();
    console.log('PostgreSQL database setup completed successfully!');
    console.log('Database URL:', process.env.DATABASE_URL);
    process.exit(0);
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase(); 