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
	const [attachedImages, setAttachedImages] = useState<string[]>([]);
	const [isCapturing, setIsCapturing] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamedAnswer, setStreamedAnswer] = useState('');
	const [doubts, setDoubts] = useState<Doubt[]>([]);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const [selectedImage, setSelectedImage] = useState<string | null>(null); // For fullscreen image modal
	const [activeDoubt, setActiveDoubt] = useState<{ text: string; screenshots: string[] } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const doubtsEndRef = useRef<HTMLDivElement>(null);

	// Helper to parse basic markdown bold (**text**) and bullet lists
	const renderFormattedAnswer = (text: string) => {
		if (!text) return null;
		
		const lines = text.split('\n');
		return lines.map((line, lineIdx) => {
			// Check if it's a bullet point (starts with '-' or '*' or '•')
			const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
			
			// Function to split and parse **bold** text
			const parseBold = (str: string) => {
				const parts = str.split(/\*\*([^*]+)\*\*/g);
				return parts.map((part, idx) => {
					if (idx % 2 === 1) {
						return <strong key={idx} className="font-bold text-white">{part}</strong>;
					}
					return part;
				});
			};

			if (bulletMatch) {
				return (
					<div key={lineIdx} className="flex items-start gap-1.5 ml-2 my-1">
						<span className="text-indigo-400 mt-1 select-none">•</span>
						<span className="flex-1">{parseBold(bulletMatch[1])}</span>
					</div>
				);
			}

			return (
				<div key={lineIdx} className={line.trim() === '' ? 'h-2' : 'my-0.5'}>
					{parseBold(line)}
				</div>
			);
		});
	};

	// Helper to convert base64 dataURL to Blob for R2 uploads
	const dataURLtoBlob = (dataurl: string) => {
		const arr = dataurl.split(',');
		const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
		const bstr = atob(arr[1]);
		let n = bstr.length;
		const u8arr = new Uint8Array(n);
		while (n--) {
			u8arr[n] = bstr.charCodeAt(n);
		}
		return new Blob([u8arr], { type: mime });
	};

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
		const files = e.target.files;
		if (!files) return;

		Array.from(files).forEach((file) => {
			if (file.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onloadend = () => {
					setAttachedImages((prev) => [...prev, reader.result as string]);
				};
				reader.readAsDataURL(file);
			}
		});
	};

	// Handle Ctrl+V paste from clipboard
	const handlePaste = (e: React.ClipboardEvent) => {
		const file = e.clipboardData.files?.[0];
		if (file && file.type.startsWith('image/')) {
			e.preventDefault();
			const reader = new FileReader();
			reader.onloadend = () => {
				setAttachedImages((prev) => [...prev, reader.result as string]);
			};
			reader.readAsDataURL(file);
		}
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

			// Capture the whiteboard frames/shapes directly using Tldraw's native toImage helper
			const { blob } = await editor.toImage(shapeIds, {
				format: 'jpeg',
				background: true,
				quality: 0.7,
				scale: 1,
				bounds: editor.getViewportPageBounds(), // Crop exactly to the student's active viewport page bounds
			});

			const reader = new FileReader();
			reader.onloadend = () => {
				setAttachedImages((prev) => [...prev, reader.result as string]);
				setIsCapturing(false);
			};
			reader.readAsDataURL(blob);
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
		const imagesToSend = [...attachedImages];

		// Set active doubt preview for streaming state
		setActiveDoubt({ text: textToSend, screenshots: imagesToSend });

		// Reset state
		setDoubtText('');
		setAttachedImages([]);
		setStreamedAnswer('');
		setIsStreaming(true);

		try {
			const accessToken = sessionStorage.getItem('classroom_access_token');
			if (!accessToken) throw new Error('Unauthenticated');

			// Upload screenshots to R2 in parallel if present
			let finalScreenshot: string | null = null;
			if (imagesToSend.length > 0) {
				try {
					const SYNC_WORKER_URL = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'https://opengrapes-whiteboard-sync.manasrikhari23.workers.dev').replace(/\/+$/, '');
					
					const uploadedUrls = await Promise.all(
						imagesToSend.map(async (img) => {
							const uploadId = `${crypto.randomUUID()}-doubt.jpg`;
							const uploadUrl = `${SYNC_WORKER_URL}/api/uploads/${uploadId}`;
							const blob = dataURLtoBlob(img);
							
							const uploadRes = await fetch(uploadUrl, {
								method: 'POST',
								headers: { 'Content-Type': blob.type },
								body: blob,
							});

							if (!uploadRes.ok) {
								throw new Error(`R2 upload failed: ${uploadRes.status}`);
							}
							return uploadUrl;
						})
					);
					
					finalScreenshot = JSON.stringify(uploadedUrls);
					console.log('[DoubtSolver] Screenshots uploaded to R2 successfully:', finalScreenshot);
				} catch (uploadErr) {
					console.error('[DoubtSolver] Failed to upload screenshots to R2, falling back to base64 array:', uploadErr);
					// Fallback to sending base64 raw string array
					finalScreenshot = JSON.stringify(imagesToSend);
				}
			}

			const response = await fetch('/api/doubt', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${accessToken}`,
				},
				body: JSON.stringify({
					sessionId,
					doubtText: textToSend,
					screenshot: finalScreenshot,
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
			await fetchDoubtsHistory(); // Wait for the new history to be loaded and set in state first
			setIsStreaming(false);
			setActiveDoubt(null); // Clear streaming preview
			setStreamedAnswer(''); // Clear active streamed text state
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
				{/* Empty State & Instructions */}
				{!isStreaming && doubts.length === 0 && !isLoadingHistory && (
					<div className="space-y-4 my-2">
						{/* Welcome Message */}
						<div className="flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
							<IconAlertCircle className="w-8 h-8 text-indigo-400/50 mb-3 animate-pulse" />
							<h5 className="font-semibold text-sm text-white/80">Your Private AI Study Assistant</h5>
							<p className="text-xs text-[#C2CCDE]/50 max-w-xs mt-1 leading-relaxed">
								Ask questions about class concepts, slides, or topics. Your conversation is 100% private.
							</p>
						</div>

						{/* Instructions Card */}
						<div className="p-5 rounded-2xl bg-indigo-500/[0.02] border border-indigo-500/10 space-y-3.5 shadow-sm">
							<h6 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
								How to use the Doubt Solver
							</h6>
							<ul className="space-y-3 text-xs text-[#C2CCDE] leading-relaxed">
								<li className="flex items-start gap-2.5">
									<span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 font-bold text-[10px] shrink-0 mt-0.5">1</span>
									<span><strong>Type your doubt</strong> in the input field at the bottom of the tab.</span>
								</li>
								<li className="flex items-start gap-2.5">
									<span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 font-bold text-[10px] shrink-0 mt-0.5">2</span>
									<span><strong>Add optional context</strong>: Click <IconPhoto className="w-3.5 h-3.5 inline mx-0.5 text-indigo-300" /> to upload an image from your device, or click <IconCamera className="w-3.5 h-3.5 inline mx-0.5 text-indigo-300" /> to take a snapshot of the whiteboard.</span>
								</li>
								<li className="flex items-start gap-2.5">
									<span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 font-bold text-[10px] shrink-0 mt-0.5">3</span>
									<span><strong>Submit and stream</strong>: Hit send and the AI will read the class transcript, notes, and screenshot to stream a context-aware answer.</span>
								</li>
							</ul>
						</div>
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
										You asked
									</span>
									<span className="text-foreground/30">
										{new Date(d.timestamp + ' UTC').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
									</span>
								</div>

								<div className="text-sm font-medium text-white/90 leading-snug">
									{d.doubt_text}
								</div>

								{d.screenshot && (() => {
									let imgs: string[] = [];
									try {
										if (d.screenshot.startsWith('[')) {
											imgs = JSON.parse(d.screenshot);
										} else {
											imgs = [d.screenshot];
										}
									} catch (e) {
										imgs = [d.screenshot];
									}
									return imgs.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{imgs.map((imgUrl, idx) => (
												<div
													key={idx}
													className="relative group w-32 aspect-video rounded-lg overflow-hidden border border-white/10 cursor-pointer shadow-md"
													onClick={() => setSelectedImage(imgUrl)}
												>
													<img src={imgUrl} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
													<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
														<IconMaximize className="w-4 h-4 text-white" />
													</div>
												</div>
											))}
										</div>
									);
								})()}

								<div className="p-3.5 rounded-lg bg-surface-light/5 border-l-2 border-indigo-500/50 text-xs text-[#C2CCDE] leading-relaxed">
									{renderFormattedAnswer(d.answer)}
								</div>
							</div>
						))}

						{/* Render Active Streaming Doubt */}
						{isStreaming && activeDoubt && (
							<div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 space-y-3 animate-pulse">
								<div className="flex justify-between items-center text-[10px]">
									<span className="font-bold text-indigo-400">You asked (Generating...)</span>
									<IconLoader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
								</div>
								
								<div className="text-sm font-medium text-white/90 leading-snug">
									{activeDoubt.text}
								</div>

								{activeDoubt.screenshots && activeDoubt.screenshots.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{activeDoubt.screenshots.map((imgUrl, idx) => (
											<div
												key={idx}
												className="relative group w-32 aspect-video rounded-lg overflow-hidden border border-white/10 cursor-pointer shadow-md"
												onClick={() => setSelectedImage(imgUrl)}
											>
												<img src={imgUrl} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
												<div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
													<IconMaximize className="w-4 h-4 text-white" />
												</div>
											</div>
										))}
									</div>
								)}

								<div className="p-3.5 rounded-lg bg-surface-light/10 border-l-2 border-indigo-400 text-xs text-[#C2CCDE] leading-relaxed min-h-[50px]">
									{streamedAnswer ? renderFormattedAnswer(streamedAnswer) : 'Formulating prompt and waiting for AI response...'}
								</div>
							</div>
						)}

						<div ref={doubtsEndRef} />
					</div>
				)}
			</div>

			{/* Bottom Input Area (Available for both Student and Teacher) */}
			{true && (
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

					{/* Screenshot Previews */}
					{attachedImages.length > 0 && (
						<div className="flex flex-wrap gap-3 pb-1 pt-1">
							{attachedImages.map((img, idx) => (
								<div key={idx} className="relative pt-1.5 pr-1.5 shrink-0">
									<div
										onClick={() => setSelectedImage(img)}
										className="relative w-28 h-16 rounded-xl border border-white/10 overflow-hidden shadow-lg cursor-pointer group transition-colors"
										title="Click to view full screen"
									>
										<img src={img} alt="Doubt attachment preview" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
										<div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
											<IconMaximize className="w-4 h-4 text-white" />
										</div>
									</div>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
										}}
										className="absolute top-0 right-0 bg-red-500 hover:bg-red-650 text-white rounded-full p-0.5 shadow-sm transition-colors cursor-pointer z-10 animate-in fade-in duration-100"
										title="Remove image"
									>
										<IconTrash className="w-3.5 h-3.5" />
									</button>
								</div>
							))}
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
							multiple
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
							onPaste={handlePaste}
							placeholder="Type doubt, paste image, or click attachments..."
							disabled={isStreaming}
							className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/5 focus:border-indigo-500/50 outline-none text-sm text-white placeholder-[#C2CCDE]/30 transition-all font-sans"
						/>

						{/* Submit Button */}
						<button
							type="submit"
							disabled={(!doubtText.trim() && attachedImages.length === 0) || isStreaming}
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
