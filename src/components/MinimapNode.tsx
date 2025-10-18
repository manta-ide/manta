import { MiniMapNodeProps, useInternalNode } from '@xyflow/react';
import Shape from './shapes';

function MinimapNode({ id, width, height, x, y, selected }: MiniMapNodeProps) {
  const internalNode = useInternalNode(id);

  if (!internalNode) {
    return null;
  }

  const node = internalNode.internals.userNode;
  const shape = (node.data as any)?.node?.shape || 'rectangle';

  // Skip comment shapes for minimap (they're handled differently)
  if (shape === 'comment') {
    return null;
  }

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={
        selected
          ? 'react-flow__minimap-node selected'
          : 'react-flow__minimap-node'
      }
    >
      <Shape
        type={shape as any}
        width={width}
        height={height}
        fill={selected ? '#3b82f6' : '#6b7280'}
        stroke={selected ? '#2563eb' : '#374151'}
        strokeWidth={selected ? 2 : 1}
      />
    </g>
  );
}

export default MinimapNode;
