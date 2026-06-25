'use client';

import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export default function Tooltip({ content, children, align = 'center', className = '' }: TooltipProps) {
  const alignClass = 
    align === 'left' ? 'left-0' :
    align === 'right' ? 'right-0' :
    'left-1/2 -translate-x-1/2';

  const arrowClass =
    align === 'left' ? 'left-4' :
    align === 'right' ? 'right-4' :
    'left-1/2 -translate-x-1/2';

  return (
    <div className={`relative group/tooltip flex items-center justify-center ${className}`}>
      {children}
      <div 
        className={`absolute bottom-full mb-3 ${alignClass} px-2.5 py-1 bg-[#1e2230]/95 backdrop-blur border border-white/10 text-white text-xs font-semibold rounded-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-all duration-75 scale-95 group-hover/tooltip:scale-100 origin-bottom whitespace-nowrap shadow-xl z-[999999] select-none font-sans`}
      >
        {content}
        <div className={`absolute top-full ${arrowClass} -mt-1 border-4 border-transparent border-t-[#1e2230]/95`} />
      </div>
    </div>
  );
}
