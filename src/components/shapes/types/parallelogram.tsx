import { type ShapeProps } from '.';
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

export default Parallelogram;
