import React, { useState, useEffect, useRef } from 'react';
import { IconSend, IconPhoto, IconCamera, IconTrash, IconLoader2, IconRefresh, IconAlertCircle, IconMaximize, IconExternalLink } from '@tabler/icons-react';

interface Doubt {
	id: number;
	session_id: string;
	student_id: number;
	studentName: string;
	doubt_text: string;
	answer: string;
	screenshot: string | null;
	timestamp: string;
}

interface DoubtSolverTabProps {
	sessionId: string;
	isTeacher: boolean;
	editor: any; // Tldraw editor instance
}

export default function DoubtSolverTab({ sessionId, isTeacher, editor }: DoubtSolverTabProps) {
	const [doubtText, setDoubtText] = useState('');
	const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
	const [isCapturing, setIsCapturing] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamedAnswer, setStreamedAnswer] = useState('');
	const [doubts, setDoubts] = useState<Doubt[]>([]);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const [selectedImage, setSelectedImage] = useState<string | null>(null); // For fullscreen image modal
	const fileInputRef = useRef<HTMLInputElement>(null);
	const doubtsEndRef = useRef<HTMLDivElement>(null);

	// 1. Fetch doubts history
	const fetchDoubtsHistory = async () => {
		try {
			const accessToken = sessionStorage.getItem('classroom_access_token');
			if (!accessToken) return;

			const res = await fetch(`/api/doubts/${sessionId}`, {
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});
			if (res.ok) {
				const data = await res.json();
				setDoubts(data.doubts || []);
			}
		} catch (err) {
			console.error('Failed to fetch doubts history:', err);
		} finally {
			setIsLoadingHistory(false);
		}
	};

	// 2. Poll doubts history (every 5 seconds for teachers, manual refresh for students)
	useEffect(() => {
		fetchDoubtsHistory();

		if (isTeacher) {
			const interval = setInterval(fetchDoubtsHistory, 5000);
			return () => clearInterval(interval);
		}
	}, [sessionId, isTeacher]);

	// Scroll to bottom of stream/history when updated
	useEffect(() => {
		doubtsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [streamedAnswer, doubts]);

	// 3. Handle image upload from computer
	const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onloadend = () => {
			setScreenshotBase64(reader.result as string);
		};
		reader.readAsDataURL(file);
	};

	// 4. Handle "Capture Whiteboard" canvas capture
	const handleCaptureWhiteboard = async () => {
		if (!editor) {
			alert('Whiteboard is not loaded yet.');
			return;
		}

		setIsCapturing(true);
		try {
			const shapeIds = Array.from(editor.getCurrentPageShapeIds());
			if (shapeIds.length === 0) {
				alert('The whiteboard is currently empty. Draw something before capturing!');
				setIsCapturing(false);
				return;
			}

			// Get SVG element from Tldraw
			const svg = await editor.getSvg(shapeIds);
			if (!svg) {
				throw new Error('Failed to get SVG from editor');
			}

			// Serialize SVG to string
			const svgString = new XMLSerializer().serializeToString(svg);
			const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
			const svgUrl = URL.createObjectURL(svgBlob);

			const img = new window.Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				// Match SVG viewport size or scale it
				canvas.width = img.width || 1024;
				canvas.height = img.height || 768;
				const ctx = canvas.getContext('2d');
				if (ctx) {
					// Draw background
					ctx.fillStyle = '#0d111d'; // dark whiteboard background
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(img, 0, 0);
					const pngBase64 = canvas.toDataURL('image/png');
					setScreenshotBase64(pngBase64);
				}
				URL.revokeObjectURL(svgUrl);
				setIsCapturing(false);
			};
			img.onerror = () => {
				URL.revokeObjectURL(svgUrl);
				setIsCapturing(false);
				alert('Failed to process whiteboard screenshot.');
			};
			img.src = svgUrl;
		} catch (err) {
			console.error('Error capturing whiteboard:', err);
			setIsCapturing(false);
			alert('Could not capture whiteboard.');
		}
	};

	// 5. Submit student doubt
	const handleSubmitDoubt = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!doubtText.trim() || isStreaming) return;

		const textToSend = doubtText;
		const imgToSend = screenshotBase64;

		// Reset state
		setDoubtText('');
		setScreenshotBase64(null);
		setStreamedAnswer('');
		setIsStreaming(true);

		try {
			const accessToken = sessionStorage.getItem('classroom_access_token');
			if (!accessToken) throw new Error('Unauthenticated');

			const response = await fetch('/api/doubt', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${accessToken}`,
				},
				body: JSON.stringify({
					sessionId,
					doubtText: textToSend,
					screenshot: imgToSend,
				}),
			});

			if (!response.ok) {
				throw new Error('Doubt solver endpoint returned error');
			}

			// Parse SSE stream
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let done = false;
			let buffer = '';

			if (reader) {
				while (!done) {
					const { value, done: readerDone } = await reader.read();
					done = readerDone;
					if (value) {
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						// Keep last unfinished line in buffer
						buffer = lines.pop() || '';

						for (const line of lines) {
							const cleanLine = line.trim();
							if (cleanLine.startsWith('data: ')) {
								const dataStr = cleanLine.substring(6).trim();
								if (dataStr === '[DONE]') {
									done = true;
									break;
								}
								try {
									const parsed = JSON.parse(dataStr);
									if (parsed.text) {
										setStreamedAnswer((prev) => prev + parsed.text);
									}
								} catch (e) {
									// Ignore partial JSON parsing errors
								}
							}
						}
					}
				}
			}
		} catch (err) {
			console.error('Error sending doubt:', err);
			setStreamedAnswer('Sorry, something went wrong while communicating with the doubt solver AI. Please try again.');
		} finally {
			setIsStreaming(false);
			fetchDoubtsHistory(); // Refresh history
		}
	};

	return (
		<div className="flex flex-col h-full overflow-hidden bg-[#090d1a]/40 text-slate-100 font-sans">
			{/* Top Header */}
			<div className="p-4 border-b border-white/5 flex items-center justify-between bg-surface/30">
				<h4 className="font-semibold text-xs text-white/80 uppercase tracking-wider">
					{isTeacher ? 'Live Student Doubts Feed' : 'AI Classroom Doubt Solver'}
				</h4>
				<button
					onClick={fetchDoubtsHistory}
					className="p-1.5 rounded-lg hover:bg-white/5 text-[#C2CCDE] hover:text-white transition-colors cursor-pointer"
					title="Refresh doubt list"
				>
					<IconRefresh className="w-3.5 h-3.5" />
				</button>
			</div>

			{/* Scrollable Container */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
				{/* Empty State */}
				{!isStreaming && doubts.length === 0 && !isLoadingHistory && (
					<div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/5 rounded-2xl bg-white/[0.01] my-4">
						<IconAlertCircle className="w-8 h-8 text-indigo-400/50 mb-3" />
						<h5 className="font-semibold text-sm text-white/70">No doubts asked yet</h5>
						<p className="text-xs text-foreground/40 max-w-xs mt-1">
							{isTeacher 
								? 'When students ask doubts, they will appear here in real-time.'
								: 'Stuck on something? Type your doubt below, attach whiteboard drawings, and get instant answers.'}
						</p>
					</div>
				)}

				{isLoadingHistory ? (
					<div className="flex justify-center items-center py-12">
						<IconLoader2 className="w-6 h-6 text-indigo-400 animate-spin" />
					</div>
				) : (
					<div className="space-y-4">
						{/* Render Completed Doubts History */}
						{doubts.map((d) => (
							<div key={d.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3 shadow-sm hover:border-white/10 transition-colors">
								<div className="flex justify-between items-center text-[10px]">
									<span className="font-bold text-indigo-400">
										{isTeacher ? d.studentName : 'You asked'}
									</span>
									<span className="text-foreground/30">
										{new Date(d.timestamp + ' UTC').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
									</span>
								</div>

								<div className="text-sm font-medium text-white/90 leading-snug">
									{d.doubt_text}
								</div>

								{d.screenshot && (
									<div className="relative group w-32 aspect-video rounded-lg overflow-hidden border border-white/10 cursor-pointer shadow-md" onClick={() => setSelectedImage(d.screenshot)}>
										<img src={d.screenshot} alt="Screenshot attachment" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
										<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
											<IconMaximize className="w-4 h-4 text-white" />
										</div>
									</div>
								)}

								<div className="p-3.5 rounded-lg bg-surface-light/5 border-l-2 border-indigo-500/50 text-xs text-[#C2CCDE] leading-relaxed whitespace-pre-wrap">
									{d.answer}
								</div>
							</div>
						))}

						{/* Render Active Streaming Doubt */}
						{isStreaming && (
							<div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 space-y-3 animate-pulse">
								<div className="flex justify-between items-center text-[10px]">
									<span className="font-bold text-indigo-400">Asking solver...</span>
									<IconLoader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
								</div>
								
								<div className="p-3.5 rounded-lg bg-surface-light/10 border-l-2 border-indigo-400 text-xs text-[#C2CCDE] leading-relaxed whitespace-pre-wrap min-h-[50px]">
									{streamedAnswer || 'Formulating prompt and waiting for AI response...'}
								</div>
							</div>
						)}

						<div ref={doubtsEndRef} />
					</div>
				)}
			</div>

			{/* Bottom Input Area (Student Only) */}
			{!isTeacher && (
				<form onSubmit={handleSubmitDoubt} className="p-3 border-t border-white/5 bg-surface/20 space-y-3">
					{/* AI Context Pill */}
					<div className="flex items-center">
						<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-hi border border-border rounded-full text-[10px] font-bold text-text-muted font-sans select-none">
							📚 Context: last {Math.max(1, Math.floor((Date.now() - (() => {
								if (typeof window !== 'undefined') {
									const val = sessionStorage.getItem('classroom_session_started_at');
									if (val) return parseInt(val, 10);
								}
								return Date.now();
							})()) / 60000))} mins
						</span>
					</div>

					{/* Screenshot Preview */}
					{screenshotBase64 && (
						<div className="relative inline-block border border-white/10 rounded-xl overflow-hidden shadow-lg">
							<img src={screenshotBase64} alt="Doubt attachment preview" className="h-16 w-28 object-cover" />
							<button
								type="button"
								onClick={() => setScreenshotBase64(null)}
								className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-red-500/80 transition-colors text-white cursor-pointer"
								title="Remove screenshot"
							>
								<IconTrash className="w-3.5 h-3.5" />
							</button>
						</div>
					)}

					<div className="flex gap-2">
						{/* Attach File Button */}
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[#C2CCDE] hover:text-white transition-colors cursor-pointer"
							title="Attach screenshot"
						>
							<IconPhoto className="w-4 h-4" />
						</button>
						<input
							type="file"
							ref={fileInputRef}
							accept="image/*"
							onChange={handleImageUpload}
							className="hidden"
						/>

						{/* Capture Whiteboard Button */}
						<button
							type="button"
							onClick={handleCaptureWhiteboard}
							disabled={isCapturing}
							className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[#C2CCDE] hover:text-white transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
							title="Capture Whiteboard drawing"
						>
							{isCapturing ? (
								<IconLoader2 className="w-4 h-4 animate-spin text-indigo-400" />
							) : (
								<IconCamera className="w-4 h-4" />
							)}
						</button>

						{/* Text input */}
						<input
							type="text"
							value={doubtText}
							onChange={(e) => setDoubtText(e.target.value)}
							placeholder="Type your doubt here..."
							disabled={isStreaming}
							className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/5 focus:border-indigo-500/50 outline-none text-sm text-white placeholder-[#C2CCDE]/30 transition-all font-sans"
						/>

						{/* Submit Button */}
						<button
							type="submit"
							disabled={!doubtText.trim() || isStreaming}
							className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:bg-[#111827] cursor-pointer flex items-center justify-center"
						>
							<IconSend className="w-4 h-4" />
						</button>
					</div>
				</form>
			)}

			{/* Fullscreen Image Lightbox Modal */}
			{selectedImage && (
				<div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
					<div className="relative max-w-4xl w-full max-h-[85vh] bg-surface border border-white/10 rounded-2xl overflow-hidden p-2 flex flex-col items-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
						<img src={selectedImage} alt="Attachment Full View" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
						<button
							onClick={() => setSelectedImage(null)}
							className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold cursor-pointer text-white"
						>
							Close View
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
