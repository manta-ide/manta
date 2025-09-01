import postgres from 'postgres';

async function addChatHistoryColumn() {
  try {
    console.log('Adding chat_history column to user table...');
    
    const sql = postgres(process.env.DATABASE_URL!, {
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
    
    // Check if column already exists
    const columnExists = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user' AND column_name = 'chat_history'
    `;
    
    if (columnExists.length > 0) {
      console.log('✅ chat_history column already exists!');
    } else {
      // Add the column
      await sql`
        ALTER TABLE "user" 
        ADD COLUMN chat_history JSONB
      `;
      console.log('✅ chat_history column added successfully!');
    }
    
    await sql.end();
    console.log('Database migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error adding chat_history column:', error);
    process.exit(1);
  }
}

addChatHistoryColumn();
