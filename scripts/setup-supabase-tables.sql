-- Supabase Database Schema for Graph Storage
-- Run this script in your Supabase SQL editor to create the required tables

-- Enable Row Level Security and Realtime

-- Create graph_nodes table
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT DEFAULT '',
    state TEXT DEFAULT 'unbuilt' CHECK (state IN ('unbuilt', 'building', 'built')),
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    width REAL,
    height REAL,
    built BOOLEAN DEFAULT false,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create graph_edges table
CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create graph_properties table
CREATE TABLE IF NOT EXISTS graph_properties (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('color', 'text', 'number', 'select', 'boolean', 'checkbox', 'radio', 'slider')),
    value JSONB,
    options TEXT[], -- For select/radio type properties
    -- New columns for complex property schemas (nullable for backwards compatibility)
    fields JSONB,       -- For 'object' type: array of nested field schemas
    item_fields JSONB,  -- For 'object-list' type: array of nested field schemas
    item_title TEXT,    -- Singular label for items in object-list
    add_label TEXT,     -- Label for add button in list editors
    user_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evolve schema for existing deployments
-- 1) Extend allowed types to include new complex types
ALTER TABLE graph_properties DROP CONSTRAINT IF EXISTS graph_properties_type_check;
ALTER TABLE graph_properties ADD CONSTRAINT graph_properties_type_check
  CHECK (type IN ('color','text','number','select','boolean','checkbox','radio','slider','object','object-list'));

-- 2) Add missing columns if they don't exist
ALTER TABLE graph_properties ADD COLUMN IF NOT EXISTS fields JSONB;
ALTER TABLE graph_properties ADD COLUMN IF NOT EXISTS item_fields JSONB;
ALTER TABLE graph_properties ADD COLUMN IF NOT EXISTS item_title TEXT;
ALTER TABLE graph_properties ADD COLUMN IF NOT EXISTS add_label TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_graph_nodes_user_id ON graph_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_state ON graph_nodes(state);
CREATE INDEX IF NOT EXISTS idx_graph_edges_user_id ON graph_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_graph_properties_user_id ON graph_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_properties_node_id ON graph_properties(node_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_graph_nodes_updated_at ON graph_nodes;
CREATE TRIGGER update_graph_nodes_updated_at
    BEFORE UPDATE ON graph_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_graph_properties_updated_at ON graph_properties;
CREATE TRIGGER update_graph_properties_updated_at
    BEFORE UPDATE ON graph_properties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_properties ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your authentication setup)
-- These policies assume you have a user_id field that matches authenticated users

-- Policies for graph_nodes
DROP POLICY IF EXISTS "Users can view their own nodes" ON graph_nodes;
CREATE POLICY "Users can view their own nodes" ON graph_nodes
    FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert their own nodes" ON graph_nodes;
CREATE POLICY "Users can insert their own nodes" ON graph_nodes
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update their own nodes" ON graph_nodes;
CREATE POLICY "Users can update their own nodes" ON graph_nodes
    FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete their own nodes" ON graph_nodes;
CREATE POLICY "Users can delete their own nodes" ON graph_nodes
    FOR DELETE USING (auth.uid()::text = user_id);

-- Policies for graph_edges
DROP POLICY IF EXISTS "Users can view their own edges" ON graph_edges;
CREATE POLICY "Users can view their own edges" ON graph_edges
    FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert their own edges" ON graph_edges;
CREATE POLICY "Users can insert their own edges" ON graph_edges
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update their own edges" ON graph_edges;
CREATE POLICY "Users can update their own edges" ON graph_edges
    FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete their own edges" ON graph_edges;
CREATE POLICY "Users can delete their own edges" ON graph_edges
    FOR DELETE USING (auth.uid()::text = user_id);

-- Policies for graph_properties
DROP POLICY IF EXISTS "Users can view their own properties" ON graph_properties;
CREATE POLICY "Users can view their own properties" ON graph_properties
    FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert their own properties" ON graph_properties;
CREATE POLICY "Users can insert their own properties" ON graph_properties
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update their own properties" ON graph_properties;
CREATE POLICY "Users can update their own properties" ON graph_properties
    FOR UPDATE USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete their own properties" ON graph_properties;
CREATE POLICY "Users can delete their own properties" ON graph_properties
    FOR DELETE USING (auth.uid()::text = user_id);

-- Enable Realtime for the tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'graph_nodes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.graph_nodes;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'graph_edges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.graph_edges;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'graph_properties'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.graph_properties;
  END IF;
END $$;

-- Create a function to get user graphs (optional helper)
CREATE OR REPLACE FUNCTION get_user_graph(p_user_id TEXT)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'nodes', COALESCE(nodes.data, '[]'::json),
        'edges', COALESCE(edges.data, '[]'::json)
    ) INTO result
    FROM (
        SELECT json_agg(
            json_build_object(
                'id', n.id,
                'title', n.title,
                'prompt', n.prompt,
                'state', n.state,
                'position', json_build_object('x', n.position_x, 'y', n.position_y),
                'width', n.width,
                'height', n.height,
                'built', n.built,
                'properties', COALESCE(props.data, '[]'::json)
            )
        ) as data
        FROM graph_nodes n
        LEFT JOIN (
            SELECT 
                node_id,
                json_agg(
                    json_build_object(
                        'id', id,
                        'name', name,
                        'type', type,
                        'value', value,
                        'options', options,
                        'fields', fields,
                        'item_fields', item_fields,
                        'item_title', item_title,
                        'add_label', add_label
                    )
                ) as data
            FROM graph_properties
            WHERE user_id = p_user_id
            GROUP BY node_id
        ) props ON n.id = props.node_id
        WHERE n.user_id = p_user_id
    ) nodes
    CROSS JOIN (
        SELECT json_agg(
            json_build_object(
                'id', id,
                'source', source_id,
                'target', target_id
            )
        ) as data
        FROM graph_edges
        WHERE user_id = p_user_id
    ) edges;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_graph(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO anon, authenticated;

-- Add comment for documentation
COMMENT ON TABLE graph_nodes IS 'Stores graph nodes with positions and properties';
COMMENT ON TABLE graph_edges IS 'Stores connections between graph nodes';
COMMENT ON TABLE graph_properties IS 'Stores configurable properties for graph nodes';
COMMENT ON FUNCTION get_user_graph(TEXT) IS 'Helper function to retrieve complete graph data for a user';
