export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  t: number; // millisecond timestamp relative to stroke start
}

export interface StrokeStartMessage {
  type: 'STROKE_START';
  strokeId: string;
  pageId: string;
  tool: 'draw' | 'highlight';
  color: string;
  size: string;
  opacity: string;
  point: StrokePoint;
}

export interface StrokePointsMessage {
  type: 'STROKE_POINTS';
  strokeId: string;
  points: StrokePoint[];
}

export interface StrokeEndMessage {
  type: 'STROKE_END';
  strokeId: string;
}

export interface EraserMoveMessage {
  type: 'ERASER_MOVE';
  userId: string;
  userName: string;
  pageId: string;
  x: number;
  y: number;
  size: number;
}

export interface CursorMoveMessage {
  type: 'CURSOR_MOVE';
  userId: string;
  userName: string;
  pageId: string;
  x: number;
  y: number;
  /** How many participants currently have write access (teacher + permitted students) */
  numWriters: number;
  role: 'teacher' | 'student';
}

export type StrokeMessage =
  | StrokeStartMessage
  | StrokePointsMessage
  | StrokeEndMessage
  | EraserMoveMessage
  | CursorMoveMessage;

export const STROKE_TOPIC = 'wb-stroke';

export function encodeStrokeMessage(msg: StrokeMessage): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(JSON.stringify(msg));
}

export function decodeStrokeMessage(data: Uint8Array): StrokeMessage | null {
  try {
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(data)) as StrokeMessage;
  } catch (err) {
    console.error('[StrokeProtocol] Failed to decode stroke message:', err);
    return null;
  }
}
