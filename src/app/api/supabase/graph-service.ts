import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Graph, GraphNode } from "@/lib/supabase-realtime";
import { Property } from "@/app/api/lib/schemas";
import fs from "fs";
import path from "path";

export class SupabaseGraphService {
  /**
   * Get server-side Supabase client with service role
   */
  private static async getSupabaseServiceClient(): Promise<SupabaseClient> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    return createClient(supabaseUrl, serviceRoleKey);
  }

  /**
   * Clear all graph data for a user from Supabase
   */
  static async clearUserGraphData(userId: string): Promise<void> {
    try {
      console.log(`[SupabaseGraphService] Clearing graph data for user ${userId}`);
      
      // Get server-side Supabase client
      const client = await this.getSupabaseServiceClient();

      // Delete all user's graph data in the correct order (foreign key constraints)
      // 1. Delete properties first
      const { error: propertiesError } = await client
        .from('graph_properties')
        .delete()
        .eq('user_id', userId);

      if (propertiesError) {
        throw new Error(`Failed to delete properties: ${propertiesError.message}`);
      }

      // 2. Delete edges
      const { error: edgesError } = await client
        .from('graph_edges')
        .delete()
        .eq('user_id', userId);

      if (edgesError) {
        throw new Error(`Failed to delete edges: ${edgesError.message}`);
      }

      // 3. Delete nodes last
      const { error: nodesError } = await client
        .from('graph_nodes')
        .delete()
        .eq('user_id', userId);

      if (nodesError) {
        throw new Error(`Failed to delete nodes: ${nodesError.message}`);
      }

      console.log(`[SupabaseGraphService] ✅ Cleared all graph data for user ${userId}`);
    } catch (error) {
      console.error(`[SupabaseGraphService] Failed to clear graph data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load and parse the base template graph
   */
  private static loadBaseTemplateGraph(): Graph {
    const baseTemplatePath = path.join(process.cwd(), 'vite-base-template');
    const graphPath = path.join(baseTemplatePath, '_graph', 'graph.json');
    
    if (!fs.existsSync(graphPath)) {
      throw new Error(`Base template graph not found at ${graphPath}`);
    }

    try {
      const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
      return this.convertTemplateGraphFormat(graphData);
    } catch (error) {
      console.error(`[SupabaseGraphService] Failed to parse base template graph:`, error);
      throw error;
    }
  }

  /**
   * Calculate node position based on hierarchy
   */
  private static calculateNodePosition(node: any, allNodes: any[]): { x: number; y: number } {
    // Simple layout: root nodes at top, children spread out below
    if (!node.parentId || node.parentId === 'root') {
      // Root node - center it
      return { x: 400, y: 100 };
    } else {
      // Child node - find siblings and position accordingly
      const siblings = allNodes.filter(n => n.parentId === node.parentId);
      const siblingIndex = siblings.findIndex(n => n.id === node.id);
      const totalSiblings = siblings.length;
      
      // Spread children horizontally below parent
      const baseX = 100;
      const spacing = 300;
      const x = baseX + (siblingIndex * spacing);
      const y = 300; // Fixed Y for first level children
      
      return { x, y };
    }
  }

  /**
   * Convert template graph format to the format expected by our Graph type
   */
  private static convertTemplateGraphFormat(templateGraph: any): Graph {
    const nodes: GraphNode[] = [];
    const edges: { id: string; source: string; target: string }[] = [];

    // Process nodes from template format
    for (const templateNode of templateGraph.nodes || []) {
      // Convert properties from template format to our Property format
      const properties: Property[] = (templateNode.properties || []).map((prop: any) => ({
        id: prop.id,
        title: prop.title,
        type: prop.type,
        value: prop.value,
        options: prop.options,
        maxLength: prop.maxLength,
        // Preserve complex schema for object/object-list
        ...(Array.isArray(prop.fields) ? { fields: prop.fields } : {}),
        ...(Array.isArray(prop.itemFields) ? { itemFields: prop.itemFields } : {}),
        ...(prop.itemTitle ? { itemTitle: prop.itemTitle } : {}),
        ...(prop.addLabel ? { addLabel: prop.addLabel } : {}),
      }));

      // Convert node
      const node: GraphNode = {
        id: templateNode.id,
        title: templateNode.title,
        prompt: templateNode.prompt || '',
        state: templateNode.state || 'unbuilt',
        position: this.calculateNodePosition(templateNode, templateGraph.nodes), // Calculate position based on hierarchy
        properties: properties.length > 0 ? properties : undefined,
        children: (templateNode.children || []).map((child: any) => ({
          id: child.id,
          title: child.title
        }))
      };

      nodes.push(node);

      // Create edges from parentId relationships
      if (templateNode.parentId && templateNode.parentId !== 'root') {
        edges.push({
          id: `${templateNode.parentId}-${templateNode.id}`,
          source: templateNode.parentId,
          target: templateNode.id
        });
      }

      // Create edges from children relationships
      if (templateNode.children && Array.isArray(templateNode.children)) {
        for (const child of templateNode.children) {
          edges.push({
            id: `${templateNode.id}-${child.id}`,
            source: templateNode.id,
            target: child.id
          });
        }
      }
    }

    // Remove duplicate edges (in case both parentId and children create the same edge)
    const uniqueEdges = edges.filter((edge, index, self) => 
      index === self.findIndex(e => e.id === edge.id)
    );

    return {
      nodes,
      edges: uniqueEdges
    };
  }

  /**
   * Sync base template graph to Supabase for a user
   */
  static async syncTemplateGraphToSupabase(userId: string): Promise<void> {
    try {
      console.log(`[SupabaseGraphService] Syncing base template graph to Supabase for user ${userId}`);
      
      // Load the base template graph
      const templateGraph = this.loadBaseTemplateGraph();
      
      // Clear existing graph data first
      await this.clearUserGraphData(userId);
      
      // Get server-side Supabase client
      const client = await this.getSupabaseServiceClient();
      
      // Sync nodes to Supabase
      for (const node of templateGraph.nodes) {
        // Insert node
        const { error: nodeError } = await client
          .from('graph_nodes')
          .upsert({
            id: node.id,
            title: node.title,
            prompt: node.prompt,
            state: node.state,
            position_x: node.position?.x || 0,
            position_y: node.position?.y || 0,
            width: node.width,
            height: node.height,
            user_id: userId
          });

        if (nodeError) {
          throw new Error(`Failed to save node ${node.id}: ${nodeError.message}`);
        }

        // Insert properties if they exist
        if (node.properties && node.properties.length > 0) {
          const propertiesData = node.properties.map((prop: any) => ({
            id: prop.id,
            node_id: node.id,
            name: prop.title,
            type: prop.type,
            value: prop.value,
            options: prop.options,
            // Persist complex schema columns
            fields: prop.fields,
            item_fields: prop.itemFields,
            item_title: prop.itemTitle,
            add_label: prop.addLabel,
            user_id: userId
          }));

          const { error: propertiesError } = await client
            .from('graph_properties')
            .upsert(propertiesData);

          if (propertiesError) {
            throw new Error(`Failed to save properties for node ${node.id}: ${propertiesError.message}`);
          }
        }
      }
      
      // Save edges if they exist
      if (templateGraph.edges && templateGraph.edges.length > 0) {
        const { error: edgesError } = await client
          .from('graph_edges')
          .upsert(
            templateGraph.edges.map(edge => ({
              id: edge.id,
              source_id: edge.source,
              target_id: edge.target,
              user_id: userId
            }))
          );

        if (edgesError) {
          throw new Error(`Failed to save edges: ${edgesError.message}`);
        }
      }
      
      console.log(`[SupabaseGraphService] ✅ Synced ${templateGraph.nodes.length} nodes and ${templateGraph.edges?.length || 0} edges to Supabase`);
    } catch (error) {
      console.error(`[SupabaseGraphService] Failed to sync template graph to Supabase for user ${userId}:`, error);
      throw error;
    }
  }
}
