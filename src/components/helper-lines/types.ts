// Helper lines can either be 'horizontal' or 'vertical'.

import { Box, Node } from '@xyflow/react';

export type Orientation = 'horizontal' | 'vertical';

export type HelperLine = {
  // Used to filter out helper lines corresponding to the node being dragged
  node: Node;
  // We use it to check that the helper line is within the viewport.
  nodeBox: Box;
  // 0 for horizontal, 1 for vertical
  orientation: Orientation;
  // If orientation is 'horizontal', `position` holds the Y coordinate of the helper line.
  // (Might correspond to the top or bottom position of a node, or other anchors).
  // If orientation is 'vertical', `position` holds the X coordinate of the helper line.
  position: number;
  // Optional color for the helper line
  color?: string;
  anchorName: string;
};

// Given a node and/or its bounding box, an AnchorResolver retrieves the significant
// coordinate for helper lines. It can either be a X or Y coordinate.
// Whether it is a X or Y coordinate is then decided by `orientation` property in
// the `Anchor` type.
export type AnchorResolver = (node: Node, box: Box) => number;

export type Anchor = {
  orientation: Orientation;
  // The resolve function is used to retrieve the significant coordinate for the helper line.
  resolve: AnchorResolver;
};

export type AnchorMatch = {
  // The name of the anchor that matched, e.g. 'top', 'left', etc.
  anchorName: string;
  // The absolute position of the anchor on the dragged node in the canvas.
  sourcePosition: number;
  // The anchor object itself, which contains the orientation and resolve function.
  anchor: Anchor;
  // The helper line that matched the anchor.
  // This is used to retrieve the position of the helper line.
  line: HelperLine;
};

export type CandidateLine = {
  // The helper line that matched the anchor.
  line: HelperLine;
  // The distance between the anchor position and the helper line position.
  lineDist: number;
  // The distance between the node position and node that originated the helper line.
  nodeDist: number;
};
