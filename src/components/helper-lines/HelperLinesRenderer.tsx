import { ReactFlowState, useStore } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { HelperLine } from './types';

const storeSelector = (state: ReactFlowState) => ({
  width: state.width,
  height: state.height,
  transform: state.transform,
});

export type HelperLinesProps = {
  horizontal?: HelperLine;
  vertical?: HelperLine;
};

const DEFAULT_COLOR = '#0041d0';

// a simple component to display the helper lines
// it puts a canvas on top of the React Flow pane and draws the lines using the canvas API
function HelperLinesRenderer({ horizontal, vertical }: HelperLinesProps) {
  const { width, height, transform } = useStore(storeSelector);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!ctx || !canvas) {
      return;
    }

    const dpi = window.devicePixelRatio;
    canvas.width = width * dpi;
    canvas.height = height * dpi;

    ctx.scale(dpi, dpi);
    ctx.strokeStyle = DEFAULT_COLOR;

    if (vertical) {
      // Set color of stroke to helper line color
      ctx.beginPath();

      if (vertical.anchorName === 'centerX') {
        // If we are snapping to the center of a node, we use a dashed line to visually differentiate it
        ctx.setLineDash([5, 5]);
      }
      ctx.strokeStyle = vertical.color || DEFAULT_COLOR;
      ctx.moveTo(vertical.position * transform[2] + transform[0], 0);
      ctx.lineTo(vertical.position * transform[2] + transform[0], height);
      ctx.stroke();
    }

    if (horizontal) {
      ctx.beginPath();

      if (horizontal.anchorName === 'centerY') {
        // If we are snapping to the center of a node, we use a dashed line to visually differentiate it
        ctx.setLineDash([5, 5]);
      }
      ctx.strokeStyle = horizontal.color || DEFAULT_COLOR;
      ctx.moveTo(0, horizontal.position * transform[2] + transform[1]);
      ctx.lineTo(width, horizontal.position * transform[2] + transform[1]);
      ctx.stroke();
    }
  }, [width, height, transform, horizontal, vertical]);

  return <canvas ref={canvasRef} className="react-flow__canvas" />;
}

export default HelperLinesRenderer;
