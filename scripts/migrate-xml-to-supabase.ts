#!/usr/bin/env tsx
/**
 * Migration script to transfer existing XML graph data to Supabase
 * 
 * Usage: tsx scripts/migrate-xml-to-supabase.ts
 */

import fs from 'fs';
import path from 'path';
import { xmlToGraph } from '../src/lib/graph-xml';
import { supabase, getOrCreateDefaultUser, getOrCreateDefaultProject } from '../src/lib/supabase';

async function migrateXmlToSupabase() {
  console.log('🚀 Starting migration from XML to Supabase...\n');

  try {
    // Initialize default user and project
    console.log('📦 Creating default user and project...');
    const user = await getOrCreateDefaultUser();
    const project = await getOrCreateDefaultProject(user.id);
    console.log(`✅ User: ${user.id}, Project: ${project.id}\n`);

    // Read XML file
    const xmlPaths = [
      //path.join(process.cwd(), 'manta', 'graphs', 'current-graph.xml'),
      //path.join(process.cwd(), 'dev-project', 'manta', 'current-graph.xml'),
      path.join(process.cwd(), 'manta', 'current-graph.xml'),
    ];

    let xmlContent: string | null = null;
    let usedPath: string | null = null;

    for (const xmlPath of xmlPaths) {
      if (fs.existsSync(xmlPath)) {
        console.log(`📖 Reading XML from: ${xmlPath}`);
        xmlContent = fs.readFileSync(xmlPath, 'utf-8');
        usedPath = xmlPath;
        break;
      }
    }

    if (!xmlContent) {
      console.log('⚠️  No XML file found. Skipping migration.');
      console.log('   The system will start with an empty graph.\n');
      return;
    }

    // Parse XML to graph
    console.log('🔄 Parsing XML...');
    const graph = xmlToGraph(xmlContent);
    console.log(`✅ Parsed ${graph.nodes?.length || 0} nodes and ${graph.edges?.length || 0} edges\n`);

    // Clear existing data in Supabase for this project
    console.log('🧹 Clearing existing data in Supabase...');
    await supabase.from('nodes').delete().eq('project_id', project.id);
    console.log('✅ Cleared existing nodes and edges\n');

    // Insert nodes
    if (graph.nodes && graph.nodes.length > 0) {
      console.log(`📝 Inserting ${graph.nodes.length} nodes...`);
      const nodesToInsert = graph.nodes.map(node => ({
        id: node.id,
        project_id: project.id,
        data: node,
      }));

      const { error: nodesError } = await supabase
        .from('nodes')
        .insert(nodesToInsert);

      if (nodesError) {
        console.error('❌ Error inserting nodes:', nodesError);
        throw nodesError;
      }
      console.log('✅ Nodes inserted successfully\n');
    }

    // Insert edges
    if (graph.edges && graph.edges.length > 0) {
      console.log(`📝 Inserting ${graph.edges.length} edges...`);
      const edgesToInsert = graph.edges.map(edge => ({
        id: edge.id,
        project_id: project.id,
        source_id: edge.source,
        target_id: edge.target,
        data: edge,
      }));

      const { error: edgesError } = await supabase
        .from('edges')
        .insert(edgesToInsert);

      if (edgesError) {
        console.error('❌ Error inserting edges:', edgesError);
        throw edgesError;
      }
      console.log('✅ Edges inserted successfully\n');
    }

    // Create backup of XML file
    if (usedPath) {
      const backupPath = usedPath.replace('.xml', '.xml.backup');
      fs.copyFileSync(usedPath, backupPath);
      console.log(`💾 Backup created: ${backupPath}\n`);
    }

    console.log('🎉 Migration completed successfully!');
    console.log(`   Migrated ${graph.nodes?.length || 0} nodes and ${graph.edges?.length || 0} edges to Supabase.\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateXmlToSupabase()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

