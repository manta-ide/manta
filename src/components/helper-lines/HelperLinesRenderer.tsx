import { useViewport } from '@xyflow/react';
import { HelperLine } from './types';

export type HelperLinesProps = {
  horizontal?: HelperLine;
  vertical?: HelperLine;
};

const DEFAULT_COLOR = '#0041d0';

// a simple component to display the helper lines
// uses SVG overlay positioned over the React Flow pane
function HelperLinesRenderer({ horizontal, vertical }: HelperLinesProps) {
  const viewport = useViewport();

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 100
      }}
    >
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
        {vertical && (
          <line
            x1={vertical.position}
            y1={-10000} // Extend far beyond viewport
            x2={vertical.position}
            y2={10000}
            stroke={vertical.color || DEFAULT_COLOR}
            strokeWidth={1 / viewport.zoom} // Keep constant width regardless of zoom
            strokeDasharray={vertical.anchorName === 'centerX' ? '5,5' : undefined}
          />
        )}
        {horizontal && (
          <line
            x1={-10000} // Extend far beyond viewport
            y1={horizontal.position}
            x2={10000}
            y2={horizontal.position}
            stroke={horizontal.color || DEFAULT_COLOR}
            strokeWidth={1 / viewport.zoom} // Keep constant width regardless of zoom
            strokeDasharray={horizontal.anchorName === 'centerY' ? '5,5' : undefined}
          />
        )}
      </g>
    </svg>
  );
}

export default HelperLinesRenderer;
