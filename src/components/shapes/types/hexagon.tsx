import { type ShapeProps, type ShapeConfig } from '.';
import { generatePath } from './utils';

function Hexagon({ width, height, ...svgAttributes }: ShapeProps) {
  const skew = width * 0.1;

  const hexagonPath = generatePath([
    [0, height / 2],
    [skew, 0],
    [width - skew, 0],
    [width, height / 2],
    [width - skew, height],
    [skew, height],
  ]);

  return <path d={hexagonPath} {...svgAttributes} />;
}

export const hexagonConfig: ShapeConfig = {
  dimensions: {
    width: 240,
    height: 160,
  },
  contentPadding: {
    padding: '32px', // Hexagon has angled sides at top/bottom
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
  zIndex: 0,
};

export default Hexagon;
