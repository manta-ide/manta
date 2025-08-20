import { NextRequest, NextResponse } from 'next/server';
import { Message, MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';
import { fetchUnbuiltNodeIdsFromApi } from '@/app/api/lib/graphApiUtils';

const RequestSchema = z.object({
  userMessage: MessageSchema,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userMessage } = RequestSchema.parse(body);

    if (!userMessage) {
      return NextResponse.json({ error: 'userMessage is required' }, { status: 400 });
    }

    // First, use the graph editor agent
    const graphEditorResponse = await fetch(`${req.nextUrl.origin}/api/agents/graph-editor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userMessage,
        selectedNodeId: userMessage.variables?.SELECTED_NODE_ID,
        selectedNodeTitle: userMessage.variables?.SELECTED_NODE_TITLE,
        selectedNodePrompt: userMessage.variables?.SELECTED_NODE_PROMPT
      }),
    });

    if (!graphEditorResponse.ok) {
      return NextResponse.json({ error: 'Failed to process graph editor request' }, { status: 500 });
    }

    const graphEditorResult = await graphEditorResponse.json();
    const finalGraph = JSON.stringify(graphEditorResult.finalGraph);
    
    // Check if the graph was modified
    if (graphEditorResult.graphModified) {
      console.log('🔄 Graph was modified, checking for unbuilt nodes...');
      
      console.log('Graph editor result:', finalGraph);
      // Get unbuilt node IDs from API
      const unbuiltNodeIds = await fetchUnbuiltNodeIdsFromApi(req);
      
      if (unbuiltNodeIds.length > 0) {
        console.log(`🔄 Found ${unbuiltNodeIds.length} unbuilt nodes, calling code editor...`);
        
        // Call the code editor to generate code for unbuilt nodes
        const codeEditorResponse = await fetch(`${req.nextUrl.origin}/api/agents/code-editor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userMessage: {
              ...userMessage,
              content: `Generate code for the ${unbuiltNodeIds.length} unbuilt nodes in the graph.`
            }
          }),
        });

        if (!codeEditorResponse.ok) {
          console.warn('⚠️ Code editor failed, but graph editor succeeded');
          return NextResponse.json({
            ...graphEditorResult,
            codeGenerationFailed: true,
            message: 'Graph was updated but code generation failed'
          });
        }

        const codeEditorResult = await codeEditorResponse.json();
        
        return NextResponse.json({
          ...graphEditorResult,
          codeGeneration: codeEditorResult,
          message: 'Graph updated and code generated successfully'
        });
      } else {
        console.log('ℹ️ No unbuilt nodes found after graph modification');
        return NextResponse.json({
          ...graphEditorResult,
          message: 'Graph was updated but no code generation was needed'
        });
      }
    } else {
      console.log('ℹ️ Graph was not modified, no code generation needed');
      return NextResponse.json(graphEditorResult);
    }
  } catch (error) {
    console.error('❌ Agent request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
