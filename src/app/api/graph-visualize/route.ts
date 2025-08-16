// app/graph/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getGraphSession, loadGraphFromFile } from '../lib/graphStorage';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    
    // Get graph data
    let graph = getGraphSession();
    if (!graph) {
      try {
        await loadGraphFromFile();
        graph = getGraphSession();
      } catch (error) {
        console.log('ℹ️ No graph file found');
      }
    }
    
    if (!graph) {
      return NextResponse.json(
        { error: 'Graph not found' },
        { status: 404 }
      );
    }

    // Generate HTML visualization
    const html = generateGraphHTML(graph);
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error generating graph visualization:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateGraphHTML(graph: any): string {
  const nodes = graph.nodes || [];
  
  const nodeHTML = nodes.map((node: any) => `
    <div class="node" id="node-element-${node.id}" data-node-id="${node.id}">
      <div class="node-header">
        <h3>${node.title}</h3>
        <span class="node-kind">${node.kind}</span>
      </div>
      <div class="node-content">
        <div class="node-section">
          <strong>What:</strong> ${node.what}
        </div>
        <div class="node-section">
          <strong>How:</strong> ${node.how}
        </div>
        ${node.properties && node.properties.length > 0 ? `
          <div class="node-section">
            <strong>Properties:</strong>
            <ul>
              ${node.properties.map((prop: string) => `<li>${prop}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${node.children && node.children.length > 0 ? `
          <div class="node-section">
            <strong>Children:</strong>
            <ul>
              ${node.children.map((child: any) => `<li>${child.title}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Graph Visualization</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .nodes {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .node {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: all 0.2s ease;
        }
        .node:hover {
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
          transform: translateY(-2px);
        }
        .node-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #f0f0f0;
        }
        .node-header h3 {
          margin: 0;
          color: #333;
          font-size: 16px;
        }
        .node-kind {
          background: #007bff;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          text-transform: uppercase;
        }
        .node-content {
          font-size: 14px;
          line-height: 1.5;
        }
        .node-section {
          margin-bottom: 12px;
        }
        .node-section:last-child {
          margin-bottom: 0;
        }
        .node-section strong {
          color: #555;
          display: block;
          margin-bottom: 4px;
        }
        .node-section ul {
          margin: 4px 0;
          padding-left: 20px;
        }
        .node-section li {
          margin-bottom: 2px;
        }
        .title {
          text-align: center;
          margin-bottom: 30px;
          color: #333;
        }
        .title h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
        }
        .title p {
          margin: 8px 0 0 0;
          color: #666;
          font-size: 16px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">
          <h1>Project Graph Visualization</h1>
          <p>${nodes.length} nodes</p>
        </div>
        <div class="nodes">
          ${nodeHTML}
        </div>
      </div>
    </body>
    </html>
  `;
}
