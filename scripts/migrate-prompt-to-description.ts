#!/usr/bin/env tsx

/**
 * Migration Script: Rename 'prompt' to 'description' and remove 'position' from nodes table
 * 
 * This script updates all nodes in the Supabase database to:
 * 1. Rename the 'prompt' field to 'description' in the data JSONB column
 * 2. Remove the 'position' field from the data JSONB column (positions are now UI-only)
 * 
 * Usage: npx tsx scripts/migrate-prompt-to-description.ts
 */

import { supabase } from '../src/lib/supabase';

async function migratePromptToDescription() {
  console.log('🔄 Starting migration: prompt → description, removing position');
  console.log('━'.repeat(50));

  try {
    // Fetch all nodes from the database
    const { data: nodes, error: fetchError } = await supabase
      .from('nodes')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch nodes: ${fetchError.message}`);
    }

    if (!nodes || nodes.length === 0) {
      console.log('✅ No nodes found in database. Nothing to migrate.');
      return;
    }

    console.log(`📊 Found ${nodes.length} nodes to migrate`);
    console.log('━'.repeat(50));

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each node
    for (const node of nodes) {
      try {
        const nodeData = node.data;
        
        // Skip if no data or already has description field
        if (!nodeData) {
          console.log(`⚠️  Skipping node ${node.id}: no data`);
          skippedCount++;
          continue;
        }

        // Check if migration is needed
        const hasPrompt = 'prompt' in nodeData;
        const hasDescription = 'description' in nodeData;
        const hasPosition = 'position' in nodeData;

        // Skip if already migrated (has description, no prompt, no position)
        if (!hasPrompt && hasDescription && !hasPosition) {
          skippedCount++;
          continue;
        }

        let needsUpdate = false;

        // Migrate prompt to description
        if (hasPrompt) {
          nodeData.description = nodeData.prompt;
          delete nodeData.prompt;
          console.log(`✅ Node ${node.id}: migrated prompt → description`);
          needsUpdate = true;
        } else if (!hasDescription) {
          // No prompt or description, add empty description
          nodeData.description = '';
          console.log(`⚠️  Node ${node.id}: adding empty description field`);
          needsUpdate = true;
        }

        // Remove position field if present
        if (hasPosition) {
          delete nodeData.position;
          console.log(`🗑️  Node ${node.id}: removed position field`);
          needsUpdate = true;
        }

        if (!needsUpdate) {
          skippedCount++;
          continue;
        }

        // Update the node in the database
        const { error: updateError } = await supabase
          .from('nodes')
          .update({ data: nodeData })
          .eq('id', node.id);

        if (updateError) {
          throw new Error(`Failed to update node ${node.id}: ${updateError.message}`);
        }

        migratedCount++;
      } catch (error) {
        console.error(`❌ Error processing node ${node.id}:`, error);
        errorCount++;
      }
    }

    console.log('━'.repeat(50));
    console.log('📈 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('━'.repeat(50));

    if (errorCount > 0) {
      console.log('⚠️  Migration completed with errors');
      process.exit(1);
    } else {
      console.log('✅ Migration completed successfully!');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migratePromptToDescription();

