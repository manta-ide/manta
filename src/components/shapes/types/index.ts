import { SVGAttributes, CSSProperties } from 'react';
import type { Node } from '@xyflow/react';

import Circle, { circleConfig } from './circle';
import RoundRectangle, { roundRectangleConfig } from './round-rectangle';
import Rectangle, { rectangleConfig } from './rectangle';
import Hexagon, { hexagonConfig } from './hexagon';
import Diamond, { diamondConfig } from './diamond';
import ArrowRectangle, { arrowRectangleConfig } from './arrow-rectangle';
import Cylinder, { cylinderConfig } from './cylinder';
import Parallelogram, { parallelogramConfig } from './parallelogram';
import Comment, { commentConfig } from './comment';

// here we register all the shapes that are available
// you can add your own here
export const ShapeComponents = {
  circle: Circle,
  'round-rectangle': RoundRectangle,
  rectangle: Rectangle,
  hexagon: Hexagon,
  diamond: Diamond,
  'arrow-rectangle': ArrowRectangle,
  cylinder: Cylinder,
  parallelogram: Parallelogram,
  comment: Comment,
};

export type ShapeType = keyof typeof ShapeComponents;

export type ShapeProps = {
  width: number;
  height: number;
} & SVGAttributes<SVGElement>;

export type ShapeComponentProps = Partial<ShapeProps> & { type: ShapeType };

export type ShapeNode = Node<{
  type: ShapeType;
  color: string;
}>;

// Shape configuration for layout and styling
export interface ShapeConfig {
  // Default dimensions for the shape (in pixels)
  dimensions: {
    width: number;
    height: number;
  };
  // Content padding to avoid shape edges (text, icons, etc.)
  contentPadding: CSSProperties;
  // Position for state indicators (unbuilt dot, ghosted badge, etc.)
  indicatorPosition: {
    top: string;
    right: string;
  };
  // Custom handle positions for connection points (if shape needs special positioning)
  handlePositions?: {
    left?: CSSProperties;
    right?: CSSProperties;
    top?: CSSProperties;
    bottom?: CSSProperties;
  };
  // Whether the shape is resizable (e.g., comment nodes)
  resizable?: boolean;
  // Custom font sizes for title and content (in pixels)
  fontSize?: {
    title?: number;
    content?: number;
  };
  // Whether to show state indicators (unbuilt dot)
  showStateIndicators?: boolean;
  // Whether to show connection handles
  showHandles?: boolean;
  // Content layout behavior
  contentLayout?: {
    // Whether to clip content overflow
    clipOverflow?: boolean;
    // Whether content should flex to fill available space
    flexContent?: boolean;
    // Maximum lines to show for description (null = no limit)
    maxDescriptionLines?: number | null;
  };
  // Fill color configuration
  fill?: {
    default?: string;
    selected?: string;
  };
  // Whether this shape supports markdown rendering
  supportsMarkdown?: boolean;
  // Z-index for layering (lower numbers appear behind)
  zIndex?: number;
}

// Registry of shape configurations
const ShapeConfigs: Record<ShapeType, ShapeConfig> = {
  circle: circleConfig,
  'round-rectangle': roundRectangleConfig,
  rectangle: rectangleConfig,
  hexagon: hexagonConfig,
  diamond: diamondConfig,
  'arrow-rectangle': arrowRectangleConfig,
  cylinder: cylinderConfig,
  parallelogram: parallelogramConfig,
  comment: commentConfig,
};

/**
 * Get the configuration for a specific shape type
 */
export function getShapeConfig(shapeType: ShapeType): ShapeConfig {
  return ShapeConfigs[shapeType];
}
