'use client';

import React from 'react';
import { useProjectStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';

export default function SupabaseStatus() {
  const { supabaseConnected, graphConnected, graph, syncGraphToSupabase } = useProjectStore();
  const { user } = useAuth();

  // Add a refresh button for testing
  const handleRefreshConnection = () => {
    console.log('🔄 Manual connection refresh triggered');
    const store = useProjectStore.getState();
    if (user?.id) {
      // First disconnect to clear any stuck state
      store.disconnectFromGraphEvents();
      // Then reconnect after a brief delay
      setTimeout(() => {
        store.connectToGraphEvents(user.id);
      }, 1000);
    }
  };

  // Manual sync to Supabase
  const handleSyncToSupabase = async () => {
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      console.log('⚠️ No graph data to sync');
      return;
    }
    
    try {
      console.log('🔄 Manual sync to Supabase triggered');
      await syncGraphToSupabase(graph);
      console.log('✅ Manual sync completed');
    } catch (error) {
      console.error('❌ Manual sync failed:', error);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-zinc-800 text-white p-3 rounded-lg shadow-lg text-xs font-mono z-50">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${user?.id ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>User: {user?.id ? 'Authenticated' : 'Not authenticated'}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${supabaseConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>Supabase: {supabaseConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${graphConnected ? 'bg-green-500' : 'bg-gray-500'}`}></div>
          <span>Backend: {graphConnected ? 'Connected' : 'Fallback'}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${graph?.nodes?.length ? 'bg-blue-500' : 'bg-gray-500'}`}></div>
          <span>Graph: {graph?.nodes?.length || 0} nodes</span>
        </div>
        
        {user?.id && (
          <div className="text-zinc-400 text-[10px] mt-1">
            User ID: {user.id.slice(0, 8)}...
          </div>
        )}
        
        <div className="flex gap-1 mt-2">
          <button 
            onClick={handleRefreshConnection}
            className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-[10px]"
          >
            Reconnect
          </button>
          
          {supabaseConnected && graph?.nodes?.length && (
            <button 
              onClick={handleSyncToSupabase}
              className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-[10px]"
            >
              Sync to DB
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
