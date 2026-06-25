import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IconGripVertical, IconPlus, IconMaximize, IconUpload } from '@tabler/icons-react';
import { addHandDrawnPage, importPdf, importImage, getPagesSorted } from './whiteboard-helpers';

interface WhiteboardPageControlsProps {
  editor: any;
  isTeacher: boolean;
  isWritable?: boolean;
}

export default function WhiteboardPageControls({ editor, isTeacher, isWritable }: WhiteboardPageControlsProps) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const startOffsetRef = useRef({ x: 0, y: 0 });

  const [isImportingPdf, setIsImportingPdf] = useState(false);
  const [pdfImportProgress, setPdfImportProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setDragOffset({
        x: startOffsetRef.current.x + dx,
        y: startOffsetRef.current.y + dy,
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('label') || target.closest('input')) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    startOffsetRef.current = dragOffset;
    e.preventDefault();
  };

  const zoomToFitCurrentPage = useCallback(() => {
    if (!editor) return;
    const frames = getPagesSorted(editor);
    if (frames.length === 0) return;

    const viewport = editor.getViewportPageBounds();
    const viewportCenterY = viewport.y + viewport.height / 2;

    // Find the frame closest to the center Y of the viewport
    let closestFrame = frames[0];
    let minDistance = Infinity;

    for (const frame of frames) {
      const bounds = editor.getShapePageBounds(frame.id);
      if (!bounds) continue;
      const frameCenterY = bounds.y + bounds.height / 2;
      const distance = Math.abs(frameCenterY - viewportCenterY);
      if (distance < minDistance) {
        minDistance = distance;
        closestFrame = frame;
      }
    }

    const bounds = editor.getShapePageBounds(closestFrame.id);
    if (bounds) {
      editor.zoomToBounds(bounds, { animation: { duration: 220 } });
    }
  }, [editor]);

  const hasAccess = isTeacher || isWritable;
  if (!hasAccess || !editor) return null;

  return (
    <div 
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      className="absolute bottom-4 left-4 md:bottom-6 md:left-6 z-[999] flex items-center gap-3 bg-[#e4e4eb] border border-zinc-300 p-2 rounded-2xl shadow-md select-none"
    >
      <div 
        onPointerDown={handlePointerDown}
        style={{ touchAction: 'none' }}
        className="flex items-center gap-1.5 text-[11px] font-sans font-bold tracking-wider uppercase text-zinc-500 pl-1.5 pr-2.5 border-r border-zinc-300 h-6 select-none cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reposition"
      >
        <IconGripVertical className="w-3.5 h-3.5 text-zinc-400" />
        Pages
      </div>
      
      <button
        onClick={() => addHandDrawnPage(editor)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-50 text-zinc-950 rounded-xl text-xs font-semibold transition-all cursor-pointer font-sans border border-zinc-300 shadow-sm"
      >
        <IconPlus className="w-3.5 h-3.5 text-zinc-950" />
        Add Page
      </button>

      <button
        onClick={zoomToFitCurrentPage}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-50 text-zinc-950 rounded-xl text-xs font-semibold transition-all cursor-pointer font-sans border border-zinc-300 shadow-sm"
        title="Zoom to Fit Current Page"
      >
        <IconMaximize className="w-3.5 h-3.5 text-zinc-950" />
        Zoom to Fit
      </button>

      <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#3182ed] hover:bg-[#256ec7] text-white rounded-xl text-xs font-semibold transition-all border border-[#3182ed]/25 shadow-sm select-none ${isImportingPdf ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        {isImportingPdf ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>
              {pdfImportProgress.total > 0
                ? `Importing ${pdfImportProgress.current}/${pdfImportProgress.total}`
                : 'Importing...'}
            </span>
          </>
        ) : (
          <>
            <IconUpload className="w-3.5 h-3.5 text-white" />
            <span>Import PDF/Img</span>
          </>
        )}
        <input
          type="file"
          accept="application/pdf, image/*"
          disabled={isImportingPdf}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setIsImportingPdf(true);
            setPdfImportProgress({ current: 0, total: 0 });
            try {
              if (file.type === 'application/pdf') {
                await importPdf(editor, file, (current, total) => {
                  setPdfImportProgress({ current, total });
                });
              } else if (file.type.startsWith('image/')) {
                await importImage(editor, file);
              } else {
                alert('Unsupported file type. Please upload a PDF or an image.');
              }
            } catch (err) {
              console.error('Failed to import media:', err);
              alert('Failed to import media. Please check the file and try again.');
            } finally {
              setIsImportingPdf(false);
              e.target.value = '';
            }
          }}
        />
      </label>
    </div>
  );
}
