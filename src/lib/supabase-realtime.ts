'use client';

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { Graph as BaseGraph, GraphNode as BaseGraphNode, Property } from '@/app/api/lib/schemas';

// Extended types for Supabase integration
export interface GraphNode extends BaseGraphNode {
  position?: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface Graph extends Omit<BaseGraph, 'nodes'> {
  nodes: GraphNode[];
  edges?: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

// Database types for Supabase
export interface DatabaseNode {
  id: string;
  title: string;
  prompt: string;
  state: 'unbuilt' | 'building' | 'built';
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  created_at?: string;
  updated_at?: string;
  user_id: string;
}

export interface DatabaseEdge {
  id: string;
  source_id: string;
  target_id: string;
  user_id: string;
  created_at?: string;
}

export interface DatabaseProperty {
  id: string;
  node_id: string;
  name: string;
  type: 'color' | 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'checkbox' | 'radio' | 'slider' | 'object' | 'object-list';
  value: any;
  options?: string[];
  // Complex schema columns
  fields?: any;
  item_fields?: any;
  item_title?: string;
  add_label?: string;
  user_id: string;
  created_at?: string;
  updated_at?: string;
}

export type Database = {
  public: {
    Tables: {
      graph_nodes: {
        Row: DatabaseNode;
        Insert: Omit<DatabaseNode, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DatabaseNode, 'id' | 'created_at' | 'updated_at'>>;
      };
      graph_edges: {
        Row: DatabaseEdge;
        Insert: Omit<DatabaseEdge, 'created_at'>;
        Update: Partial<Omit<DatabaseEdge, 'id' | 'created_at'>>;
      };
      graph_properties: {
        Row: DatabaseProperty;
        Insert: Omit<DatabaseProperty, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DatabaseProperty, 'id' | 'created_at' | 'updated_at'>>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Event types for realtime subscriptions
export type GraphChangeEvent = 
  | { type: 'node_created'; node: GraphNode }
  | { type: 'node_updated'; node: GraphNode }
  | { type: 'node_deleted'; nodeId: string }
  | { type: 'property_updated'; nodeId: string; property: Property }
  | { type: 'graph_loaded'; graph: Graph }
  | { type: 'node_position_updated'; nodeId: string; position: { x: number; y: number }; fromBroadcast?: boolean }
  | { type: 'property_updated_broadcast'; nodeId: string; propertyId: string; value: any; fromBroadcast?: boolean };

export type GraphChangeHandler = (event: GraphChangeEvent) => void;

class SupabaseRealtimeService {
  private supabase: SupabaseClient<any> | null = null; // For realtime subscriptions
  private serviceRoleClient: SupabaseClient<any> | null = null; // For database operations
  private channel: RealtimeChannel | null = null;
  private broadcastChannel: RealtimeChannel | null = null; // primary broadcast channel
  private broadcastSandboxChannel: RealtimeChannel | null = null; // secondary (sandbox) broadcast channel
  private userId: string | null = null;
  private clientId: string = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  private changeHandlers: Set<GraphChangeHandler> = new Set();
  private isConnected = false;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log('🔧 Supabase initialization check:');
    console.log('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
    console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase environment variables not configured. Realtime features will be disabled.');
      console.warn('   Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file');
      return;
    }

    try {
      // Create anonymous client for realtime subscriptions
      this.supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // Try to create service role client for database operations
      this.initializeServiceRoleClient(supabaseUrl);
      
      console.log('✅ Supabase client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Supabase client:', error);
    }
  }

  private async initializeServiceRoleClient(supabaseUrl: string) {
    // Retry once during connect if initial attempt fails (e.g., before routes are ready)
    const tryFetch = async () => {
      const origin = typeof window !== 'undefined'
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL || '');
      const endpoint = `${origin}/api/supabase/service-key`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('service-key endpoint not ready');
      const { serviceRoleKey } = await response.json();
      this.serviceRoleClient = createClient(supabaseUrl, serviceRoleKey);
      console.log('✅ Service role client initialized for database operations');
    };
    try {
      await tryFetch();
    } catch (e) {
      // Retry after a short delay
      setTimeout(async () => {
        try {
          await tryFetch();
        } catch (err) {
          console.warn('⚠️ Failed to initialize service role client:', err);
          console.warn('   Using anonymous client for database operations (may fail due to RLS)');
        }
      }, 500);
    }
  }

  // Determine a shared broadcast room so multiple sessions/users see each other's changes.
  // Prefer sandboxId when available; fall back to userId.
  private async getBroadcastRoomId(userId: string): Promise<string> {
    try {
      const res = await fetch('/api/sandbox/init', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        const sandboxId = data?.sandbox?.sandboxId;
        if (sandboxId && typeof sandboxId === 'string') {
          return sandboxId;
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed to resolve sandboxId for broadcast; using userId instead');
    }
    return userId;
  }

  async connect(userId: string) {
    console.log('🔗 Attempting to connect to Supabase Realtime for user:', userId);
    
    if (!this.supabase) {
      const error = 'Supabase not initialized. Check environment variables.';
      console.error('❌', error);
      throw new Error(error);
    }

    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) {
      console.log('⏳ Connection already in progress, skipping...');
      return;
    }

    if (this.isConnected && this.userId === userId) {
      console.log('✅ Already connected to Supabase for this user');
      return; // Already connected for this user
    }

    this.isConnecting = true;
    this.userId = userId;
    
    // Clear any existing reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Disconnect existing channel if any
    if (this.channel) {
      console.log('🔄 Disconnecting existing channel before reconnecting');
      await this.disconnect();
    }

    console.log('📡 Creating Supabase realtime channel...');
    
    // Create a new channel for this user's graph changes
    this.channel = this.supabase
      .channel(`graph-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'graph_nodes',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('📡 Received node change:', payload);
          this.handleNodeChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'graph_edges',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('📡 Received edge change:', payload);
          this.handleEdgeChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'graph_properties',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('📡 Received property change:', payload);
          console.log('📡 Property change details:', {
            eventType: payload.eventType,
            table: payload.table,
            new: payload.new,
            old: payload.old
          });
          this.handlePropertyChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Supabase subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          this.isConnected = true;
          this.isConnecting = false;
          console.log('✅ Connected to Supabase Realtime');
          // Immediately load the current graph snapshot on first subscribe
          // Kick off initial graph load; don't block the subscribe callback
          (async () => {
            try { await this.loadGraph(); } catch (e) { console.warn('⚠️ Initial graph load after subscribe failed:', e); }
          })();
          // Subscribe to two broadcast rooms for robust fanout: userId and sandboxId
          try {
            const userRoom = `graph-broadcast-${userId}`;
            this.broadcastChannel = this.supabase!.channel(userRoom, {
              config: { broadcast: { self: false, ack: false } }
            })
            .on('broadcast', { event: 'position_update' }, (payload) => {
              console.log('📡 Received position broadcast (user):', payload);
              this.handlePositionBroadcast(payload);
            })
            .on('broadcast', { event: 'property_update' }, (payload) => {
              console.log('📡 Received property broadcast (user):', payload);
              console.log('📡 My clientId:', this.clientId);
              console.log('📡 Broadcast clientId:', payload.payload?.clientId);
              console.log('📡 Broadcast channel room:', this.broadcastChannel?.topic);
              this.handlePropertyBroadcast(payload);
            })
            .on('broadcast', { event: 'property' }, (payload) => {
              const { nodeId: bNodeId, property } = payload?.payload || {};
              if (!bNodeId || !property) return;
              this.notifyHandlers({ type: 'property_updated', nodeId: bNodeId, property });
            })
            .on('broadcast', { event: 'graph_reload' }, async () => {
              try { await this.loadGraph(); } catch (e) { console.warn('⚠️ reload failed (user):', e); }
            })
            .subscribe((status) => {
              console.log('📡 Broadcast channel subscription status:', status);
              if (status === 'SUBSCRIBED') {
                console.log('📡 Broadcast channel successfully subscribed');
              }
            });

            // Resolve sandbox room and subscribe if different
            (async () => {
              try {
                const resolved = await this.getBroadcastRoomId(userId);
                if (resolved && resolved !== userId) {
                  const sandboxRoom = `graph-broadcast-${resolved}`;
                  this.broadcastSandboxChannel = this.supabase!.channel(sandboxRoom, {
                    config: { broadcast: { self: false, ack: false } }
                  })
                  .on('broadcast', { event: 'position_update' }, (payload) => {
                    console.log('📡 Received position broadcast (sandbox):', payload);
                    this.handlePositionBroadcast(payload);
                  })
                  .on('broadcast', { event: 'property_update' }, (payload) => {
                    console.log('📡 Received property broadcast (sandbox):', payload);
                    this.handlePropertyBroadcast(payload);
                  })
                  .on('broadcast', { event: 'property' }, (payload) => {
                    const { nodeId: bNodeId, property } = payload?.payload || {};
                    if (!bNodeId || !property) return;
                    this.notifyHandlers({ type: 'property_updated', nodeId: bNodeId, property });
                  })
                  .on('broadcast', { event: 'graph_reload' }, async () => {
                    try { await this.loadGraph(); } catch (e) { console.warn('⚠️ reload failed (sandbox):', e); }
                  })
                  .subscribe();
                }
              } catch {}
            })();
          } catch {}
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Failed to connect to Supabase Realtime - Channel Error');
          this.isConnected = false;
          this.isConnecting = false;
          this.scheduleReconnect();
        } else if (status === 'TIMED_OUT') {
          console.error('❌ Supabase Realtime connection timed out');
          this.isConnected = false;
          this.isConnecting = false;
          this.scheduleReconnect();
        } else if (status === 'CLOSED') {
          console.log('🔌 Supabase Realtime channel closed');
          this.isConnected = false;
          this.isConnecting = false;
          // Don't auto-reconnect on CLOSED - it might be intentional
        }
      });

    // Add a timeout to detect connection issues
    setTimeout(() => {
      if (!this.isConnected) {
        console.warn('⚠️ Supabase connection taking longer than expected. Check your Supabase project status.');
      }
    }, 5000);
  }

  private scheduleReconnect() {
    // Disable internal reconnect; the store will poll and re-connect explicitly
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  async disconnect() {
    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.channel) {
      await this.supabase?.removeChannel(this.channel);
      this.channel = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.userId = null;
    console.log('🔌 Disconnected from Supabase Realtime');
  }

  private async handleNodeChange(payload: any) {
    console.log('📡 Node change received:', payload);
    
    try {
      if (payload.eventType === 'INSERT') {
        const node = await this.convertDatabaseNodeToGraphNode(payload.new);
        this.notifyHandlers({ type: 'node_created', node });
      } else if (payload.eventType === 'UPDATE') {
        const node = await this.convertDatabaseNodeToGraphNode(payload.new);
        this.notifyHandlers({ type: 'node_updated', node });
      } else if (payload.eventType === 'DELETE') {
        this.notifyHandlers({ type: 'node_deleted', nodeId: payload.old.id });
      }
    } catch (error) {
      console.error('Error handling node change:', error);
    }
  }

  private async handlePropertyChange(payload: any) {
    console.log('📡 Property change received:', payload);
    
    try {
      if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
        const property = this.convertDatabasePropertyToProperty(payload.new);
        this.notifyHandlers({ 
          type: 'property_updated', 
          nodeId: payload.new.node_id, 
          property 
        });
      }
    } catch (error) {
      console.error('Error handling property change:', error);
    }
  }

  private async handleEdgeChange(payload: any) {
    // On any edge change, reload graph edges into store to stay consistent
    try {
      await this.loadGraph();
    } catch (error) {
      console.error('Error handling edge change:', error);
    }
  }

  private notifyHandlers(event: GraphChangeEvent) {
    this.changeHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in change handler:', error);
      }
    });
  }

  // Public API methods
  onGraphChange(handler: GraphChangeHandler) {
    this.changeHandlers.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.changeHandlers.delete(handler);
    };
  }

  async loadGraph(): Promise<Graph | null> {
    if (!this.userId) {
      throw new Error('Not connected to Supabase');
    }

    // Use service role client for database operations, fallback to anonymous client
    const client = this.serviceRoleClient || this.supabase;
    if (!client) {
      throw new Error('No Supabase client available');
    }

    try {
      // Load nodes
      const { data: nodes, error: nodesError } = await client
        .from('graph_nodes')
        .select('*')
        .eq('user_id', this.userId);

      if (nodesError) throw nodesError;

      // Load edges
      const { data: edges, error: edgesError } = await client
        .from('graph_edges')
        .select('*')
        .eq('user_id', this.userId);

      if (edgesError) throw edgesError;

      // Load properties
      const { data: properties, error: propertiesError } = await client
        .from('graph_properties')
        .select('*')
        .order('id', { ascending: true })
        .eq('user_id', this.userId);

      if (propertiesError) throw propertiesError;

      // Convert to graph format
      const graphNodes = await Promise.all(
        (nodes || []).map(node => this.convertDatabaseNodeToGraphNode(node, properties))
      );

      // Build children arrays from edges
      const nodeMap = new Map(graphNodes.map(node => [node.id, node]));
      const edgeArray = (edges || []).map(edge => ({
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id
      }));

      // Populate children arrays from edges
      for (const edge of edgeArray) {
        const parentNode = nodeMap.get(edge.source);
        const childNode = nodeMap.get(edge.target);
        if (parentNode && childNode) {
          if (!parentNode.children) {
            parentNode.children = [];
          }
          // Avoid duplicates
          if (!parentNode.children.find(child => child.id === childNode.id)) {
            parentNode.children.push({
              id: childNode.id,
              title: childNode.title
            });
          }
        }
      }

      const graph: Graph = {
        nodes: graphNodes,
        edges: edgeArray
      };

      console.log(`📊 Loaded graph: ${graphNodes.length} nodes, ${edgeArray.length} edges`);
      if (edgeArray.length > 0) {
        console.log('📊 Edge details:', edgeArray);
      }

      // Notify handlers
      this.notifyHandlers({ type: 'graph_loaded', graph });

      return graph;
    } catch (error) {
      console.error('Error loading graph:', error);
      throw error;
    }
  }

  async saveNode(node: GraphNode): Promise<void> {
    if (!this.userId) {
      throw new Error('Not connected to Supabase');
    }

    // Use service role client for database operations, fallback to anonymous client
    const client = this.serviceRoleClient || this.supabase;
    if (!client) {
      throw new Error('No Supabase client available');
    }

    const databaseNode = {
      id: node.id,
      title: node.title,
      prompt: node.prompt || '',
      state: node.state || 'unbuilt',
      position_x: node.position?.x || 0,
      position_y: node.position?.y || 0,
      width: node.width,
      height: node.height,
      user_id: this.userId
    };

    const { error } = await client
      .from('graph_nodes')
      .upsert(databaseNode);

    if (error) throw error;

    // Save properties if any
    if (node.properties && node.properties.length > 0) {
      await this.saveNodeProperties(node.id, node.properties);
    }

    // Do not touch edges here to avoid accidental deletions on startup.
    // Edges are managed via dedicated syncs or explicit edge operations.

    // Broadcast property-less node change to trigger peers to reload nodes/edges
    try {
      await this.broadcastChannel?.send({
        type: 'broadcast',
        event: 'graph_reload',
        payload: {}
      });
    } catch {}
  }

  async updateNode(nodeId: string, updates: Partial<GraphNode>): Promise<void> {
    if (!this.userId) {
      throw new Error('Not connected to Supabase');
    }

    // Use service role client for database operations, fallback to anonymous client
    const client = this.serviceRoleClient || this.supabase;
    if (!client) {
      throw new Error('No Supabase client available');
    }

    const databaseUpdates: any = {};

    if (updates.title !== undefined) databaseUpdates.title = updates.title;
    if (updates.prompt !== undefined) databaseUpdates.prompt = updates.prompt;
    if (updates.state !== undefined) databaseUpdates.state = updates.state;
    if (updates.position) {
      databaseUpdates.position_x = updates.position.x;
      databaseUpdates.position_y = updates.position.y;
    }
    if (updates.width !== undefined) databaseUpdates.width = updates.width;
    if (updates.height !== undefined) databaseUpdates.height = updates.height;

    const { error } = await client
      .from('graph_nodes')
      .update(databaseUpdates)
      .eq('id', nodeId)
      .eq('user_id', this.userId);

    if (error) throw error;

    // Update properties if provided
    if (updates.properties) {
      await this.saveNodeProperties(nodeId, updates.properties);
    }

    // Broadcast reload for peers
    try {
      await this.broadcastChannel?.send({
        type: 'broadcast',
        event: 'graph_reload',
        payload: {}
      });
    } catch {}
  }

  async deleteNode(nodeId: string): Promise<void> {
    if (!this.userId) {
      throw new Error('Not connected to Supabase');
    }

    // Use service role client for database operations, fallback to anonymous client
    const client = this.serviceRoleClient || this.supabase;
    if (!client) {
      throw new Error('No Supabase client available');
    }

    // Delete properties first (foreign key constraint)
    await client
      .from('graph_properties')
      .delete()
      .eq('node_id', nodeId)
      .eq('user_id', this.userId);

    // Delete edges connected to this node
    await client
      .from('graph_edges')
      .delete()
      .or(`source_id.eq.${nodeId},target_id.eq.${nodeId}`)
      .eq('user_id', this.userId);

    // Delete the node
    const { error } = await client
      .from('graph_nodes')
      .delete()
      .eq('id', nodeId)
      .eq('user_id', this.userId);

    if (error) throw error;

    try {
      await this.broadcastChannel?.send({
        type: 'broadcast',
        event: 'graph_reload',
        payload: {}
      });
    } catch {}
  }

  async updateProperty(nodeId: string, propertyId: string, value: any): Promise<void> {
    if (!this.userId) {
      throw new Error('Not connected to Supabase');
    }

    // Use service role client for database operations, fallback to anonymous client
    const client = this.serviceRoleClient || this.supabase;
    if (!client) {
      throw new Error('No Supabase client available');
    }

    const { error } = await client
      .from('graph_properties')
      .update({ value })
      .eq('id', propertyId)
      .eq('node_id', nodeId)
      .eq('user_id', this.userId);

    if (error) throw error;

    // Broadcast the property change for instant fanout
    try {
      await this.broadcastChannel?.send({
        type: 'broadcast',
        event: 'property',
        payload: { nodeId, property: { id: propertyId, value } }
      });
    } catch {}
  }

  private async saveNodeProperties(nodeId: string, properties: Property[]): Promise<void> {
    if (!this.userId) return;

    // Use service role client for database operations, fallback to anonymous client
    const client = this.serviceRoleClient || this.supabase;
    if (!client) return;

    // Valid property types according to database constraint
    const validTypes = ['color', 'text', 'textarea', 'number', 'select', 'boolean', 'checkbox', 'radio', 'slider', 'object', 'object-list'];
    
    const databaseProperties = properties.map(prop => ({
      id: prop.id,
      node_id: nodeId,
      name: prop.title, // Use title from Property schema as name in database
      type: validTypes.includes(prop.type) ? prop.type : 'text', // Validate type
      value: prop.value,
      options: prop.options,
      // Persist complex schema columns when present
      fields: (prop as any).fields,
      item_fields: (prop as any).itemFields,
      item_title: (prop as any).itemTitle,
      add_label: (prop as any).addLabel,
      user_id: this.userId!
    }));
    
    const { error } = await client
      .from('graph_properties')
      .upsert(databaseProperties);

    if (error) throw error;

    // Broadcast bulk property update
    try {
      await this.broadcastChannel?.send({
        type: 'broadcast',
        event: 'graph_reload',
        payload: {}
      });
    } catch {}
  }

  private async convertDatabaseNodeToGraphNode(
    dbNode: DatabaseNode, 
    allProperties?: DatabaseProperty[]
  ): Promise<GraphNode> {
    let properties: Property[] = [];

    if (allProperties) {
      // Use provided properties (for batch loading)
      properties = allProperties
        .filter(prop => prop.node_id === dbNode.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(this.convertDatabasePropertyToProperty);
    } else if (this.supabase) {
      // Load properties individually
      const { data: nodeProperties } = await this.supabase
        .from('graph_properties')
        .select('*')
        .order('id', { ascending: true })
        .eq('node_id', dbNode.id)
        .eq('user_id', dbNode.user_id);

      properties = (nodeProperties || []).map(this.convertDatabasePropertyToProperty);
    }

    return {
      id: dbNode.id,
      title: dbNode.title,
      prompt: dbNode.prompt,
      state: dbNode.state,
      position: { x: dbNode.position_x, y: dbNode.position_y },
      width: dbNode.width,
      height: dbNode.height,
      properties: properties.length > 0 ? properties : undefined,
      children: [] // Will be populated by graph loading logic
    };
  }

  private convertDatabasePropertyToProperty(dbProperty: DatabaseProperty): Property {
    return {
      id: dbProperty.id,
      title: dbProperty.name, // Map database name to Property title
      type: dbProperty.type as any,
      value: dbProperty.value,
      options: dbProperty.options,
      // Complex schema mapping
      ...(dbProperty.fields ? { fields: dbProperty.fields as any } : {}),
      ...(dbProperty.item_fields ? { itemFields: dbProperty.item_fields as any } : {}),
      ...(dbProperty.item_title ? { itemTitle: dbProperty.item_title } : {}),
      ...(dbProperty.add_label ? { addLabel: dbProperty.add_label } : {}),
    } as any;
  }

  // Broadcast position updates for real-time collaboration (non-blocking)
  broadcastPosition(nodeId: string, position: { x: number; y: number }): void {
    if (!this.broadcastChannel || !this.isConnected) {
      return;
    }

    try {
      this.broadcastChannel.send({
        type: 'broadcast',
        event: 'position_update',
        payload: {
          nodeId,
          position,
          userId: this.userId,
          clientId: this.clientId,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.debug('Failed to broadcast position:', error);
    }
  }

  // Broadcast property updates for real-time collaboration (non-blocking)
  broadcastProperty(nodeId: string, propertyId: string, value: any): void {
    console.log('📡 broadcastProperty called:', { nodeId, propertyId, value });
    console.log('📡 broadcast status:', {
      hasChannel: !!this.broadcastChannel,
      isConnected: this.isConnected,
      channelState: this.broadcastChannel?.state,
      topic: this.broadcastChannel?.topic
    });
    if (!this.broadcastChannel || !this.isConnected) {
      console.log('📡 broadcastProperty skipped: not connected');
      return;
    }

    try {
      const payload = {
        nodeId,
        propertyId,
        value,
        userId: this.userId,
        clientId: this.clientId,
        timestamp: Date.now()
      };
      console.log('📡 Sending broadcast with payload:', payload);
      this.broadcastChannel.send({
        type: 'broadcast',
        event: 'property_update',
        payload
      });
      console.log('📡 Broadcast sent successfully');
    } catch (error) {
      console.error('📡 Failed to broadcast property:', error);

      // Fallback: trigger local update even if broadcast fails
      console.log('📡 Broadcast failed, triggering local update as fallback');
      this.notifyHandlers({
        type: 'property_updated_broadcast',
        nodeId,
        propertyId,
        value,
        fromBroadcast: false
      });
    }
  }

  // Handle received position broadcasts
  private handlePositionBroadcast(payload: any): void {
    try {
      const { nodeId, position, userId, clientId, timestamp } = payload.payload || {};
      
      // Ignore our own broadcasts (same browser tab)
      if (clientId === this.clientId) {
        return;
      }

      if (!nodeId || !position) {
        console.debug('Invalid position broadcast payload:', payload);
        return;
      }

      console.log(`📡 Applying position update from user ${userId}:`, { nodeId, position });
      
      // Update the node position in our local graph state
      this.notifyHandlers({
        type: 'node_position_updated',
        nodeId,
        position,
        fromBroadcast: true
      });
    } catch (error) {
      console.debug('Error handling position broadcast:', error);
    }
  }

  // Handle received property broadcasts
  private handlePropertyBroadcast(payload: any): void {
    console.log('📡 handlePropertyBroadcast called with payload:', payload);
    try {
      const { nodeId, propertyId, value, userId, clientId, timestamp } = payload.payload || {};

      console.log('📡 Extracted data:', { nodeId, propertyId, value, userId, clientId, myClientId: this.clientId });

      // For property updates, we want to process our own broadcasts too for local consistency
      // This ensures the graph state stays in sync even for same-client updates
      const isOwnBroadcast = clientId === this.clientId;
      if (isOwnBroadcast) {
        console.log('📡 Processing own broadcast for local consistency');
      }

      if (!nodeId || !propertyId) {
        console.debug('Invalid property broadcast payload:', payload);
        return;
      }

      console.log(`📡 Applying property update from user ${userId}:`, { nodeId, propertyId, value });
      
      // Update the property in our local graph state
      console.log('📡 Notifying handlers with event:', {
        type: 'property_updated_broadcast',
        nodeId,
        propertyId,
        value,
        fromBroadcast: true
      });
      this.notifyHandlers({
        type: 'property_updated_broadcast',
        nodeId,
        propertyId,
        value,
        fromBroadcast: true
      });
    } catch (error) {
      console.debug('Error handling property broadcast:', error);
    }
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }

  get currentUserId(): string | null {
    return this.userId;
  }
}

// Export singleton instance
export const supabaseRealtimeService = new SupabaseRealtimeService();
export default supabaseRealtimeService;
