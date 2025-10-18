import { type ShapeProps } from '.';

function Cylinder({ width, height, ...svgAttributes }: ShapeProps) {
  const bend = height * 0.125;

  return (
    <path
      d={`M0,${bend}  L 0,${height - bend} A ${
        width / 2
      } ${bend} 0 1 0 ${width} ${height - bend} L ${width},${bend} A ${
        width / 2
      } ${bend} 0 1 1 0 ${bend} A ${
        width / 2
      } ${bend} 0 1 1 ${width} ${bend} A ${
        width / 2
      } ${bend} 0 1 1 0 ${bend} z`}
      {...svgAttributes}
    />
  );
}

export default Cylinder;
