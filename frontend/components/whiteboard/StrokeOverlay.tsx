import React, { useEffect, useRef } from 'react';
import { decodeStrokeMessage, STROKE_TOPIC, StrokePoint } from '../../lib/whiteboard/stroke-protocol';
import {
  Point,
  drawCatmullRom,
  updateStrokePlayout,
  getBaseWidth,
  TLDRAW_COLORS,
} from '../../lib/whiteboard/stroke-smoothing';

interface StrokeOverlayProps {
  editor: any;
  room: any;
  localParticipant: any;
}

interface ActiveStroke {
  strokeId: string;
  pageId: string;
  tool: 'draw' | 'highlight';
  color: string;
  size: string;
  opacity: string;
  rawPoints: StrokePoint[];
  startTime: number;
  ended: boolean;
  endTime: number | null;
  bufferDelay: number;
  skipFade?: boolean;
}

interface ActiveEraser {
  userId: string;
  userName: string;
  pageId: string;
  x: number;
  y: number;
  size: number;
  lastActive: number;
}

interface RemoteCursor {
  userId: string;
  userName: string;
  targetX?: number;
  targetY?: number;
  x?: number;
  y?: number;
  color: string;
  lastSeen: number;
  numWriters: number;
  pageId: string;
  role?: 'teacher' | 'student';
}

/** Assigned colors per participant identity (deterministic, cycles through palette) */
const CURSOR_COLORS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
];

function getColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

const PLAYOUT_DELAY_MS = 80;
const CURSOR_TIMEOUT_MS = 500;

export default function StrokeOverlay({ editor, room, localParticipant }: StrokeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Map<string, ActiveStroke>>(new Map());
  const erasersRef = useRef<Map<string, ActiveEraser>>(new Map());
  const cursorsRef = useRef<Map<string, RemoteCursor>>(new Map());
  const lastFrameTimeRef = useRef<number>(0);

  // ─── Subscribe to LiveKit data events ──────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (
      payload: Uint8Array,
      participant: any,
      _kind: any,
      topic?: string
    ) => {
      if (topic !== STROKE_TOPIC) return;
      if (participant?.identity === localParticipant?.identity) return;

      const msg = decodeStrokeMessage(payload);
      if (!msg) return;

      const now = Date.now();

      if (msg.type === 'CURSOR_MOVE') {
        if (msg.pageId !== editor?.getCurrentPageId()) {
          cursorsRef.current.delete(msg.userId);
          return;
        }

        const existing = cursorsRef.current.get(msg.userId);
        if (existing) {
          existing.targetX = msg.x;
          existing.targetY = msg.y;
          existing.lastSeen = now;
          existing.numWriters = msg.numWriters;
          existing.userName = msg.userName;
          existing.role = msg.role;
        } else {
          cursorsRef.current.set(msg.userId, {
            userId: msg.userId,
            userName: msg.userName,
            targetX: msg.x,
            targetY: msg.y,
            x: msg.x,
            y: msg.y,
            color: getColorForId(msg.userId),
            lastSeen: now,
            numWriters: msg.numWriters,
            pageId: msg.pageId,
            role: msg.role,
          });
        }
      }

      else if (msg.type === 'STROKE_START') {
        strokesRef.current.set(msg.strokeId, {
          strokeId: msg.strokeId,
          pageId: msg.pageId,
          tool: msg.tool,
          color: msg.color,
          size: msg.size,
          opacity: msg.opacity,
          rawPoints: [msg.point],
          startTime: now,
          ended: false,
          endTime: null,
          bufferDelay: PLAYOUT_DELAY_MS,
        });
      }

      else if (msg.type === 'STROKE_POINTS') {
        const stroke = strokesRef.current.get(msg.strokeId);
        if (stroke) {
          stroke.rawPoints.push(...msg.points);
        }
      }

      else if (msg.type === 'STROKE_END') {
        const stroke = strokesRef.current.get(msg.strokeId);
        if (stroke) {
          stroke.ended = true;
          stroke.endTime = now;
        }
      }

      else if (msg.type === 'ERASER_MOVE') {
        if (msg.pageId !== editor?.getCurrentPageId()) {
          erasersRef.current.delete(msg.userId);
          return;
        }
        erasersRef.current.set(msg.userId, {
          userId: msg.userId,
          userName: msg.userName,
          pageId: msg.pageId,
          x: msg.x,
          y: msg.y,
          size: msg.size,
          lastActive: now,
        });
      }
    };

    room.on('dataReceived', handleDataReceived);
    return () => room.off('dataReceived', handleDataReceived);
  }, [room, localParticipant, editor]);

  // ─── Watch tldraw store for permanent shape creation to instantly clear overlay ───
  useEffect(() => {
    if (!editor) return;

    const cleanupStoreListener = editor.store.listen((event: any) => {
      if ((event.source === 'remote' || event.source === 'user') && event.changes.added) {
        Object.values(event.changes.added).forEach((shape: any) => {
          const strokeId = shape.meta?.strokeId;
          if (strokeId) {
            const activeStroke = strokesRef.current.get(strokeId);
            if (activeStroke) {
              activeStroke.ended = true;
              activeStroke.skipFade = true;
            }
          }
        });
      }
    }, { scope: 'document' });

    return () => {
      cleanupStoreListener();
    };
  }, [editor]);

  // ─── requestAnimationFrame render loop ─────────────────────────────────────
  useEffect(() => {
    let rafId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const now = Date.now();
      const lastTime = lastFrameTimeRef.current || now;
      lastFrameTimeRef.current = now;
      const elapsedSeconds = Math.max(0.001, Math.min(0.1, (now - lastTime) / 1000));
      
      const lerpSpeed = 15;
      const lerpFactor = 1 - Math.exp(-lerpSpeed * elapsedSeconds);

      // Sync canvas size with DPR
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentPageId = editor?.getCurrentPageId();

      // Apply tldraw camera transform
      if (editor) {
        const camera = editor.getCamera();
        if (camera) {
          ctx.scale(dpr, dpr);
          ctx.translate(camera.x, camera.y);
          ctx.scale(camera.z, camera.z);
        }
      }

      // 1. Render Active Strokes
      strokesRef.current.forEach((stroke, strokeId) => {
        if (stroke.pageId !== currentPageId) {
          return;
        }

        const playPoints = updateStrokePlayout(stroke, now);
        if (playPoints.length === 0) return;

        let alpha = 1.0;
        if (stroke.ended) {
          const elapsed = stroke.endTime !== null ? (now - stroke.endTime) : 0;
          
          // Delete immediately if tldraw store shape has arrived and skipFade is triggered
          if (stroke.skipFade === true) {
            strokesRef.current.delete(strokeId);
            return;
          }
          
          // Safety timeout: if sync takes >3s, fade out over 300ms and delete
          if (elapsed >= 3300) {
            strokesRef.current.delete(strokeId);
            return;
          } else if (elapsed > 3000) {
            alpha = 1.0 - (elapsed - 3000) / 300;
          } else {
            alpha = 1.0; // Hold at 100% opacity until shape arrives
          }
        }

        ctx.save();
        ctx.globalAlpha = alpha;

        const cssColor = TLDRAW_COLORS[stroke.color] || stroke.color;
        const baseWidth = getBaseWidth(stroke.tool, stroke.size);

        drawCatmullRom(ctx, playPoints, baseWidth, cssColor);
        ctx.restore();
      });

      // 2. Render Active Erasers
      erasersRef.current.forEach((eraser, userId) => {
        if (eraser.pageId !== currentPageId) {
          return;
        }

        const elapsed = now - eraser.lastActive;
        if (elapsed >= 150) {
          erasersRef.current.delete(userId);
          return;
        }

        const alpha = 0.45 * (1 - elapsed / 150);

        ctx.save();
        ctx.beginPath();
        ctx.arc(eraser.x, eraser.y, eraser.size, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;
        ctx.strokeStyle = `rgba(100, 116, 139, ${alpha * 1.5})`;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      // 3. Render Smooth Cursors
      cursorsRef.current.forEach((cursor, userId) => {
        if (cursor.pageId !== currentPageId) {
          return;
        }

        if (now - cursor.lastSeen > CURSOR_TIMEOUT_MS) {
          cursorsRef.current.delete(userId);
          return;
        }

        // Lerp towards target position
        if (cursor.targetX !== undefined && cursor.targetY !== undefined) {
          if (cursor.x === undefined || cursor.y === undefined) {
            cursor.x = cursor.targetX;
            cursor.y = cursor.targetY;
          } else {
            cursor.x = cursor.x + (cursor.targetX - cursor.x) * lerpFactor;
            cursor.y = cursor.y + (cursor.targetY - cursor.y) * lerpFactor;
          }
        }

        const cx = cursor.x ?? cursor.targetX ?? 0;
        const cy = cursor.y ?? cursor.targetY ?? 0;

        const isTeacherCursor = cursor.role === 'teacher';
        const dotColor = isTeacherCursor ? '#6366f1' : cursor.color;
        const label = isTeacherCursor ? `${cursor.userName} (Teacher)` : cursor.userName;

        const DOT_RADIUS = 5;
        ctx.save();

        ctx.beginPath();
        ctx.arc(cx, cy, DOT_RADIUS + 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, DOT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = dotColor;
        ctx.fill();

        const camera = editor?.getCamera();
        const zoom = camera?.z ?? 1;
        const fontSize = Math.max(10, Math.min(14, 12 / zoom));
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;

        const textWidth = ctx.measureText(label).width;
        const pillPadX = 6 / zoom;
        const pillPadY = 3 / zoom;
        const pillH = fontSize + pillPadY * 2;
        const pillW = textWidth + pillPadX * 2;
        const pillX = cx + (DOT_RADIUS + 2) / zoom;
        const pillY = cy - pillH / 2;
        const radius = 4 / zoom;

        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, radius);
        ctx.fillStyle = dotColor;
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pillX + pillPadX, pillY + pillH / 2);

        ctx.restore();
      });

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [editor]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[900] w-full h-full"
    />
  );
}
