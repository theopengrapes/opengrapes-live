import { useEffect, useState, useRef } from 'react';

interface UseAudioTranscriberProps {
	sessionId: string;
	participantId: string;
	role: string;
	name: string;
	startedAtMs: number;
	isEnabled: boolean; // active when classroom starts and mic is not muted
}

export function useAudioTranscriber({
	sessionId,
	participantId,
	role,
	name,
	startedAtMs,
	isEnabled,
}: UseAudioTranscriberProps) {
	const [isLoaded, setIsLoaded] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const vadInstanceRef = useRef<any>(null);
	const chunkIndexRef = useRef(0);

	// Create a ref to store the latest props to avoid stale closures in VAD callbacks
	const propsRef = useRef({ sessionId, participantId, role, name, startedAtMs });
	useEffect(() => {
		propsRef.current = { sessionId, participantId, role, name, startedAtMs };
	}, [sessionId, participantId, role, name, startedAtMs]);

	// 1. Load ONNX Runtime & VAD scripts dynamically from CDN
	useEffect(() => {
		if (typeof window === 'undefined') return;

		let active = true;

		const loadScripts = async () => {
			if ((window as any).vad) {
				if (active) setIsLoaded(true);
				return;
			}

			try {
				// Load ONNX Runtime first (dependency for vad-web) - loaded locally to avoid CORS dynamic import issues
				const onnxScript = document.createElement('script');
				onnxScript.src = '/vad/ort.js';
				onnxScript.async = true;
				onnxScript.crossOrigin = 'anonymous';
				document.body.appendChild(onnxScript);

				await new Promise<void>((resolve, reject) => {
					onnxScript.onload = () => resolve();
					onnxScript.onerror = () => reject(new Error('Failed to load ONNX runtime'));
				});

				// Load VAD Web - loaded locally
				const vadScript = document.createElement('script');
				vadScript.src = '/vad/bundle.min.js';
				vadScript.async = true;
				vadScript.crossOrigin = 'anonymous';
				document.body.appendChild(vadScript);

				await new Promise<void>((resolve, reject) => {
					vadScript.onload = () => resolve();
					vadScript.onerror = () => reject(new Error('Failed to load VAD library'));
				});

				if (active) {
					console.log('[VAD] Scripts loaded successfully');
					setIsLoaded(true);
				}
			} catch (err) {
				console.error('[VAD] Failed to initialize scripts:', err);
			}
		};

		loadScripts();

		return () => {
			active = false;
		};
	}, []);

	// Convert Float32Array PCM audio to a 16-bit WAV blob
	const bufferToWav = (buffer: Float32Array, sampleRate = 16000) => {
		const length = buffer.length * 2;
		const result = new ArrayBuffer(44 + length);
		const view = new DataView(result);

		const writeString = (view: DataView, offset: number, string: string) => {
			for (let i = 0; i < string.length; i++) {
				view.setUint8(offset + i, string.charCodeAt(i));
			}
		};

		const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
			for (let i = 0; i < input.length; i++, offset += 2) {
				const s = Math.max(-1, Math.min(1, input[i]));
				output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
			}
		};

		/* RIFF identifier */
		writeString(view, 0, 'RIFF');
		/* file length */
		view.setUint32(4, 36 + length, true);
		/* RIFF type */
		writeString(view, 8, 'WAVE');
		/* format chunk identifier */
		writeString(view, 12, 'fmt ');
		/* format chunk length */
		view.setUint32(16, 16, true);
		/* sample format (raw PCM) */
		view.setUint16(20, 1, true);
		/* channel count (mono) */
		view.setUint16(22, 1, true);
		/* sample rate */
		view.setUint32(24, sampleRate, true);
		/* byte rate (sample rate * block align) */
		view.setUint32(28, sampleRate * 2, true);
		/* block align (channel count * bytes per sample) */
		view.setUint16(32, 2, true);
		/* bits per sample */
		view.setUint16(34, 16, true);
		/* data chunk identifier */
		writeString(view, 36, 'data');
		/* data chunk length */
		view.setUint32(40, length, true);

		floatTo16BitPCM(view, 44, buffer);

		return new Blob([view], { type: 'audio/wav' });
	};

	// Send audio chunk to backend transcribe API
	const handleSendChunk = async (audio: Float32Array, sessionElapsedMs: number, durationMs: number) => {
		try {
			const { sessionId, participantId, role, name } = propsRef.current;
			if (!sessionId) {
				console.warn('[VAD] No active sessionId, skipping transcription upload');
				return;
			}

			const wavBlob = bufferToWav(audio, 16000);
			const formData = new FormData();
			formData.append('audio', wavBlob, 'audio.wav');
			formData.append('sessionId', sessionId);
			formData.append('participantId', participantId);
			formData.append('role', role);
			formData.append('name', name);
			formData.append('sessionElapsedMs', sessionElapsedMs.toString());
			formData.append('duration', durationMs.toString());
			formData.append('chunkIndex', chunkIndexRef.current.toString());

			chunkIndexRef.current += 1;

			let accessToken = null;
			try {
				accessToken = sessionStorage.getItem('classroom_access_token');
			} catch (e) {
				console.warn('[VAD] Failed to read classroom token:', e);
			}

			if (!accessToken) return;

			console.log(`[VAD] Uploading speech chunk of ${durationMs}ms at elapsed ${sessionElapsedMs}ms...`);
			const response = await fetch('/api/transcribe', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
				},
				body: formData,
			});

			if (!response.ok) {
				console.error('[VAD] Transcription upload failed:', response.status);
			} else {
				const result = await response.json();
				if (result.text) {
					console.log(`[VAD] Transcribed: "${result.text}"`);
				}
			}
		} catch (err) {
			console.error('[VAD] Error uploading audio chunk:', err);
		}
	};

	// 2. Initialize and manage VAD instance based on loaded scripts and enable status
	useEffect(() => {
		if (!isLoaded || typeof window === 'undefined') return;

		let active = true;

		const initVAD = async () => {
			try {
				if (vadInstanceRef.current) {
					await vadInstanceRef.current.destroy();
					vadInstanceRef.current = null;
				}

				if (!isEnabled) {
					setIsRecording(false);
					return;
				}

				console.log('[VAD] Initializing VAD Mic...');
				
				// Configure ONNX runtime environment config to single thread to avoid worker CORS issues
				if ((window as any).ort) {
					console.log('[VAD] Configuring ONNX Runtime for single thread to prevent CORS/Worker issues...');
					(window as any).ort.env.wasm.numThreads = 1;
				}

				const myvad = await (window as any).vad.MicVAD.new({
					baseAssetPath: '/vad/',
					onnxWASMBasePath: '/vad/',
					submitUserSpeechOnPause: true, // Flush user speech when muted/paused
					onSpeechStart: () => {
						console.log('[VAD] Speech started');
					},
					onSpeechEnd: async (audio: Float32Array) => {
						console.log(`[VAD] Speech ended. Audio length: ${audio.length}`);
						if (!audio || audio.length === 0) return;

						const clientTimestamp = Date.now();
						const currentStartedAtMs = propsRef.current.startedAtMs;
						const sessionElapsedMs = Math.max(0, clientTimestamp - currentStartedAtMs);
						const durationMs = Math.round((audio.length / 16000) * 1000);

						await handleSendChunk(audio, sessionElapsedMs, durationMs);
					},
				});

				if (active) {
					vadInstanceRef.current = myvad;
					await myvad.start();
					setIsRecording(true);
					console.log('[VAD] VAD Mic started listening');
				} else {
					await myvad.destroy();
				}
			} catch (err) {
				console.error('[VAD] Failed to start VAD Mic:', err);
			}
		};

		initVAD();

		return () => {
			active = false;
			if (vadInstanceRef.current) {
				const currentInstance = vadInstanceRef.current;
				vadInstanceRef.current = null;
				currentInstance.destroy().then(() => {
					console.log('[VAD] VAD Mic destroyed');
				}).catch((e: any) => console.error('[VAD] Error destroying VAD:', e));
			}
		};
	}, [isLoaded, isEnabled]);

	return { isLoaded, isRecording };
}
