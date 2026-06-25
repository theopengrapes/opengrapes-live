import React, { useState, useEffect } from 'react';
import { IconRefresh, IconFileText, IconLoader2, IconSparkles, IconAlertCircle } from '@tabler/icons-react';

interface ClassSummaryTabProps {
	sessionId: string;
	isTeacher: boolean;
}

export default function ClassSummaryTab({ sessionId, isTeacher }: ClassSummaryTabProps) {
	const [rollingSummary, setRollingSummary] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isGenerating, setIsGenerating] = useState(false);

	// 1. Fetch rolling summary from backend
	const fetchSummary = async () => {
		try {
			const accessToken = sessionStorage.getItem('classroom_access_token');
			if (!accessToken) return;

			const res = await fetch(`/api/summary/${sessionId}`, {
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});
			if (res.ok) {
				const data = await res.json();
				setRollingSummary(data.rollingSummary || '');
			}
		} catch (err) {
			console.error('Failed to fetch rolling summary:', err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchSummary();
		// Poll summary every 30 seconds to fetch automatic DO alarm updates
		const interval = setInterval(fetchSummary, 30000);
		return () => clearInterval(interval);
	}, [sessionId]);

	// 2. Trigger on-demand initial summary generation
	const handleManualTrigger = async () => {
		setIsGenerating(true);
		try {
			const accessToken = sessionStorage.getItem('classroom_access_token');
			if (!accessToken) throw new Error('Unauthenticated');

			const res = await fetch('/api/summary/trigger', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${accessToken}`
				},
				body: JSON.stringify({ sessionId })
			});

			if (res.ok) {
				const data = await res.json();
				if (data.rollingSummary) {
					setRollingSummary(data.rollingSummary);
				} else {
					alert('No transcription speech found yet. Talk in class for a bit, then try generating!');
				}
			} else {
				const errData = await res.json();
				alert(errData.error || 'Failed to generate summary.');
			}
		} catch (err) {
			console.error('Failed to trigger manual summary:', err);
			alert('Failed to contact summary server.');
		} finally {
			setIsGenerating(false);
		}
	};

	// Split rolling summary bullet points by newline
	const summaryPoints = rollingSummary
		.split('\n')
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	return (
		<div className="flex flex-col h-full overflow-hidden bg-[#090d1a]/40 text-slate-100 font-sans">
			{/* Top Header */}
			<div className="p-4 border-b border-white/5 flex items-center justify-between bg-surface/30">
				<h4 className="font-semibold text-xs text-white/80 uppercase tracking-wider">
					Class rolling summary
				</h4>
				<div className="flex items-center gap-1.5">
					<button
						onClick={handleManualTrigger}
						disabled={isGenerating || isLoading}
						className="px-2.5 py-1 bg-accent hover:bg-accent-hi text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-sm font-sans"
						title="Regenerate summary on demand"
					>
						{isGenerating ? (
							<IconLoader2 className="w-3 h-3 animate-spin" />
						) : (
							<IconSparkles className="w-3 h-3" />
						)}
						<span>Regenerate</span>
					</button>
					<button
						onClick={fetchSummary}
						disabled={isLoading}
						className="p-1.5 rounded-lg hover:bg-white/5 text-[#C2CCDE] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
						title="Refresh summary"
					>
						<IconRefresh className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			{/* Main Scrollable Content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
				{isLoading ? (
					<div className="flex justify-center items-center py-12">
						<IconLoader2 className="w-6 h-6 text-indigo-400 animate-spin" />
					</div>
				) : summaryPoints.length > 0 ? (
					<div className="space-y-4">
						{/* Info Banner */}
						<div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-2.5">
							<IconSparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
							<p className="text-[10px] text-[#C2CCDE]/80 leading-relaxed font-sans">
								This summary updates automatically every 10 minutes of the live class using AI transcription.
							</p>
						</div>

						{/* Summary Points List */}
						<div className="space-y-3">
							{summaryPoints.map((point, index) => {
								// Match "[0-10 min]: " format to colorize the timestamp
								const match = point.match(/^\[(.*?)\]\s*(.*)$/);
								if (match) {
									return (
										<div key={index} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3 hover:border-white/10 transition-colors">
											<span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 shrink-0 mt-0.5 font-sans">
												{match[1]}
											</span>
											<p className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap font-sans">
												{match[2]}
											</p>
										</div>
									);
								}

								return (
									<div key={index} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3 hover:border-white/10 transition-colors">
										<p className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap font-sans">
											{point}
										</p>
									</div>
								);
							})}
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/5 rounded-2xl bg-white/[0.01] my-4">
						<IconFileText className="w-8 h-8 text-indigo-400/50 mb-3" />
						<h5 className="font-semibold text-sm text-white/70">No summary generated yet</h5>
						<p className="text-xs text-foreground/45 max-w-xs mt-1 leading-relaxed">
							The summary compiles automatically every 10 minutes from teacher and student voice recordings.
						</p>

						{/* Initial Manual Trigger Button */}
						<div className="mt-6 w-full max-w-xs space-y-2">
							<button
								onClick={handleManualTrigger}
								disabled={isGenerating}
								className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-colors disabled:opacity-50 disabled:bg-[#111827] flex items-center justify-center gap-2 cursor-pointer shadow-md"
							>
								{isGenerating ? (
									<>
										<IconLoader2 className="w-3.5 h-3.5 animate-spin" />
										Generating Summary...
									</>
								) : (
									<>
										<IconSparkles className="w-3.5 h-3.5" />
										Generate Summary Now
									</>
								)}
							</button>
							<div className="flex items-center justify-center gap-1.5 text-[9px] text-foreground/30 font-semibold font-sans">
								<IconAlertCircle className="w-3 h-3" />
								Generates immediately based on speech so far
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
