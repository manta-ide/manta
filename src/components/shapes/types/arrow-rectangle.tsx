import { type ShapeProps, type ShapeConfig } from '.';
import { generatePath } from './utils';

function ArrowRectangle({ width, height, ...svgAttributes }: ShapeProps) {
  const skew = width * 0.1;

  const arrowRectanglePath = generatePath([
    [0, 0],
    [width - skew, 0],
    [width, height / 2],
    [width - skew, height],
    [0, height],
  ]);

  return <path d={arrowRectanglePath} {...svgAttributes} />;
}

export const arrowRectangleConfig: ShapeConfig = {
  dimensions: {
    width: 240,
    height: 160,
  },
  zIndex: 0,
  contentPadding: {
    padding: '32px',
    paddingRight: '40px', // Arrow shape has point at right edge
  },
  zIndex: 0,
  indicatorPosition: {
    top: '32px',
    right: '40px',
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

export default ArrowRectangle;
