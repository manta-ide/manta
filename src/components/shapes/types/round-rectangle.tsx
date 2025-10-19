import { type ShapeProps, type ShapeConfig } from '.';

function RoundRectangle({ width, height, ...svgAttributes }: ShapeProps) {
  const radius = Math.min(width, height) * 0.1;

  return (
    <rect
      width={width}
      height={height}
      rx={radius}
      ry={radius}
      {...svgAttributes}
    />
  );
}

export const roundRectangleConfig: ShapeConfig = {
  dimensions: {
    width: 260,
    height: 160,
  },
  zIndex: 0,
  contentPadding: {
    padding: '32px', // Round rectangle has rounded corners
  },
  indicatorPosition: {
    top: '32px',
    right: '32px',
  },
  showStateIndicators: true,
  showHandles: true,
  fontSize: {
    title: 16,
    content: 13,
  },
  contentLayout: {
    clipOverflow: true,
    flexContent: true,
    maxDescriptionLines: 3,
  },
};

export default RoundRectangle;
