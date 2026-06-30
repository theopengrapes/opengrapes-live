import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';

// Load KaTeX mhchem extension for chemistry formulas (\ce)
if (typeof window !== "undefined") {
  require("katex/dist/contrib/mhchem.min.js");
}

interface MarkdownRendererProps {
  content: string;
}

// Preprocess LaTeX math delimiters to ensure remark-math catches them
function preprocessMath(text: string): string {
  if (!text) return "";
  
  // Replace \( ... \) with $ ... $
  let processed = text.replace(/\\+\(/g, "$").replace(/\\+\)/g, "$");
  
  // Replace \[ ... \] with $$ ... $$
  processed = processed.replace(/\\+\[/g, "$$").replace(/\\+\]/g, "$$");
  
  // Wrap raw \boxed{...} (including nested braces like \boxed{\ce{...}}) in $...$
  // Supports one level of brace nesting inside \boxed
  processed = processed.replace(
    /(?<!\$)\\boxed\{((?:[^{}]|\{[^{}]*\})*)\}(?!\$)/g,
    "$\\boxed{$1}$"
  );
  
  // Wrap raw braced \ce{...} in $...$ if not already wrapped
  processed = processed.replace(
    /(?<!\$)\\ce\{([^{}]*)\}(?!\$)/g,
    "$\\ce{$1}$"
  );
  
  // Wrap raw unbraced \ce (e.g. \ce2ZnS...) in $...$ with braces
  processed = processed.replace(
    /(?<!\$)\\ce\s*([a-zA-Z0-9+\-=><\s\(\)\[\]]+)(?!\$)/g,
    "$\\ce{$1}$"
  );
  
  return processed;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const processedContent = preprocessMath(content);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => <h1 className="text-sm font-bold text-indigo-400 mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xs font-bold text-indigo-300 mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[11px] font-bold text-indigo-200 mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-xs leading-relaxed text-slate-255 my-1 whitespace-pre-wrap">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1 text-slate-255 text-xs">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1 text-slate-255 text-xs">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-slate-350">{children}</em>,
        code: ({ className, children, ...props }) => {
          const isInline = !className && !String(children).includes('\n');
          return isInline ? (
            <code className="bg-slate-900/60 px-1 py-0.5 rounded text-[10px] font-mono text-indigo-300 border border-white/5" {...props}>
              {children}
            </code>
          ) : (
            <pre className="bg-slate-955 border border-white/5 p-3 rounded-lg my-1.5 overflow-x-auto text-[10px] font-mono text-slate-300">
              <code className={className} {...props}>{children}</code>
            </pre>
          );
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 rounded-lg border border-white/5">
            <table className="min-w-full divide-y divide-white/5 text-[10px] text-left">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-955/40 text-slate-300 font-semibold">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-white/5">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-white/[0.01]">{children}</tr>,
        th: ({ children }) => <th className="px-3 py-2 border-b border-white/5 font-bold">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-slate-300">{children}</td>,
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
