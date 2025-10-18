import { type ShapeProps } from '.';

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

export default RoundRectangle;
