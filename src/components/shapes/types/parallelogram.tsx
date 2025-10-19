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
  indicatorPosition: {
    top: '32px',
    right: '48px',
  },
  handlePositions: {
    left: { top: '50%', left: '20px' },
    right: { top: '50%', right: '20px' },
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

export default Parallelogram;
