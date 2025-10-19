import { type ShapeProps, type ShapeConfig } from '.';

function Circle({ width, height, ...svgAttributes }: ShapeProps) {
  const radius = Math.min(width, height) / 2;

  return (
    <circle
      cx={width / 2}
      cy={height / 2}
      r={radius}
      {...svgAttributes}
    />
  );
}

export const circleConfig: ShapeConfig = {
  dimensions: {
    width: 200,
    height: 200,
  },
  contentPadding: {
    padding: '40px',
    paddingTop: '50px', // Extra top padding to push content lower
  },
  indicatorPosition: {
    top: '50px',
    right: '40px',
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
  zIndex: 0,
};

export default Circle;
