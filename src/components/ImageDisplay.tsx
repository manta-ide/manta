'use client';

import { useState } from 'react';
import { useProjectStore } from '@/lib/store';
import { Download, Eye, Maximize, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
}

export default function ImageDisplay({ isOpen, onClose, width = 320 }: ImageDisplayProps) {
  const { lastGeneratedImage } = useProjectStore();
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!lastGeneratedImage?.data) return;

    // Convert base64 to blob and download
    const byteCharacters = atob(lastGeneratedImage.data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: lastGeneratedImage.mimeType || 'image/png' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="bg-zinc-900 border-l border-zinc-700 flex flex-col flex-shrink-0"
      style={{ width: `${width}px` }}
    >
      {/* Image Display */}
      <div className="flex-1 overflow-hidden relative">
        {lastGeneratedImage?.data ? (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={`data:${lastGeneratedImage.mimeType || 'image/png'};base64,${lastGeneratedImage.data}`}
              alt="Generated image"
              className="max-w-full max-h-full object-contain"
            />
            {/* Button overlays */}
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                className="bg-zinc-800/80 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 backdrop-blur-sm"
                title="Download image"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => setIsFullScreen(true)}
                variant="outline"
                size="sm"
                className="bg-zinc-800/80 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 backdrop-blur-sm"
                title="View full screen"
              >
                <Maximize className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 p-3">
            <Eye className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-xs text-center">No image generated yet</p>
            <p className="text-xs text-center mt-1 opacity-75">Generate an image to see it here</p>
          </div>
        )}
      </div>

      {/* Full screen overlay */}
      {isFullScreen && lastGeneratedImage?.data && (
        <div
          className="fixed inset-0 bg-black/90 z-[10000] flex items-center justify-center cursor-pointer"
          onClick={() => setIsFullScreen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setIsFullScreen(false)}
            className="absolute top-4 right-4 bg-black/70 text-white border-0 rounded-lg p-2 cursor-pointer hover:bg-black/80 transition-colors"
            title="Close full screen"
          >
            <X size={24} />
          </button>

          {/* Full screen image */}
          <img
            src={`data:${lastGeneratedImage.mimeType || 'image/png'};base64,${lastGeneratedImage.data}`}
            alt="Full screen preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the image
          />
        </div>
      )}
    </div>
  );
}
