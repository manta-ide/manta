import {
  Box,
  Node,
  useNodesInitialized,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import {
  NodeChange,
  NodeDimensionChange,
  NodePositionChange,
  nodeToBox,
} from '@xyflow/system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import HelperLinesRenderer from './HelperLinesRenderer';
import { HelperLine } from './types';
import {
  buildHelperLines,
  getHelperLines,
  snapToHelperLines,
  SpatialIndex,
} from './utils';
import { ANCHORS } from './config';

// =============== Main Hook ===============

export function useHelperLines() {
  const [helperLineHorizontal, setHelperLineHorizontal] = useState<
    HelperLine | undefined
  >(undefined);
  const [helperLineVertical, setHelperLineVertical] = useState<
    HelperLine | undefined
  >(undefined);

  const { width, height } = useStore(
    (state) => ({ width: state.width, height: state.height }),
    shallow,
  );

  const nodesInitialized = useNodesInitialized();
  const { getNodes } = useReactFlow();

  const spatialIndexRef = useRef<SpatialIndex>(new SpatialIndex());

  const { screenToFlowPosition, getInternalNode } = useReactFlow();

  const resetHelperLines = useCallback(() => {
    setHelperLineHorizontal(undefined);
    setHelperLineVertical(undefined);
  }, []);

  const rebuildIndex = useCallback(
    (nodes: Node[]) => {
      resetHelperLines();
      const helperLines = buildHelperLines(nodes, ANCHORS, getInternalNode);
      spatialIndexRef.current.initialize(helperLines);
    },
    [getInternalNode, resetHelperLines],
  );

  // Rebuild the spatial index when nodes are initialized
  useEffect(() => {
    if (nodesInitialized) {
      rebuildIndex(getNodes());
    }
  }, [nodesInitialized, rebuildIndex, getNodes]);

  const updateHelperLines = useCallback(
    (changes: NodeChange[], nodes: Node[]): NodeChange[] => {
      // We only want to consider three possible cases:
      // 1. A single node is being dragged (position change)
      // 2. A node is being resized from a bottom or right corner (dimensions change)
      // 3. A node is being resized from a top or left corner (position and dimensions change)
      if (
        !spatialIndexRef.current ||
        changes.length === 0 ||
        changes.length > 2 ||
        !nodes ||
        nodes.length === 0
      ) {
        return changes;
      }

      resetHelperLines();

      let positionChange: NodePositionChange | undefined;
      let dimensionChange: NodeDimensionChange | undefined;
      let anchors: (keyof typeof ANCHORS)[] = Object.keys(ANCHORS);

      if (changes.length === 1) {
        // If we have a single change, it can be either a position or dimensions change
        if (changes[0].type === 'position') {
          // The node is being dragged, thus we can use all anchors for the helper lines
          positionChange = changes[0] as NodePositionChange;
        } else if (changes[0].type === 'dimensions') {
          // The node is being resized from a bottom or right corner
          dimensionChange = changes[0] as NodeDimensionChange;
          anchors = ['right', 'bottom'];
        }
      } else {
        // If we have two changes, and we are resizing a node, one must be position and the other dimensions
        // This means the node is being resized from a top or left corner.

        if (
          changes[0].type === 'position' &&
          changes[1].type === 'dimensions' &&
          changes[1].dimensions
        ) {
          positionChange = changes[0] as NodePositionChange;
          dimensionChange = changes[1] as NodeDimensionChange;
          anchors = ['top', 'left'];
        }
      }

      const node = nodes.find(
        (node) => node.id === (changes[0] as NodePositionChange).id,
      );

      if (!node) {
        return changes;
      }

      const internalNode = getInternalNode(node.id);

      if (!internalNode) {
        // If internal node is not found, skip helper lines processing
        // This can happen during node updates or graph rebuilds
        return changes;
      }

      const parentNode = getInternalNode(internalNode.parentId ?? '');

      const nodeBounds: Box = nodeToBox(internalNode);

      if (dimensionChange?.dimensions) {
        nodeBounds.x2 = nodeBounds.x + dimensionChange.dimensions.width;
        nodeBounds.y2 = nodeBounds.y + dimensionChange.dimensions.height;
      }

      const { x, y } = screenToFlowPosition({
        x: 0,
        y: 0,
      });
      const { x: x2, y: y2 } = screenToFlowPosition({
        x: width,
        y: height,
      });

      const viewportBox: Box = { x, y, x2, y2 };

      // Compute the best two helper lines for the node
      const { horizontal: hMatch, vertical: vMatch } = getHelperLines(
        spatialIndexRef.current,
        viewportBox,
        node,
        nodeBounds,
        anchors,
      );

      // We need to copy the position change to avoid mutating the original change object
      // This is important to ensure that the original change object is not mutated, and
      // returned as is if no snapping occurs.
      const snapChange: NodePositionChange = {
        id: node.id,
        type: 'position',
        position: {
          x: internalNode.internals.positionAbsolute.x,
          y: internalNode.internals.positionAbsolute.y,
        },
        dragging: false,
      };

      if (positionChange?.position && snapChange.position) {
        // If we are dragging a node, we can snap the node to the helper line position
        // This is being done by manipulating the node position inside the change object
        // It is also important to ensure that, if the node is a child of another group node (Subflows),
        // the position change we consider to be adjusted (`snapChange`) is absolute,
        // while the original `positionChange` is relative to the node's position.
        if (parentNode) {
          snapChange.position.x =
            positionChange.position.x + (parentNode?.position?.x ?? 0);
          snapChange.position.y =
            positionChange.position.y + (parentNode?.position?.y ?? 0);
        } else {
          snapChange.position.x = positionChange.position.x;
          snapChange.position.y = positionChange.position.y;
        }
      }

      const { snappedX, snappedY } = snapToHelperLines(
        node,
        internalNode,
        snapChange,
        positionChange,
        dimensionChange,
        parentNode,
        hMatch,
        vMatch,
      );

      if (snappedX || snappedY) {
        if (dimensionChange?.resizing || positionChange?.dragging) {
          if (snappedX) setHelperLineVertical(vMatch?.line);
          if (snappedY) setHelperLineHorizontal(hMatch?.line);
        }

        if (dimensionChange && positionChange) {
          return [snapChange, dimensionChange];
        }
        if (positionChange) {
          return [snapChange];
        }
        if (dimensionChange) {
          return [dimensionChange];
        }
      }

      return changes;
    },
    [
      screenToFlowPosition,
      getInternalNode,
      width,
      height,
      setHelperLineHorizontal,
      setHelperLineVertical,
      resetHelperLines,
    ],
  );

  const HelperLines = useCallback(() => {
    try {
      return (
        <HelperLinesRenderer
          horizontal={helperLineHorizontal}
          vertical={helperLineVertical}
        />
      );
    } catch (error) {
      // If helper lines rendering fails, don't crash the entire graph view
      console.warn('Helper lines rendering failed:', error);
      return null;
    }
  }, [helperLineHorizontal, helperLineVertical]);

  return {
    rebuildIndex,
    updateHelperLines,
    helperLineHorizontal,
    helperLineVertical,
    HelperLines,
  };
}
