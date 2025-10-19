import { type ShapeProps, type ShapeConfig } from '.';

function Comment({ width, height, fill, stroke, strokeWidth, ...svgAttributes }: ShapeProps) {
  return (
    <rect
      width={width}
      height={height}
      rx={8}
      ry={8}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      {...svgAttributes}
    />
  );
}

export const commentConfig: ShapeConfig = {
  dimensions: {
    width: 300,
    height: 150,
  },
  contentPadding: {
    padding: '16px',
  },
  indicatorPosition: {
    top: '16px',
    right: '16px',
  },
  resizable: true,
  showStateIndicators: false, // Comments don't show state indicators
  showHandles: false, // Comments don't show connection handles
  fontSize: {
    title: 36,
    content: 24,
  },
  contentLayout: {
    clipOverflow: false, // Comments show all content
    flexContent: false, // Comments don't flex
    maxDescriptionLines: null, // No line limit
  },
  fill: {
    default: 'rgba(255, 255, 255, 0.8)',
    selected: 'rgba(255, 255, 255, 0.8)', // Same fill when selected
  },
  supportsMarkdown: true,
  zIndex: -1, // Comments render behind other shapes
};

export default Comment;

