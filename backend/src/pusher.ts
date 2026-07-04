import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.PUSHER_CLUSTER || '',
  useTLS: true,
});

// Best-effort notification to the LMS's batch channel. Failures here must
// never break the LiveKit token-issuance or webhook flow that calls this.
export async function triggerTeacherJoined(roomId: string, batchId: string, batchName: string) {
  try {
    await pusher.trigger(`private-batch-${batchId}`, 'teacher-joined', { roomId, batchId, batchName });
  } catch (err) {
    console.error('[Pusher] Failed to trigger teacher-joined:', err);
  }
}
