-- Supabase Database Schema for Graph Storage (state-only, no built flag)
-- Run this in Supabase SQL editor. It creates or migrates tables to rely only on `state`.

-- 1) Tables
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT DEFAULT '',
  state TEXT DEFAULT 'unbuilt' CHECK (state IN ('unbuilt', 'building', 'built')),
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  width REAL,
  height REAL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS graph_properties (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('color','text','textarea','number','select','boolean','checkbox','radio','slider','font','object','object-list')),
  value JSONB,
  options TEXT[],
  fields JSONB,
  item_fields JSONB,
  item_title TEXT,
  add_label TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure legacy CHECK constraints on graph_properties.type allow 'font'
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid = 'public.graph_properties'::regclass
  ) LOOP
    -- Drop any existing CHECK constraint to redefine it
    EXECUTE format('ALTER TABLE public.graph_properties DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
  -- Recreate a single CHECK constraint allowing the extended set including 'font'
  ALTER TABLE public.graph_properties
    ADD CONSTRAINT graph_properties_type_check
    CHECK (type IN ('color','text','textarea','number','select','boolean','checkbox','radio','slider','font','object','object-list'));
END $$;

-- 2) Migration: drop legacy built column and map any existing values into state
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'graph_nodes' AND column_name = 'built'
  ) THEN
    -- If built is true, ensure state is 'built' unless already 'building'
    UPDATE graph_nodes SET state = 'built' WHERE built = true AND state <> 'building';
    -- If built is false and state is NULL, default to 'unbuilt'
    UPDATE graph_nodes SET state = COALESCE(state, 'unbuilt') WHERE built = false;
    -- Finally drop the column
    ALTER TABLE graph_nodes DROP COLUMN built;
  END IF;
END $$;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_graph_nodes_user_id ON graph_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_state ON graph_nodes(state);
CREATE INDEX IF NOT EXISTS idx_graph_edges_user_id ON graph_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_graph_properties_user_id ON graph_properties(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_properties_node_id ON graph_properties(node_id);

-- 4) Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- 5) RLS
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_properties ENABLE ROW LEVEL SECURITY;

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

-- 6) Realtime publications
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

-- 7) Helper function without built flag
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
        'properties', COALESCE(props.data, '[]'::json)
      )
    ) as data
    FROM graph_nodes n
    LEFT JOIN (
      SELECT node_id,
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

-- 8) Grants and comments
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_graph(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO anon, authenticated;

COMMENT ON TABLE graph_nodes IS 'Stores graph nodes with positions and properties (state-only)';
COMMENT ON TABLE graph_edges IS 'Stores connections between graph nodes';
COMMENT ON TABLE graph_properties IS 'Stores configurable properties for graph nodes';
COMMENT ON FUNCTION get_user_graph(TEXT) IS 'Helper function to retrieve complete graph data for a user';

-- 9) CLI Jobs: queue and realtime
-- Jobs are provider-agnostic: job_name in ('run','terminate') and payload holds command details.

-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cli_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  job_name TEXT NOT NULL CHECK (job_name IN ('run','terminate')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  payload JSONB,
  priority INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

-- index to support ordering and filtering
CREATE INDEX IF NOT EXISTS idx_cli_jobs_status ON cli_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cli_jobs_user ON cli_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_cli_jobs_priority_created ON cli_jobs(priority DESC, created_at ASC);

-- trigger to maintain updated_at
DROP TRIGGER IF EXISTS update_cli_jobs_updated_at ON cli_jobs;
CREATE TRIGGER update_cli_jobs_updated_at
  BEFORE UPDATE ON cli_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for cli_jobs
ALTER TABLE cli_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own jobs" ON cli_jobs;
CREATE POLICY "Users can view their own jobs" ON cli_jobs
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert their own jobs" ON cli_jobs;
CREATE POLICY "Users can insert their own jobs" ON cli_jobs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update their own jobs" ON cli_jobs;
CREATE POLICY "Users can update their own jobs" ON cli_jobs
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Realtime publication for cli_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cli_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cli_jobs;
  END IF;
END $$;
