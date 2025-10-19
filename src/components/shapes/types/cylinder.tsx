import { type ShapeProps, type ShapeConfig } from '.';

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

export const cylinderConfig: ShapeConfig = {
  dimensions: {
    width: 200,
    height: 160,
  },
  zIndex: 0,
  contentPadding: {
    padding: '36px',
    paddingTop: '44px',
    paddingBottom: '32px', // Cylinder has curved sections at top/bottom, extra top padding
  },
  indicatorPosition: {
    top: '44px',
    right: '36px',
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

export default Cylinder;
