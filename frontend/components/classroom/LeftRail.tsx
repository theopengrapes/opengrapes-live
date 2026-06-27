'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Highlighter, 
  MousePointer, 
  Hand 
} from 'lucide-react';
import { 
  IconPencil, 
  IconEraser, 
  IconTypography, 
  IconSquare, 
  IconCircle, 
  IconArrowRight, 
  IconMinus, 
  IconTriangleSquareCircle,
  IconPlus, 
  IconMaximize, 
  IconUpload 
} from '@tabler/icons-react';
import { 
  DefaultColorStyle, 
  DefaultSizeStyle, 
  GeoShapeGeoStyle 
} from 'tldraw';
import { addHandDrawnPage, importPdf, importImage } from './whiteboard-helpers';
import Tooltip from './Tooltip';

interface LeftRailProps {
  editor: any;
  showWhiteboard: boolean;
  strokeWidth?: number;
  isTeacher?: boolean;
  /** Extra top padding (px) to clear an overlapping header. Defaults to 16 (py-4). */
  topPadding?: number;
  /** Extra bottom padding (px) to clear an overlapping footer. Defaults to 16 (py-4). */
  bottomPadding?: number;
}

interface ColorSwatch {
  key: 'black' | 'white' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'light-blue' | 'grey' | 'pink' | 'light-red';
  hex: string;
  name: string;
}

const PALETTE: ColorSwatch[] = [
  { key: 'black', hex: '#0D0D14', name: 'Black' },
  { key: 'white', hex: '#E8E8F0', name: 'White' },
  { key: 'red', hex: '#E5484D', name: 'Red' },
  { key: 'orange', hex: '#F5A623', name: 'Orange' },
  { key: 'yellow', hex: '#FFD60A', name: 'Yellow' },
  { key: 'green', hex: '#46A758', name: 'Green' },
  { key: 'blue', hex: '#0091FF', name: 'Blue' },
  { key: 'violet', hex: '#6E5FF0', name: 'Violet' },
  { key: 'light-blue', hex: '#87CEEB', name: 'Light Blue' },
  { key: 'grey', hex: '#8B8B8B', name: 'Grey' },
];

const HIGHLIGHTER_PALETTE: ColorSwatch[] = [
  { key: 'light-red', hex: '#FF4B91', name: 'Pink' },
  { key: 'white', hex: '#E8E8F0', name: 'White' },
  { key: 'red', hex: '#E5484D', name: 'Red' },
  { key: 'orange', hex: '#F5A623', name: 'Orange' },
  { key: 'yellow', hex: '#FFD60A', name: 'Yellow' },
  { key: 'green', hex: '#46A758', name: 'Green' },
  { key: 'blue', hex: '#0091FF', name: 'Blue' },
  { key: 'violet', hex: '#6E5FF0', name: 'Violet' },
  { key: 'light-blue', hex: '#87CEEB', name: 'Light Blue' },
  { key: 'grey', hex: '#8B8B8B', name: 'Grey' },
];

export default function LeftRail({ editor, showWhiteboard, strokeWidth = 1.5, isTeacher = false, topPadding, bottomPadding }: LeftRailProps) {
  // 1. Null Guard - render nothing if editor is null or whiteboard is hidden
  if (!editor || !showWhiteboard) return null;

  const [currentTool, setCurrentTool] = useState('select');
  const [activeColor, setActiveColor] = useState('black');
  const [activeSize, setActiveSize] = useState('m');

  // Keep Pen and Highlighter styles independent
  const [penColor, setPenColor] = useState('black');
  const [highlighterColor, setHighlighterColor] = useState('yellow');
  const [penSize, setPenSize] = useState('m');
  const [highlighterSize, setHighlighterSize] = useState('m');

  const [showPenSettings, setShowPenSettings] = useState(false);
  const [showShapesPopover, setShowShapesPopover] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const penButtonRef = useRef<HTMLButtonElement>(null);
  const highlighterButtonRef = useRef<HTMLButtonElement>(null);
  const shapesButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-close settings popovers when the user begins drawing a stroke on the canvas
  useEffect(() => {
    const handleEvent = (info: any) => {
      if (info.type === 'pointer' && info.name === 'pointer_down') {
        setShowPenSettings(false);
      }
    };
    editor.on('event', handleEvent);
    return () => {
      editor.off('event', handleEvent);
    };
  }, [editor]);

  // Set styling for drawing tools reactively when the tool changes
  useEffect(() => {
    if (currentTool === 'draw') {
      editor.setStyleForNextShapes(DefaultColorStyle, penColor);
      editor.setStyleForNextShapes(DefaultSizeStyle, penSize);
    } else if (currentTool === 'highlight') {
      editor.setStyleForNextShapes(DefaultColorStyle, highlighterColor);
      editor.setStyleForNextShapes(DefaultSizeStyle, highlighterSize);
    }
  }, [currentTool, editor, penColor, penSize, highlighterColor, highlighterSize]);

  // Sync tool and active styling state reactively from tldraw store
  useEffect(() => {
    const syncState = () => {
      setCurrentTool(editor.getCurrentToolId());
      setActiveColor(editor.getStyleForNextShape(DefaultColorStyle) || 'black');
      setActiveSize(editor.getStyleForNextShape(DefaultSizeStyle) || 'm');
    };

    syncState();

    const cleanup = editor.store.listen(syncState, { scope: 'session' });
    return () => cleanup();
  }, [editor]);

  // Handle clicking draw tools
  const handleToolClick = (toolId: string) => {
    // Close popovers if clicking a different tool
    if (toolId !== 'draw' && toolId !== 'highlight') {
      setShowPenSettings(false);
    }
    if (toolId !== 'geo' && toolId !== 'arrow' && toolId !== 'line') {
      setShowShapesPopover(false);
    }

    if (toolId === 'draw' || toolId === 'highlight') {
      const isAlreadyActive = currentTool === toolId;
      editor.setCurrentTool(toolId);
      if (isAlreadyActive) {
        setShowPenSettings(prev => !prev);
      } else {
        setShowPenSettings(true);
      }
    } else {
      editor.setCurrentTool(toolId);
    }
  };

  const handleSelectColor = (colorKey: string) => {
    editor.setStyleForNextShapes(DefaultColorStyle, colorKey);
    if (currentTool === 'draw') {
      setPenColor(colorKey);
    } else if (currentTool === 'highlight') {
      setHighlighterColor(colorKey);
    }
  };

  const handleSelectSize = (sizeKey: 's' | 'm' | 'l' | 'xl') => {
    editor.setStyleForNextShapes(DefaultSizeStyle, sizeKey);
    if (currentTool === 'draw') {
      setPenSize(sizeKey);
    } else if (currentTool === 'highlight') {
      setHighlighterSize(sizeKey);
    }
  };

  const handleSelectShape = (shapeType: 'rectangle' | 'ellipse' | 'arrow' | 'line') => {
    setShowShapesPopover(false);
    if (shapeType === 'rectangle') {
      editor.run(() => {
        editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle');
        editor.setCurrentTool('geo');
      });
    } else if (shapeType === 'ellipse') {
      editor.run(() => {
        editor.setStyleForNextShapes(GeoShapeGeoStyle, 'ellipse');
        editor.setCurrentTool('geo');
      });
    } else if (shapeType === 'arrow') {
      editor.setCurrentTool('arrow');
    } else if (shapeType === 'line') {
      editor.setCurrentTool('line');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      if (file.type === 'application/pdf') {
        await importPdf(editor, file, () => {});
      } else if (file.type.startsWith('image/')) {
        await importImage(editor, file);
      } else {
        alert('Unsupported file type. Please upload a PDF or an image.');
      }
    } catch (err) {
      console.error('Failed to import media:', err);
      alert('Failed to import media. Please try again.');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const isDrawActive = currentTool === 'draw';
  const isHighlightActive = currentTool === 'highlight';
  const isShapesActive = currentTool === 'geo' || currentTool === 'arrow' || currentTool === 'line';

  // Determine settings popover position anchor top value
  const getPopoverTopOffset = () => {
    if (isHighlightActive) return 'top-[132px]'; // Highlighter button offset
    return 'top-[92px]'; // Pen button offset
  };

  const currentPalette = currentTool === 'highlight' ? HIGHLIGHTER_PALETTE : PALETTE;

  return (
    <div
      className="row-start-2 col-start-1 w-[52px] shrink-0 h-full bg-surface border-r border-border flex flex-col justify-between select-none z-[110] relative"
      style={{ paddingTop: topPadding ?? 16, paddingBottom: bottomPadding ?? 16 }}
    >
      
      {/* SECTION A: Drawing Tools */}
      <div className="flex flex-col items-center gap-2.5">
        
        {/* Select / Cursor Tool */}
        <Tooltip content="Select (V)" align="left">
          <button
            onClick={() => handleToolClick('select')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              currentTool === 'select' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <MousePointer className="w-5 h-5" strokeWidth={strokeWidth} />
          </button>
        </Tooltip>

        {/* Hand / Pan Tool */}
        <Tooltip content="Pan (H)" align="left">
          <button
            onClick={() => handleToolClick('hand')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              currentTool === 'hand' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <Hand className="w-5 h-5" strokeWidth={strokeWidth} />
          </button>
        </Tooltip>

        {/* Pen Tool */}
        <Tooltip content="Pen (D)" align="left">
          <button
            ref={penButtonRef}
            onClick={() => handleToolClick('draw')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer relative ${
              isDrawActive ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <IconPencil className="w-5 h-5" strokeWidth={strokeWidth} />
            {/* Active color status indicator - only show when Pen is active */}
            {isDrawActive && (
              <div 
                className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-[#0d0d14]"
                style={{ backgroundColor: PALETTE.find(p => p.key === penColor)?.hex || '#000' }}
              />
            )}
          </button>
        </Tooltip>

        {/* Highlighter Tool */}
        <Tooltip content="Highlighter" align="left">
          <button
            ref={highlighterButtonRef}
            onClick={() => handleToolClick('highlight')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer relative ${
              isHighlightActive ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <Highlighter className="w-5 h-5" strokeWidth={strokeWidth} />
            {/* Active color status indicator - only show when Highlighter is active */}
            {isHighlightActive && (
              <div 
                className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-[#0d0d14]"
                style={{ backgroundColor: HIGHLIGHTER_PALETTE.find(p => p.key === highlighterColor)?.hex || '#000' }}
              />
            )}
          </button>
        </Tooltip>

        {/* Eraser Tool */}
        <Tooltip content="Eraser (E)" align="left">
          <button
            onClick={() => handleToolClick('eraser')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              currentTool === 'eraser' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <IconEraser className="w-5 h-5" strokeWidth={strokeWidth} />
          </button>
        </Tooltip>

        {/* Text Tool */}
        <Tooltip content="Text (T)" align="left">
          <button
            onClick={() => handleToolClick('text')}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              currentTool === 'text' ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <IconTypography className="w-5 h-5" strokeWidth={strokeWidth} />
          </button>
        </Tooltip>

        {/* Shapes popover trigger */}
        <Tooltip content="Shapes" align="left">
          <button
            ref={shapesButtonRef}
            onClick={() => {
              setShowPenSettings(false);
              setShowShapesPopover(prev => !prev);
            }}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isShapesActive ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:bg-surface-hi hover:text-text'
            }`}
          >
            <IconTriangleSquareCircle className="w-5 h-5" strokeWidth={strokeWidth} />
          </button>
        </Tooltip>

      </div>

      {/* SECTION B: Canvas Controls — Teacher only */}
      {isTeacher && (
        <div className="flex flex-col items-center gap-2.5 border-t border-border/40 pt-4">
          
          {/* Add Page */}
          <Tooltip content="Add Page" align="left">
            <button
              onClick={() => addHandDrawnPage(editor)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-hi hover:text-text transition-colors cursor-pointer"
            >
              <IconPlus className="w-5 h-5" strokeWidth={strokeWidth} />
            </button>
          </Tooltip>

          {/* Zoom to Fit */}
          <Tooltip content="Zoom to Fit" align="left">
            <button
              onClick={() => editor.zoomToFit()}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-hi hover:text-text transition-colors cursor-pointer"
            >
              <IconMaximize className="w-5 h-5" strokeWidth={strokeWidth} />
            </button>
          </Tooltip>

          {/* Import Image/PDF file */}
          <Tooltip content="Upload PDF/Image" align="left">
            <label className={`w-10 h-10 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-hi hover:text-text transition-colors select-none ${isImporting ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
              {isImporting ? (
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <IconUpload className="w-5 h-5" strokeWidth={strokeWidth} />
              )}
              <input
                type="file"
                accept="application/pdf, image/*"
                disabled={isImporting}
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </Tooltip>

        </div>
      )}

      {/* PEN / HIGHLIGHTER CONFIG POPUP */}
      {showPenSettings && (
        <div 
          className={`absolute left-14 ${getPopoverTopOffset()} w-64 bg-surface border border-border p-4 rounded-xl shadow-2xl z-30 flex flex-col gap-4 text-text animate-in fade-in slide-in-from-left-2 duration-150`}
        >
          {/* Color Palette */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted select-none">Color</span>
            <div className="grid grid-cols-5 gap-2">
              {currentPalette.map((c) => (
                <button
                  key={c.key}
                  onClick={() => handleSelectColor(c.key)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                    activeColor === c.key ? 'border-accent scale-105 shadow-md shadow-accent/20' : 'border-border hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {c.key === 'white' && activeColor === c.key && (
                    <span className="text-[#0d0d14] text-[10px]">✓</span>
                  )}
                  {c.key !== 'white' && activeColor === c.key && (
                    <span className="text-white text-[10px]">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Stroke Size presets S / M / L / XL */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted select-none font-sans">Size</span>
            <div className="flex items-center gap-2">
              {(['s', 'm', 'l', 'xl'] as const).map((sz) => {
                const label = sz.toUpperCase();
                // Visual dot size helper
                const dotSize = sz === 's' ? 'w-1 h-1' : sz === 'm' ? 'w-2 h-2' : sz === 'l' ? 'w-3 h-3' : 'w-4 h-4';
                return (
                  <button
                    key={sz}
                    onClick={() => handleSelectSize(sz)}
                    className={`flex-1 py-2 rounded-lg flex flex-col items-center justify-center gap-1.5 border text-[10px] font-bold font-sans transition-all cursor-pointer ${
                      activeSize === sz 
                        ? 'bg-accent/15 border-accent text-accent' 
                        : 'border-border hover:bg-surface-hi text-text-muted hover:text-text'
                    }`}
                  >
                    <div className={`${dotSize} rounded-full bg-current`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SHAPES SELECTOR POPUP */}
      {showShapesPopover && (
        <div className="absolute left-14 top-[248px] w-48 bg-surface border border-border p-2 rounded-xl shadow-2xl z-30 flex flex-col gap-1 text-text animate-in fade-in slide-in-from-left-2 duration-150">
          <div className="px-2 py-1 select-none border-b border-border/20 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Insert Shape</span>
          </div>
          
          <button
            onClick={() => handleSelectShape('rectangle')}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-hi text-left text-xs font-semibold cursor-pointer text-text"
          >
            <IconSquare className="w-4 h-4 text-text-muted" strokeWidth={strokeWidth} />
            <span>Rectangle</span>
          </button>
          
          <button
            onClick={() => handleSelectShape('ellipse')}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-hi text-left text-xs font-semibold cursor-pointer text-text"
          >
            <IconCircle className="w-4 h-4 text-text-muted" strokeWidth={strokeWidth} />
            <span>Circle</span>
          </button>
          
          <button
            onClick={() => handleSelectShape('arrow')}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-hi text-left text-xs font-semibold cursor-pointer text-text"
          >
            <IconArrowRight className="w-4 h-4 text-text-muted" strokeWidth={strokeWidth} />
            <span>Arrow</span>
          </button>
          
          <button
            onClick={() => handleSelectShape('line')}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-hi text-left text-xs font-semibold cursor-pointer text-text"
          >
            <IconMinus className="w-4 h-4 text-text-muted" strokeWidth={strokeWidth} />
            <span>Line</span>
          </button>
        </div>
      )}

    </div>
  );
}
