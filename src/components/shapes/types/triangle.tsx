import { type ShapeProps } from '.';
import { generatePath } from './utils';

function Triangle({ width, height, ...svgAttributes }: ShapeProps) {
  const trianglePath = generatePath([
    [width / 2, 0],
    [width, height],
    [0, height],
  ]);

  return <path d={trianglePath} {...svgAttributes} />;
}

export default Triangle;
