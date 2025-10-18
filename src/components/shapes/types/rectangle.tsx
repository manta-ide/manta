import { type ShapeProps } from '.';

function Rectangle({ width, height, ...svgAttributes }: ShapeProps) {
  return (
    <rect
      width={width}
      height={height}
      {...svgAttributes}
    />
  );
}

export default Rectangle;
