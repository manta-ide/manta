import { type ShapeProps, type ShapeConfig } from '.';
import { generatePath } from './utils';

function Diamond({ width, height, ...svgAttributes }: ShapeProps) {
  const diamondPath = generatePath([
    [0, height / 2],
    [width / 2, 0],
    [width, height / 2],
    [width / 2, height],
  ]);

  return <path d={diamondPath} {...svgAttributes} />;
}

export const diamondConfig: ShapeConfig = {
  dimensions: {
    width: 220,
    height: 180,
  },
  zIndex: 0,
  contentPadding: {
    padding: '48px',
    paddingLeft: '56px',
    paddingRight: '56px', // Diamond needs significant padding to avoid sharp corners at edges
  },
  indicatorPosition: {
    top: '48px',
    right: '56px',
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

export default Diamond;
