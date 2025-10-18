import { type ShapeProps } from '.';

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

export default Circle;
