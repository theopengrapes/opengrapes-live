import React, { useState, useEffect, useRef } from 'react';
import { IconSend, IconPhoto, IconCamera, IconTrash, IconLoader2, IconRefresh, IconAlertCircle, IconMaximize, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import MarkdownRenderer from './MarkdownRenderer';

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
	const [streamedThinking, setStreamedThinking] = useState('');
	const [enableThinking, setEnableThinking] = useState(true);
	const [selectedImage, setSelectedImage] = useState<string | null>(null); // For fullscreen image modal
	const [activeDoubt, setActiveDoubt] = useState<{ text: string; screenshots: string[] } | null>(null);
	
	// New States for Claude-style Persistent Thinking & Stage Placeholders
	const [streamingPhase, setStreamingPhase] = useState<'idle' | 'context' | 'thinking' | 'answering'>('idle');
	const [localThinking, setLocalThinking] = useState<Record<number, string>>({});
	const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
	const [activeThinkingExpanded, setActiveThinkingExpanded] = useState(true);
	
	const fileInputRef = useRef<HTMLInputElement>(null);
	const doubtsEndRef = useRef<HTMLDivElement>(null);
	const finalThinkingRef = useRef('');
	const hasCollapsedActiveThinkingRef = useRef(false);

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
				// Check size limit: 5MB
				if (file.size > 5 * 1024 * 1024) {
					alert(`Image "${file.name}" must be less than 5MB`);
					return;
				}
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
			// Check size limit: 5MB
			if (file.size > 5 * 1024 * 1024) {
				alert("Image size must be less than 5MB");
				return;
			}
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

			const { blob } = await editor.toImage(shapeIds, {
				format: 'jpeg',
				background: true,
				quality: 0.7,
				scale: 1,
				bounds: editor.getViewportPageBounds(),
			});

			// Check size limit: 5MB
			if (blob.size > 5 * 1024 * 1024) {
				alert("Captured whiteboard image is too large (must be less than 5MB).");
				setIsCapturing(false);
				return;
			}

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
		const textToSend = doubtText.trim();
		const imagesToSend = [...attachedImages];

		if ((!textToSend && imagesToSend.length === 0) || isStreaming) return;

		// Set active doubt preview for streaming state
		setActiveDoubt({ text: textToSend, screenshots: imagesToSend });

		// Reset state
		setDoubtText('');
		setAttachedImages([]);
		setStreamedAnswer('');
		setStreamedThinking('');
		setIsStreaming(true);
		setStreamingPhase('context');
		setActiveThinkingExpanded(true);
		hasCollapsedActiveThinkingRef.current = false;
		finalThinkingRef.current = '';

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
					enableThinking,
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
									if (parsed.thinking) {
										setStreamedThinking((prev) => {
											const updated = prev + parsed.thinking;
											finalThinkingRef.current = updated;
											return updated;
										});
										setStreamingPhase(phase => phase !== 'thinking' ? 'thinking' : phase);
									}
									if (parsed.text) {
										if (!hasCollapsedActiveThinkingRef.current) {
											hasCollapsedActiveThinkingRef.current = true;
											setActiveThinkingExpanded(false);
										}
										setStreamedAnswer((prev) => prev + parsed.text);
										setStreamingPhase(phase => phase !== 'answering' ? 'answering' : phase);
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
			const finalThinking = finalThinkingRef.current;
			const textForDoubt = textToSend;
			setStreamingPhase('idle');

			await fetchDoubtsHistory(); // Reload history

			// Map final thinking trace to the newly created doubt ID in history
			if (finalThinking) {
				setDoubts(currentDoubts => {
					const matchedDoubt = currentDoubts[currentDoubts.length - 1];
					if (matchedDoubt) {
						setLocalThinking(prev => ({ ...prev, [matchedDoubt.id]: finalThinking }));
					}
					return currentDoubts;
				});
			}

			setIsStreaming(false);
			setActiveDoubt(null); // Clear streaming preview
			setStreamedAnswer(''); // Clear active streamed text state
			setStreamedThinking(''); // Clear active thinking state
			finalThinkingRef.current = '';
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
			<div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
				{/* Empty State & Instructions */}
				{!isStreaming && doubts.length === 0 && !isLoadingHistory && (
					<div className="space-y-4 my-2">
						{/* Welcome Message */}
						<div className="flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
							<IconAlertCircle className="w-8 h-8 text-indigo-400/50 mb-3 animate-pulse" />
							<h5 className="font-semibold text-sm text-white/80">Your Private AI Study Assistant</h5>
							<p className="text-xs text-[#C2CCDE]/55 max-w-xs mt-1 leading-relaxed">
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
					<div className="space-y-6">
						{/* Render Completed Doubts History in Claude-style layout */}
						{doubts.map((d) => {
							const hasThinking = !!localThinking[d.id];
							const isThinkingOpen = !!expandedThinking[d.id];
							
							// Parse screenshots if present
							let imgs: string[] = [];
							if (d.screenshot) {
								try {
									if (d.screenshot.startsWith('[')) {
										imgs = JSON.parse(d.screenshot);
									} else {
										imgs = [d.screenshot];
									}
								} catch (e) {
									imgs = [d.screenshot];
								}
							}

							return (
								<div key={d.id} className="space-y-4 pb-4 border-b border-white/5 last:border-0">
									{/* User Question (Right-aligned bubble + Floating image above) */}
									<div className="flex flex-col items-end space-y-2 max-w-[85%] ml-auto">
										{imgs.length > 0 && (
											<div className="flex flex-wrap gap-2 justify-end">
												{imgs.map((imgUrl, idx) => (
													<div
														key={idx}
														className="relative group w-32 aspect-video rounded-lg overflow-hidden border border-white/10 cursor-pointer shadow-md"
														onClick={() => setSelectedImage(imgUrl)}
													>
														<img src={imgUrl} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
														<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
															<IconMaximize className="w-4 h-4 text-white" />
														</div>
													</div>
												))}
											</div>
										)}
										<div className="px-4 py-2.5 bg-white/[0.06] border border-white/5 rounded-2xl rounded-tr-none text-white text-xs leading-relaxed whitespace-pre-wrap">
											{d.doubt_text}
										</div>
									</div>

									{/* AI Answer (Left-aligned, directly on bg, no card) */}
									<div className="space-y-2 pl-2">
										<div className="flex items-center justify-between text-[9px] text-[#C2CCDE]/35">
											<span className="font-bold text-indigo-400/80">AI DOUBT SOLVER</span>
											<span>
												{new Date(d.timestamp + ' UTC').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
											</span>
										</div>

										{/* Collapsible thought process (rendered with markdown/LaTeX) */}
										{hasThinking && (
											<div className="my-2 p-2 bg-slate-950/20 border border-white/5 rounded-lg">
												<button
													onClick={() => setExpandedThinking(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
													className="flex items-center gap-1 text-[9px] font-bold text-indigo-400/70 hover:text-indigo-400 transition-colors select-none"
												>
													{isThinkingOpen ? (
														<IconChevronDown className="w-3.5 h-3.5" />
													) : (
														<IconChevronRight className="w-3.5 h-3.5" />
													)}
													<span>THOUGHT PROCESS</span>
												</button>
												{isThinkingOpen && (
													<div className="mt-2 pl-3 border-l border-white/10 text-[10px] text-slate-400 font-mono">
														<MarkdownRenderer content={localThinking[d.id]} />
													</div>
												)}
											</div>
										)}

										{/* Final solved answer */}
										<div className="text-slate-100 text-xs leading-relaxed">
											<MarkdownRenderer content={d.answer} />
										</div>
									</div>
								</div>
							);
						})}

						{/* Render Active Streaming Doubt */}
						{isStreaming && activeDoubt && (
							<div className="space-y-4 pt-2 pb-6 border-b border-white/5">
								{/* User Question (Right-aligned bubble + Floating images above) */}
								<div className="flex flex-col items-end space-y-2 max-w-[85%] ml-auto">
									{activeDoubt.screenshots && activeDoubt.screenshots.length > 0 && (
										<div className="flex flex-wrap gap-2 justify-end">
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
									<div className="px-4 py-2.5 bg-white/[0.06] border border-white/5 rounded-2xl rounded-tr-none text-white text-xs leading-relaxed whitespace-pre-wrap">
										{activeDoubt.text}
									</div>
								</div>

								{/* AI Response (Left-aligned on bg) */}
								<div className="space-y-3 pl-2">
									{/* Placeholder row (always at top) */}
									{(streamingPhase === 'context' || streamingPhase === 'thinking') && (
										<div className="flex items-center gap-2 py-1 text-xs text-indigo-400 font-medium italic animate-pulse">
											<IconLoader2 className="w-3.5 h-3.5 animate-spin" />
											<span>
												{streamingPhase === 'context' ? 'Reading classroom context...' : 'Thinking deeply...'}
											</span>
										</div>
									)}

									{/* Thought Process (active stream) */}
									{streamedThinking && (
										<div className="my-2 p-2 bg-slate-950/20 border border-white/5 rounded-lg">
											<button
												onClick={() => setActiveThinkingExpanded(!activeThinkingExpanded)}
												className="flex items-center gap-1 text-[9px] font-bold text-indigo-400/70 hover:text-indigo-400 transition-colors select-none"
											>
												{activeThinkingExpanded ? (
													<IconChevronDown className="w-3.5 h-3.5" />
												) : (
													<IconChevronRight className="w-3.5 h-3.5" />
												)}
												<span>THOUGHT PROCESS</span>
											</button>
											{activeThinkingExpanded && (
												<div className="mt-2 pl-3 border-l border-white/10 text-[10px] text-slate-400 font-mono">
													<MarkdownRenderer content={streamedThinking} />
												</div>
											)}
										</div>
									)}

									{/* Streaming Solution */}
									{streamedAnswer && (
										<div className="text-slate-100 text-xs leading-relaxed">
											<MarkdownRenderer content={streamedAnswer} />
										</div>
									)}
								</div>
							</div>
						)}

						<div ref={doubtsEndRef} />
					</div>
				)}
			</div>

			{/* Bottom Input Area */}
			<form onSubmit={handleSubmitDoubt} className="p-3 border-t border-white/5 bg-surface/20 space-y-3">
				{/* AI Context Pill & Thinking Mode Toggle */}
				<div className="flex items-center justify-between">
					<span className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-hi border border-border rounded-full text-[10px] font-bold text-text-muted font-sans select-none">
						📚 Context: last {Math.max(1, Math.floor((Date.now() - (() => {
							if (typeof window !== 'undefined') {
								const val = sessionStorage.getItem('classroom_session_started_at');
								if (val) return parseInt(val, 10);
							}
							return Date.now();
						})()) / 60000))} mins
					</span>

					{/* Toggle for Thinking Mode */}
					<label className="relative inline-flex items-center cursor-pointer select-none text-[10px] font-semibold text-[#C2CCDE]/70 hover:text-white transition-colors gap-1.5">
						<span>Thinking Mode</span>
						<div className="relative">
							<input 
								type="checkbox" 
								checked={enableThinking} 
								onChange={(e) => setEnableThinking(e.target.checked)} 
								className="sr-only peer" 
							/>
							<div className="w-7 h-4 bg-white/10 rounded-full peer peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
						</div>
					</label>
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
