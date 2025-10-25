import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Node,
  useKeyPress,
  useReactFlow,
  getConnectedEdges,
  Edge,
  XYPosition,
  useStore,
  type KeyCode,
} from '@xyflow/react';
import { GraphNode } from '@/app/api/lib/schemas';
import { useProjectStore } from './store';

interface BufferedNode extends GraphNode {
  originalId: string;
  position?: { x: number; y: number; z?: number };
}

interface BufferedEdge extends Edge {
  originalSource: string;
  originalTarget: string;
}

export function useCopyPaste() {
  const mousePosRef = useRef<XYPosition>({ x: 0, y: 0 });
  const rfDomNode = useStore((state) => state.domNode);

  const { getNodes, setNodes, getEdges, setEdges, screenToFlowPosition } =
    useReactFlow();

  const {
    updateNode,
    setSelectedNode,
    setSelectedNodeIds,
    setOptimisticOperationsActive,
    graph,
  } = useProjectStore();

  // Generate unique node ID
  const generateNodeId = useCallback(() => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `node-${timestamp}${random}`;
  }, []);

  // Set up the paste buffers to store the copied nodes and edges.
  const [bufferedNodes, setBufferedNodes] = useState([] as BufferedNode[]);
  const [bufferedEdges, setBufferedEdges] = useState([] as BufferedEdge[]);

  // initialize the copy/paste hook
  // 1. remove native copy/paste/cut handlers
  // 2. add mouse move handler to keep track of the current mouse position
  useEffect(() => {
    const events = ['cut', 'copy', 'paste'];

    if (rfDomNode) {
      const preventDefault = (e: Event) => e.preventDefault();

      const onMouseMove = (event: MouseEvent) => {
        mousePosRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
      };

      rfDomNode.addEventListener('mousemove', onMouseMove);

      return () => {
        for (const event of events) {
          rfDomNode.removeEventListener(event, preventDefault);
        }

        rfDomNode.removeEventListener('mousemove', onMouseMove);
      };
    }
  }, [rfDomNode]);

  const copy = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    const selectedEdges = getConnectedEdges(selectedNodes, getEdges()).filter(
      (edge) => {
        const isExternalSource = selectedNodes.every(
          (n) => n.id !== edge.source,
        );
        const isExternalTarget = selectedNodes.every(
          (n) => n.id !== edge.target,
        );

        return !(isExternalSource || isExternalTarget);
      },
    );

    // Convert ReactFlow nodes back to GraphNodes for buffering
    const graphNodes: BufferedNode[] = selectedNodes.map(node => {
      const graphNode = node.data?.node as GraphNode;
      return {
        ...graphNode,
        originalId: graphNode.id,
      };
    });

    // Convert edges to buffered format
    const bufferedEdgesData: BufferedEdge[] = selectedEdges.map(edge => ({
      ...edge,
      originalSource: edge.source,
      originalTarget: edge.target,
    }));

    setBufferedNodes(graphNodes);
    setBufferedEdges(bufferedEdgesData);
  }, [getNodes, getEdges]);

  const cut = useCallback(async () => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    const selectedEdges = getConnectedEdges(selectedNodes, getEdges()).filter(
      (edge) => {
        const isExternalSource = selectedNodes.every(
          (n) => n.id !== edge.source,
        );
        const isExternalTarget = selectedNodes.every(
          (n) => n.id !== edge.target,
        );

        return !(isExternalSource || isExternalTarget);
      },
    );

    // Convert ReactFlow nodes back to GraphNodes for buffering
    const graphNodes: BufferedNode[] = selectedNodes.map(node => {
      const graphNode = node.data?.node as GraphNode;
      return {
        ...graphNode,
        originalId: graphNode.id,
      };
    });

    // Convert edges to buffered format
    const bufferedEdgesData: BufferedEdge[] = selectedEdges.map(edge => ({
      ...edge,
      originalSource: edge.source,
      originalTarget: edge.target,
    }));

    setBufferedNodes(graphNodes);
    setBufferedEdges(bufferedEdgesData);

    // Remove selected nodes and edges from the graph
    // This will trigger the delete logic that handles API persistence
    if (selectedNodes.length > 0 || selectedEdges.length > 0) {
      // Use the existing handleDeleteSelected function from GraphView
      const deleteEvent = new CustomEvent('manta:delete-selected', {
        detail: { selectedNodes, selectedEdges }
      });
      window.dispatchEvent(deleteEvent);
    }
  }, [getNodes, getEdges]);

  const paste = useCallback(
    async (
      { x: pasteX, y: pasteY } = screenToFlowPosition({
        x: mousePosRef.current.x,
        y: mousePosRef.current.y,
      }),
    ) => {
      if (bufferedNodes.length === 0) return;

      const now = Date.now();
      const idMap = new Map<string, string>();

      try {
        setOptimisticOperationsActive(true);

        // Create new GraphNodes with updated IDs (positions will be calculated by layout)
        const newGraphNodes: GraphNode[] = await Promise.all(
          bufferedNodes.map(async (node) => {
            const newId = generateNodeId();
            idMap.set(node.originalId, newId);

            const newNode: GraphNode = {
              ...node,
              id: newId,
            };

            return newNode;
          })
        );

        // Create new edges with updated IDs
        const newEdges: Edge[] = bufferedEdges.map((edge) => {
          const newId = `${edge.id}-${now}`;
          const newSource = idMap.get(edge.originalSource) || edge.originalSource;
          const newTarget = idMap.get(edge.originalTarget) || edge.originalTarget;

          return {
            ...edge,
            id: newId,
            source: newSource,
            target: newTarget,
          };
        });

        // Create Graph-compatible edges for the store
        const newGraphEdges = newEdges.map((edge, index) => {
          const originalEdge = bufferedEdges[index];
          const edgeShape = ((originalEdge?.data as any)?.shape === 'dotted' || (originalEdge?.data as any)?.shape === 'solid')
            ? (originalEdge.data as any).shape
            : ((originalEdge as any)?.shape === 'dotted' || (originalEdge as any)?.shape === 'solid')
              ? (originalEdge as any).shape
              : undefined;
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            role: (originalEdge as any).role || 'links-to',
            sourceHandle: edge.sourceHandle || undefined,
            targetHandle: edge.targetHandle || undefined,
            ...(edgeShape ? { shape: edgeShape } : {}),
          };
        });

        // Update local graph state immediately
        const updatedGraph = {
          ...graph,
          nodes: [...(graph?.nodes || []), ...newGraphNodes],
          edges: [...(graph?.edges || []), ...newGraphEdges],
        };
        useProjectStore.setState({ graph: updatedGraph });

        // Create ReactFlow nodes (positions will be recalculated by layout)
        const newReactFlowNodes: Node[] = newGraphNodes.map((node) => ({
          id: node.id,
          position: { x: 0, y: 0 }, // Temporary position, will be recalculated by layout
          data: {
            label: node.title,
            node: node,
            properties: node.properties || [],
            graph: updatedGraph,
            updateNode: updateNode,
          },
          type: 'custom',
          selected: true, // Select the newly pasted nodes
        }));

        // Update ReactFlow state
        setNodes((nodes) => [
          ...nodes.map((node) => ({ ...node, selected: false })), // Deselect existing nodes
          ...newReactFlowNodes,
        ]);

        setEdges((edges) => [
          ...edges.map((edge) => ({ ...edge, selected: false })), // Deselect existing edges
          ...newEdges,
        ]);

        // Update selection state
        const newNodeIds = newGraphNodes.map(n => n.id);
        setSelectedNodeIds(newNodeIds);
        if (newGraphNodes.length > 0) {
          setSelectedNode(newNodeIds[0], newGraphNodes[0]);
        }

        // Persist all new nodes to the server
        await Promise.all(
          newGraphNodes.map(async (node) => {
            try {
              await updateNode(node.id, node);
            } catch (e) {
              console.warn(`Failed to persist pasted node ${node.id}:`, e);
            }
          })
        );

        console.log('✅ Successfully pasted nodes and edges');

      } catch (error) {
        console.error('❌ Failed to paste:', error);
      } finally {
        setOptimisticOperationsActive(false);
      }
    },
    [bufferedNodes, bufferedEdges, screenToFlowPosition, setNodes, setEdges, updateNode, setSelectedNode, setSelectedNodeIds, setOptimisticOperationsActive, graph, generateNodeId],
  );

  useShortcut(['Meta+x', 'Control+x'], cut);
  useShortcut(['Meta+c', 'Control+c'], copy, true);
  useShortcut(['Meta+v', 'Control+v'], paste);

  return { cut, copy, paste, bufferedNodes, bufferedEdges };
}

function useShortcut(
  keyCode: KeyCode,
  callback: () => void,
  isCopyAction = false,
): void {
  const [didRun, setDidRun] = useState(false);

  const shouldRun = useKeyPress(keyCode, {
    // these flags are being used to keep the default browser behavior
    // within input fields and selected text on the page
    actInsideInputWithModifier: false,
    preventDefault: false,
  });

  useEffect(() => {
    // gets any selected text on the page
    const selection = window.getSelection()?.toString();

    // when copying, we only allow it if there is no selected text on the page
    // this is to keep the default browser behavior
    const allowCopy = isCopyAction ? !selection : true;

    if (shouldRun && !didRun && allowCopy) {
      callback();
      setDidRun(true);
    } else {
      setDidRun(shouldRun);
    }
  }, [shouldRun, didRun, callback, isCopyAction]);
}

export default useCopyPaste;
