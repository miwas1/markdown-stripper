import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import removeMarkdown from 'remove-markdown';
import { 
  Copy, Check, Trash2, FileText, ArrowRightLeft, Type, 
  Upload, Download, ExternalLink, Mail, Image as ImageIcon,
  PanelRightClose, PanelRightOpen, X, Link as LinkIcon,
  Wand2, Sparkles, FileOutput, Loader2, AlertCircle, Menu, Eye, Edit3, Columns
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type as GeminiType } from "@google/genai";
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { SeoContent } from './components/SeoContent';
import { SeoFooter } from './components/SeoFooter';
import { AdminDashboard } from './components/AdminDashboard';
import { trackEvent } from './lib/analytics';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ExtractedAsset {
  type: 'link' | 'email' | 'image';
  value: string;
  label?: string;
}

interface GrammarCorrection {
  original: string;
  fixed: string;
  reason: string;
}

interface GrammarResponse {
  fixedMarkdown: string;
  corrections: GrammarCorrection[];
}

export default function App() {
  const [markdown, setMarkdown] = useState<string>('');
  const [plainText, setPlainText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [grammarCorrections, setGrammarCorrections] = useState<GrammarCorrection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'both' | 'input' | 'output'>('both');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminView, setIsAdminView] = useState(() => {
    return window.location.hash === '#admin' || window.location.pathname.startsWith('/admin');
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set document title & track page view invisibly on mount
  useEffect(() => {
    document.title = "MarkDown Stripper - Free Online Markdown to Plain Text Converter";
    
    // Invisible background telemetry
    trackEvent('page_view', {
      referrer: document.referrer,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    });

    const handleHashChange = () => {
      setIsAdminView(window.location.hash === '#admin');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Convert markdown to plain text whenever markdown changes
  useEffect(() => {
    try {
      const stripped = removeMarkdown(markdown);
      setPlainText(stripped);
      if (stripped.trim().length > 10) {
        trackEvent('convert_markdown', { length: stripped.length });
      }
    } catch (error) {
      console.error('Conversion error:', error);
    }
  }, [markdown]);

  // Extract links, images, and emails
  const assets = useMemo(() => {
    const found: ExtractedAsset[] = [];
    
    // Images: ![alt](url)
    const imageRegex = /!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
      found.push({ type: 'image', value: match[2], label: match[1] || 'Image' });
    }

    // Links: [text](url) - excluding images
    const linkRegex = /(?<!\!)\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
    while ((match = linkRegex.exec(markdown)) !== null) {
      found.push({ type: 'link', value: match[2], label: match[1] || match[2] });
    }

    // Bare URLs (approximation)
    const bareUrlRegex = /(?<!["'\(])(https?:\/\/[^\s\)\>]+)(?![^<]*>)/g;
    while ((match = bareUrlRegex.exec(markdown)) !== null) {
      if (!found.some(f => f.value === match![1])) {
        found.push({ type: 'link', value: match[1] });
      }
    }

    // Emails
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    while ((match = emailRegex.exec(markdown)) !== null) {
      found.push({ type: 'email', value: match[1] });
    }

    return found;
  }, [markdown]);

  const handleCopy = useCallback(async () => {
    if (!plainText) return;
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      trackEvent('copy_text', { length: plainText.length });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  }, [plainText]);

  const handleClear = () => {
    setMarkdown('');
    setGrammarCorrections([]);
    setError(null);
  };

  const handleExportText = () => {
    if (!plainText) return;
    const blob = new Blob([plainText], { type: 'text/plain' });
    saveAs(blob, 'converted-text.txt');
    trackEvent('export_file', { format: 'txt', length: plainText.length });
  };

  const handleExportDocx = async () => {
    if (!plainText) return;
    
    const lines = plainText.split('\n');
    const doc = new Document({
      sections: [{
        properties: {},
        children: lines.map(line => new Paragraph({
          children: [new TextRun(line)],
        })),
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'converted-document.docx');
    trackEvent('export_file', { format: 'docx', length: plainText.length });
  };

  const handleFixGrammar = async () => {
    if (!markdown.trim() || isFixing) return;
    setIsFixing(true);
    setError(null);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Fix the grammar, spelling, and punctuation of the following Markdown text. Preserve all Markdown formatting (headings, lists, code blocks, etc.). 
        Return the response as a JSON object with:
        1. 'fixedMarkdown': the corrected markdown text.
        2. 'corrections': an array of objects, each containing 'original' (the snippet that was wrong), 'fixed' (the correction), and 'reason' (explanation).
        
        Markdown to fix:
        ${markdown}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: GeminiType.OBJECT,
            properties: {
              fixedMarkdown: { type: GeminiType.STRING },
              corrections: {
                type: GeminiType.ARRAY,
                items: {
                  type: GeminiType.OBJECT,
                  properties: {
                    original: { type: GeminiType.STRING },
                    fixed: { type: GeminiType.STRING },
                    reason: { type: GeminiType.STRING },
                  },
                  required: ['original', 'fixed', 'reason']
                }
              }
            },
            required: ['fixedMarkdown', 'corrections']
          }
        },
      });

      const result = JSON.parse(response.text) as GrammarResponse;
      setMarkdown(result.fixedMarkdown);
      setGrammarCorrections(result.corrections);
      setShowAssets(true);
      trackEvent('ai_grammar_fix', { count: result.corrections.length });
    } catch (err) {
      console.error('AI Error:', err);
      setError('Failed to process grammar fix. Please try again.');
    } finally {
      setIsFixing(false);
    }
  };

  const handleFileUpload = (file: File) => {
    if (file.type === 'text/markdown' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          setMarkdown(text);
          setGrammarCorrections([]);
        }
      };
      reader.readAsText(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const insertSample = () => {
    setMarkdown(`# Sample Markdown Document
    
This text has some bad grammer and misspellings heere. Gemini AI will fix it!

## Extractor Demo
- Email: contact@example.com
- Link: [Visit AI Studio](https://ai.studio)
- Image: ![Logo](https://raw.githubusercontent.com/lucide-react/lucide/main/icons/file-text.svg)

## Lists & Highlights
- Feature A: **Instant conversion**
- Feature B: *Client-side privacy*
  - Sub-feature: Word & character counter

### Blockquotes & Code
> "Markdown is a lightweight markup language designed for formatting readability."

\`\`\`javascript
const stripMarkdown = (text) => removeMarkdown(text);
\`\`\`
`);
  };

  const totalAssetsCount = assets.length + grammarCorrections.length;

  if (isAdminView) {
    return <AdminDashboard onBack={() => {
      window.location.hash = '';
      setIsAdminView(false);
    }} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 flex flex-col antialiased">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-md">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 leading-tight">MarkDown Stripper</h1>
                <p className="text-[10px] text-zinc-400 font-medium hidden sm:block">Markdown to Plain Text Converter</p>
              </div>
            </div>

            <nav className="hidden lg:flex items-center gap-5 text-xs font-medium text-zinc-500 pl-4 border-l border-zinc-200">
              <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
              <a href="#how-to-use" className="hover:text-indigo-600 transition-colors">How It Works</a>
              <a href="#syntax-reference" className="hover:text-indigo-600 transition-colors">Syntax Matrix</a>
              <a href="#use-cases" className="hover:text-indigo-600 transition-colors">Use Cases</a>
              <a href="#faq" className="hover:text-indigo-600 transition-colors">FAQ</a>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* AI Polish Button (Desktop) */}
            <button
              onClick={handleFixGrammar}
              disabled={!markdown.trim() || isFixing}
              className="hidden sm:flex items-center gap-2 text-xs sm:text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 px-3.5 py-2 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed group min-h-[40px]"
            >
              {isFixing ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-400 group-hover:scale-125 transition-transform" />
              )}
              <span>AI Grammar Fix</span>
            </button>

            {/* Sample & Upload Buttons (Desktop) */}
            <div className="hidden md:flex items-center gap-1 border-l pl-2 border-zinc-200">
              <button
                onClick={insertSample}
                className="text-xs font-medium text-zinc-600 hover:text-indigo-600 transition-colors px-2.5 py-2 rounded-lg hover:bg-zinc-100 min-h-[40px]"
              >
                Sample
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-indigo-600 transition-colors px-2.5 py-2 rounded-lg hover:bg-zinc-100 min-h-[40px]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>
            </div>

            {/* Insights & Assets Toggle */}
            <button
              onClick={() => setShowAssets(!showAssets)}
              className={`p-2.5 rounded-xl transition-all relative min-h-[44px] min-w-[44px] flex items-center justify-center ${
                showAssets ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200'
              }`}
              title={showAssets ? "Hide Insights & Assets" : "Show Insights & Assets"}
              aria-label="Toggle Insights Drawer"
            >
              {showAssets ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
              {totalAssetsCount > 0 && !showAssets && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-indigo-600 rounded-full ring-2 ring-white" />
              )}
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2.5 rounded-xl text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden" 
              accept=".md,.txt"
            />
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-zinc-100 bg-white px-4 py-4 space-y-3 shadow-lg overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 pb-3 border-b border-zinc-100">
                <button
                  onClick={() => {
                    handleFixGrammar();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={!markdown.trim() || isFixing}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-zinc-900 text-white p-3 rounded-xl min-h-[44px] disabled:opacity-40"
                >
                  {isFixing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Sparkles className="w-4 h-4 text-indigo-400" />}
                  <span>AI Polish</span>
                </button>
                <button
                  onClick={() => {
                    insertSample();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-zinc-100 text-zinc-700 p-3 rounded-xl min-h-[44px] hover:bg-zinc-200 active:scale-98"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Insert Sample</span>
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-zinc-100 text-zinc-700 p-3 rounded-xl min-h-[44px] hover:bg-zinc-200 active:scale-98"
                >
                  <Upload className="w-4 h-4 text-zinc-600" />
                  <span>Upload File</span>
                </button>
                <button
                  onClick={() => {
                    handleClear();
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={!markdown}
                  className="flex items-center justify-center gap-2 text-xs font-semibold bg-red-50 text-red-600 p-3 rounded-xl min-h-[44px] hover:bg-red-100 active:scale-98 disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span>Clear All</span>
                </button>
              </div>

              <div className="flex flex-col space-y-1 text-sm font-medium text-zinc-600 pt-1">
                <a 
                  href="#features" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  Features
                </a>
                <a 
                  href="#how-to-use" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  How It Works
                </a>
                <a 
                  href="#syntax-reference" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  Syntax Matrix
                </a>
                <a 
                  href="#use-cases" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  Use Cases
                </a>
                <a 
                  href="#faq" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg hover:bg-zinc-50 hover:text-indigo-600 transition-colors"
                >
                  FAQ
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 relative">
        <main className={`transition-all duration-300 ease-in-out px-3 sm:px-6 lg:px-8 py-4 sm:py-8 ${showAssets ? 'lg:mr-96' : ''}`}>
          <div className="max-w-7xl mx-auto space-y-4">
            
            {/* Mobile View Switcher (Visible on small & medium screens < lg) */}
            <div className="lg:hidden flex items-center justify-between bg-zinc-200/70 p-1 rounded-xl gap-1 text-xs font-semibold text-zinc-600">
              <button
                onClick={() => setMobileTab('input')}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[38px] ${
                  mobileTab === 'input' ? 'bg-white text-zinc-900 shadow-sm font-bold' : 'hover:text-zinc-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Input</span>
              </button>
              <button
                onClick={() => setMobileTab('output')}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[38px] ${
                  mobileTab === 'output' ? 'bg-white text-zinc-900 shadow-sm font-bold' : 'hover:text-zinc-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Output</span>
              </button>
              <button
                onClick={() => setMobileTab('both')}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[38px] ${
                  mobileTab === 'both' ? 'bg-white text-zinc-900 shadow-sm font-bold' : 'hover:text-zinc-900'
                }`}
              >
                <Columns className="w-3.5 h-3.5 text-zinc-500" />
                <span>Split</span>
              </button>
            </div>

            {/* Quick Actions Row (Mobile) */}
            <div className="flex sm:hidden items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleFixGrammar}
                  disabled={!markdown.trim() || isFixing}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-900 text-white px-3 py-2 rounded-xl min-h-[40px] disabled:opacity-40 active:scale-95 whitespace-nowrap"
                >
                  {isFixing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
                  <span>AI Fix</span>
                </button>
                <button
                  onClick={insertSample}
                  className="text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 px-3 py-2 rounded-xl min-h-[40px] hover:bg-zinc-50 active:scale-95 whitespace-nowrap"
                >
                  Sample
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 px-3 py-2 rounded-xl min-h-[40px] hover:bg-zinc-50 active:scale-95 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Upload</span>
                </button>
              </div>

              {markdown && (
                <button
                  onClick={handleClear}
                  className="p-2 text-zinc-400 hover:text-red-600 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center"
                  title="Clear Input"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Editor Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 min-h-[480px]">
            
              {/* Input Section */}
              <section 
                className={`flex flex-col bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden relative ${
                  isDragging ? 'border-indigo-500 bg-indigo-50/10' : 'border-zinc-200 shadow-sm sm:shadow-md'
                } ${mobileTab === 'output' ? 'hidden lg:flex' : 'flex'}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
              >
                <div className="px-3 sm:px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="flex items-center gap-2 text-zinc-700">
                    <Type className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold uppercase tracking-wider">Markdown Input</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {markdown && (
                      <button
                        onClick={handleClear}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Clear Input"
                        aria-label="Clear Input"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                {error && (
                  <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center gap-2 text-red-600 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto hover:text-red-800 uppercase text-[10px] font-bold py-1 px-2">Dismiss</button>
                  </div>
                )}

                <textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder="Paste your markdown here or drop a file (.md, .txt)..."
                  className="flex-1 p-4 sm:p-6 resize-none focus:outline-none text-zinc-800 font-mono text-base sm:text-sm leading-relaxed placeholder:text-zinc-300 min-h-[300px] sm:min-h-[380px]"
                />
                
                {isDragging && (
                  <div className="absolute inset-0 bg-indigo-600/5 backdrop-blur-[1px] flex items-center justify-center pointer-events-none p-4">
                    <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-indigo-100 flex items-center gap-3 scale-105 transition-transform">
                      <Upload className="w-6 h-6 text-indigo-600 animate-bounce" />
                      <span className="font-semibold text-indigo-900 text-sm">Drop to Import</span>
                    </div>
                  </div>
                )}
              </section>

              {/* Output Section */}
              <section 
                className={`flex flex-col bg-white rounded-2xl border border-zinc-200 shadow-sm sm:shadow-md overflow-hidden relative ${
                  mobileTab === 'input' ? 'hidden lg:flex' : 'flex'
                }`}
              >
                <div className="px-3 sm:px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="flex items-center gap-2 text-zinc-700">
                    <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wider">Plain Text Output</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="flex items-center bg-zinc-100 rounded-xl p-0.5">
                      <button
                        onClick={handleExportText}
                        disabled={!plainText}
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-30 disabled:hover:text-zinc-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Export to .TXT"
                        aria-label="Export plain text file"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleExportDocx}
                        disabled={!plainText}
                        className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-30 disabled:hover:text-zinc-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Export to .DOCX (Word)"
                        aria-label="Export Microsoft Word document"
                      >
                        <FileOutput className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={handleCopy}
                      disabled={!plainText}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[38px] active:scale-95 ${
                        copied 
                          ? 'bg-emerald-600 text-white shadow-emerald-100 shadow-md' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 shadow-md disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                      aria-label="Copy plain text to clipboard"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-4 sm:p-6 overflow-auto bg-zinc-50/30 min-h-[300px] sm:min-h-[380px]">
                  {plainText ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-zinc-800 selection:bg-indigo-100">
                      {plainText}
                    </pre>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-300 gap-3 py-16 text-center">
                      <div className="w-12 h-12 rounded-full border-2 border-dashed border-zinc-200 flex items-center justify-center animate-pulse">
                        <ArrowRightLeft className="w-5 h-5 text-zinc-400" />
                      </div>
                      <p className="text-xs sm:text-sm font-medium text-zinc-400">Converted plain text appears here automatically</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>

        {/* Sidebar Drawer: Assets & Grammar Insight (Fully responsive modal on mobile) */}
        <AnimatePresence mode="wait">
          {showAssets && (
            <>
              {/* Mobile Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAssets(false)}
                className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs z-40 lg:hidden"
              />

              <motion.aside
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="fixed lg:absolute right-0 top-0 bottom-0 w-full sm:w-96 max-w-full bg-white border-l border-zinc-200 shadow-2xl z-50 flex flex-col"
              >
                <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-indigo-100 shadow-lg">
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-zinc-900 text-base leading-tight">Insights</h2>
                      <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest">AI & Extractor</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowAssets(false)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Close Insights Drawer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-200">
                  {/* Grammar Corrections section */}
                  {grammarCorrections.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          AI Grammar Fixes
                        </div>
                        <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {grammarCorrections.length} Fixed
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {grammarCorrections.map((corr, i) => (
                          <div key={i} className="bg-zinc-50/70 border border-zinc-200/80 rounded-xl p-3.5 shadow-xs">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-[9px] font-bold text-red-500 uppercase bg-red-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Before</span>
                                <p className="text-xs text-zinc-500 line-through break-all">{corr.original}</p>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-[9px] font-bold text-emerald-600 uppercase bg-emerald-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">After</span>
                                <p className="text-xs text-zinc-900 font-semibold break-all">{corr.fixed}</p>
                              </div>
                              <p className="text-[11px] text-zinc-500 italic pl-2 border-l-2 border-indigo-200 mt-1">
                                {corr.reason}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {assets.length === 0 && grammarCorrections.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mb-1">
                        <Sparkles className="w-6 h-6 text-zinc-400" />
                      </div>
                      <p className="text-sm font-semibold text-zinc-700">No assets detected yet</p>
                      <p className="text-xs text-zinc-400 max-w-[220px]">
                        Links, images, emails, and grammar fixes will automatically populate here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <AssetList title="Links" icon={<LinkIcon className="w-3.5 h-3.5" />} items={assets.filter(a => a.type === 'link')} />
                      <AssetList title="Images" icon={<ImageIcon className="w-3.5 h-3.5" />} items={assets.filter(a => a.type === 'image')} />
                      <AssetList title="Emails" icon={<Mail className="w-3.5 h-3.5" />} items={assets.filter(a => a.type === 'email')} />
                    </div>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Stats Bar (Responsive Wrapping) */}
      <div className="w-full border-t border-b border-zinc-200 bg-white z-20 shadow-[0_-1px_3px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-2 sm:gap-6 justify-between items-center text-zinc-500 text-[11px] font-medium">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="flex items-center gap-2 font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <span>Words: <strong className="text-zinc-800">{markdown.trim() ? markdown.trim().split(/\s+/).length : 0}</strong></span>
            </span>
            <span className="flex items-center gap-2 font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Characters: <strong className="text-zinc-800">{markdown.length}</strong></span>
            </span>
            {assets.length > 0 && (
              <span className="hidden xs:flex items-center gap-2 font-mono">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Assets: <strong className="text-zinc-800">{assets.length}</strong></span>
              </span>
            )}
          </div>
          <div className="text-zinc-400 text-[10px] text-center sm:text-right">
            <span>Powered by <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-indigo-600 font-mono">Gemini AI</code> & <code className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600 font-mono">remove-markdown</code></span>
          </div>
        </div>
      </div>

      {/* SEO Content Section */}
      <SeoContent />

      {/* SEO Footer */}
      <SeoFooter />
    </div>
  );
}

function AssetList({ title, items, icon }: { title: string; items: ExtractedAsset[]; icon: React.ReactNode }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
        <span className="text-indigo-600">{icon}</span>
        <span>{title}</span>
        <span className="text-[10px] bg-zinc-100 text-zinc-600 font-bold px-2 py-0.5 rounded-full ml-auto">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((asset, i) => (
          <div key={`${asset.value}-${i}`} className="flex items-center justify-between p-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 hover:bg-white hover:border-indigo-200 transition-all text-xs group">
            <div className="flex flex-col truncate pr-2">
              {asset.label && <span className="font-semibold text-zinc-800 truncate mb-0.5">{asset.label}</span>}
              <span className="text-zinc-500 truncate font-mono text-[11px]">{asset.value}</span>
            </div>
            <a 
              href={asset.type === 'email' ? `mailto:${asset.value}` : asset.value} 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 bg-white border border-zinc-200 text-zinc-500 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center shadow-2xs"
              aria-label={`Open ${title} link`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
