import { type ShapeProps, type ShapeConfig } from '.';

function Rectangle({ width, height, ...svgAttributes }: ShapeProps) {
  return (
    <rect
      width={width}
      height={height}
      {...svgAttributes}
    />
  );
}

export const rectangleConfig: ShapeConfig = {
  dimensions: {
    width: 260,
    height: 160,
  },
  zIndex: 0,
  contentPadding: {
    padding: '32px', // Standard rectangle
  },
  zIndex: 0,
  indicatorPosition: {
    top: '32px',
    right: '32px',
  },
  zIndex: 0,
  showStateIndicators: true,
  showHandles: true,
  fontSize: {
    title: 16,
    content: 13,
  },
  zIndex: 0,
  contentLayout: {
    clipOverflow: true,
    flexContent: true,
    maxDescriptionLines: 3,
  },
  zIndex: 0,
};

export default Rectangle;
