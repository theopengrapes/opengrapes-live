"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerTeacherJoined = triggerTeacherJoined;
const pusher_1 = __importDefault(require("pusher"));
const pusher = new pusher_1.default({
    appId: process.env.PUSHER_APP_ID || '',
    key: process.env.PUSHER_KEY || '',
    secret: process.env.PUSHER_SECRET || '',
    cluster: process.env.PUSHER_CLUSTER || '',
    useTLS: true,
});
// Best-effort notification to the LMS's batch channel. Failures here must
// never break the LiveKit token-issuance or webhook flow that calls this.
async function triggerTeacherJoined(roomId, batchId, batchName) {
    try {
        await pusher.trigger(`batch-${batchId}`, 'teacher-joined', { roomId, batchId, batchName });
    }
    catch (err) {
        console.error('[Pusher] Failed to trigger teacher-joined:', err);
    }
}
