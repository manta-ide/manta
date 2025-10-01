import { Anchor } from './types';

// The radius in pixels within which the helper lines will snap to the dragged node.
export const SNAP_RADIUS = 10;

// The default anchors available to compute helper lines.
export const ANCHORS: Record<string, Anchor> = {
  top: { orientation: 'horizontal', resolve: (_, box) => box.y },
  bottom: {
    orientation: 'horizontal',
    resolve: (_, box) => box.y2,
  },
  left: { orientation: 'vertical', resolve: (_, box) => box.x },
  right: { orientation: 'vertical', resolve: (_, box) => box.x2 },

  // Center anchors are useful for snapping to the center of a node.
  // In most cases, you do not need them, but we are adding them here for completeness,
  // to show you how you can add more anchors.
  centerX: {
    orientation: 'vertical',
    resolve: (_, box) => (box.x + box.x2) / 2,
  },
  centerY: {
    orientation: 'horizontal',
    resolve: (_, box) => (box.y + box.y2) / 2,
  },
  // More anchor points can be added here!
};
