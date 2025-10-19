import { type ShapeProps, type ShapeConfig } from '.';
import { generatePath } from './utils';

function Parallelogram({ width, height, ...svgAttributes }: ShapeProps) {
  const skew = width * 0.15;

  const parallelogramPath = generatePath([
    [skew, 0],
    [width, 0],
    [width - skew, height],
    [0, height],
  ]);

  return <path d={parallelogramPath} {...svgAttributes} />;
}

export const parallelogramConfig: ShapeConfig = {
  dimensions: {
    width: 260,
    height: 160,
  },
  zIndex: 0,
  contentPadding: {
    padding: '32px',
    paddingLeft: '48px',
    paddingRight: '48px', // Parallelogram has angled sides
  },
  zIndex: 0,
  indicatorPosition: {
    top: '32px',
    right: '48px',
  },
  zIndex: 0,
  handlePositions: {
    left: { top: '50%', left: '20px' },
    right: { top: '50%', right: '20px' },
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

export default Parallelogram;
