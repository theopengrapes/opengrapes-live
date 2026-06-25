'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ParticipantTile, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { IconX } from '@tabler/icons-react';

interface FloatingTeacherTileProps {
  teacherTrack: TrackReferenceOrPlaceholder | undefined;
  isFocusMode: boolean;
  showSplitLayout: boolean;
  isOverlayOpen?: boolean;
}

export default function FloatingTeacherTile({
  teacherTrack,
  isFocusMode,
  showSplitLayout,
  isOverlayOpen = false,
}: FloatingTeacherTileProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isVisible, setIsVisible] = useState(true);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const tileRef = useRef<HTMLDivElement>(null);

  const hasBeenPositioned = useRef(false);
  const hasMoved = useRef(false);

  // Reset visibility when focus mode becomes active
  useEffect(() => {
    if (isFocusMode) {
      setIsVisible(true);
    }
  }, [isFocusMode]);

  // Initialize teacher tile position to bottom right of viewport when it becomes active
  useEffect(() => {
    if (typeof window !== 'undefined' && isFocusMode && showSplitLayout && teacherTrack && !hasBeenPositioned.current) {
      const timer = setTimeout(() => {
        const tile = tileRef.current;
        const tileWidth = tile ? tile.offsetWidth : 256;
        const tileHeight = tile ? tile.offsetHeight : 144;
        setPosition({
          x: 24,
          y: window.innerHeight - tileHeight - 190,
        });
        hasBeenPositioned.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isFocusMode, showSplitLayout, !!teacherTrack]);

  // Adjust position on window resize to keep it in viewport
  useEffect(() => {
    const handleResize = () => {
      const tile = tileRef.current;
      if (!tile) return;
      const tileWidth = tile.offsetWidth;
      const tileHeight = tile.offsetHeight;
      
      setPosition((prev) => {
        const newX = Math.max(10, Math.min(prev.x, window.innerWidth - tileWidth - 10));
        const newY = Math.max(10, Math.min(prev.y, window.innerHeight - tileHeight - 170));
        return { x: newX, y: newY };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    hasMoved.current = false;
    const tile = tileRef.current;
    if (!tile) return;
    tile.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved.current = true;
    }
    
    let newX = dragRef.current.posX + dx;
    let newY = dragRef.current.posY + dy;
    
    const tile = tileRef.current;
    if (!tile) return;
    const tileWidth = tile.offsetWidth;
    const tileHeight = tile.offsetHeight;
    
    newX = Math.max(10, Math.min(newX, window.innerWidth - tileWidth - 10));
    newY = Math.max(10, Math.min(newY, window.innerHeight - tileHeight - 170));
    
    setPosition({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const tile = tileRef.current;
      if (tile) {
        tile.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
    }
  }, []);

  if (!isFocusMode || !showSplitLayout || !teacherTrack || !isVisible || isOverlayOpen) return null;

  return (
    <div
      ref={tileRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        if (hasMoved.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 250,
        touchAction: 'none',
      }}
      className="w-40 md:w-52 lg:w-64 aspect-video rounded-xl overflow-hidden border border-[#6366f1]/30 bg-[#111827]/80 backdrop-blur-md shadow-2xl cursor-grab active:cursor-grabbing select-none group floating-teacher-tile"
    >
      {/* Close button to hide tile temporarily */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(false);
        }}
        className="absolute top-2 right-2 z-30 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white flex items-center justify-center cursor-pointer transition-colors border border-white/10 opacity-0 group-hover:opacity-100 touch-visible"
        title="Hide tile"
      >
        <IconX className="w-3.5 h-3.5" />
      </button>

      <div className="w-full h-full pointer-events-none">
        <ParticipantTile trackRef={teacherTrack} className="w-full h-full" />
      </div>
    </div>
  );
}
