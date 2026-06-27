import { useEffect, useRef } from 'react';
import { DefaultColorStyle, DefaultSizeStyle } from 'tldraw';
import { encodeStrokeMessage, STROKE_TOPIC } from '../lib/whiteboard/stroke-protocol';

interface UseStrokeCaptureProps {
  editor: any;
  localParticipant: any;
  isWritable: boolean;
  activeStrokeIdRef?: React.MutableRefObject<string | null>;
}

export function useStrokeCapture({
  editor,
  localParticipant,
  isWritable,
  activeStrokeIdRef,
}: UseStrokeCaptureProps) {
  const isDrawingRef = useRef(false);
  const strokeIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const pointsBufferRef = useRef<{ x: number; y: number; pressure: number; t: number }[]>([]);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastEraserSentTimeRef = useRef(0);

  useEffect(() => {
    if (!editor || !localParticipant || !isWritable) return;

    // Helper to send the currently accumulated batch of points
    const sendBatch = async () => {
      if (!isDrawingRef.current || !strokeIdRef.current || pointsBufferRef.current.length === 0) {
        return;
      }

      const pointsToSend = [...pointsBufferRef.current];
      // Clear the buffer
      pointsBufferRef.current = [];

      try {
        const payload = encodeStrokeMessage({
          type: 'STROKE_POINTS',
          strokeId: strokeIdRef.current,
          points: pointsToSend,
        });
        // Send lossily (unreliable) for maximum throughput and low latency
        await localParticipant.publishData(payload, { reliable: false, topic: STROKE_TOPIC });
      } catch (err) {
        console.error('[StrokeCapture] Failed to send stroke points batch:', err);
      }
    };

    // Animation frame loop to batch points at monitor refresh rate (~16ms)
    let animationFrameId: number;
    const tick = () => {
      sendBatch();
      animationFrameId = requestAnimationFrame(tick);
    };
    animationFrameId = requestAnimationFrame(tick);

    const handleEvent = (info: any) => {
      if (info.type !== 'pointer') return;

      const tool = editor.getCurrentToolId();
      const isDrawTool = tool === 'draw' || tool === 'highlight';
      const isEraserTool = tool === 'eraser';

      // If they switch to a select/shape tool, make sure we clean up the stroke
      if (!isDrawTool && !isEraserTool) {
        if (isDrawingRef.current) {
          endStroke();
        }
        return;
      }

      const point = editor.inputs.currentPagePoint;

      if (info.name === 'pointer_down') {
        isDrawingRef.current = true;
        startTimeRef.current = Date.now();
        lastPointRef.current = { x: point.x, y: point.y };

        if (isDrawTool) {
          strokeIdRef.current = activeStrokeIdRef?.current ?? `${localParticipant.identity}-${Date.now()}`;
          const color = editor.getStyleForNextShape(DefaultColorStyle);
          const size = editor.getStyleForNextShape(DefaultSizeStyle);
          // Highlight tool uses semi-transparency; draw uses opaque
          const opacity = tool === 'highlight' ? '0.35' : '1.0';
          const pressure = editor.inputs.pointerInfo?.pressure ?? 0.5;

          const startPoint = { x: point.x, y: point.y, pressure, t: 0 };
          pointsBufferRef.current = [startPoint];

          // Send STROKE_START reliably so viewers are guaranteed to initialize the stroke
          const payload = encodeStrokeMessage({
            type: 'STROKE_START',
            strokeId: strokeIdRef.current,
            pageId: editor.getCurrentPageId(),
            tool: tool as 'draw' | 'highlight',
            color,
            size,
            opacity,
            point: startPoint,
          });

          localParticipant.publishData(payload, { reliable: true, topic: STROKE_TOPIC }).catch((err: any) => {
            console.error('[StrokeCapture] Failed to send STROKE_START:', err);
          });
        }
      } 
      
      else if (info.name === 'pointer_move') {
        if (!isDrawingRef.current) return;

        // Apply dead-zone filter: ignore micro-movements (< 1.5px) to reduce packet rates
        if (lastPointRef.current) {
          const dx = point.x - lastPointRef.current.x;
          const dy = point.y - lastPointRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1.5) return;
        }

        lastPointRef.current = { x: point.x, y: point.y };

        if (isDrawTool && strokeIdRef.current) {
          const pressure = editor.inputs.pointerInfo?.pressure ?? 0.5;
          const t = Date.now() - startTimeRef.current;
          pointsBufferRef.current.push({ x: point.x, y: point.y, pressure, t });
        } 
        
        else if (isEraserTool) {
          const now = Date.now();
          if (now - lastEraserSentTimeRef.current < 25) { // Throttle eraser moves to 40Hz
            return;
          }
          lastEraserSentTimeRef.current = now;

          // Stream eraser move events lossily
          const payload = encodeStrokeMessage({
            type: 'ERASER_MOVE',
            userId: localParticipant.identity,
            userName: localParticipant.name || localParticipant.identity,
            pageId: editor.getCurrentPageId(),
            x: point.x,
            y: point.y,
            size: 10, // Default page-space eraser radius
          });
          localParticipant.publishData(payload, { reliable: false, topic: STROKE_TOPIC }).catch((err: any) => {
            console.error('[StrokeCapture] Failed to send ERASER_MOVE:', err);
          });
        }
      } 
      
      else if (info.name === 'pointer_up') {
        endStroke();
      }
    };

    const endStroke = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (strokeIdRef.current) {
        // Send any remaining buffered points first
        sendBatch();

        // Send STROKE_END reliably so viewers know they can start fading it out
        const payload = encodeStrokeMessage({
          type: 'STROKE_END',
          strokeId: strokeIdRef.current,
        });

        localParticipant.publishData(payload, { reliable: true, topic: STROKE_TOPIC }).catch((err: any) => {
          console.error('[StrokeCapture] Failed to send STROKE_END:', err);
        });

        strokeIdRef.current = null;
        if (activeStrokeIdRef) {
          activeStrokeIdRef.current = null;
        }
      }
      lastPointRef.current = null;
    };

    editor.on('event', handleEvent);

    return () => {
      cancelAnimationFrame(animationFrameId);
      editor.off('event', handleEvent);
      if (isDrawingRef.current) {
        endStroke();
      }
    };
  }, [editor, localParticipant, isWritable, activeStrokeIdRef]);
}
