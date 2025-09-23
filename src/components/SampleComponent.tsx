import React from 'react';

interface SampleComponentProps {
  componentName?: string;
  backgroundColor?: string;
  width?: number;
  height?: number;
}

export default function SampleComponent({
  componentName = 'SampleComponent',
  backgroundColor = '#f0f0f0',
  width = 300,
  height = 200,
}: SampleComponentProps) {
  return (
    <div
      className="sample-component"
      style={{
        backgroundColor,
        width: `${width}px`,
        height: `${height}px`,
        border: '1px solid #ccc',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: 'bold',
      }}
    >
      {componentName}
    </div>
  );
}
