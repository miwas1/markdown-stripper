import React, { useState } from 'react';
import { 
  ShieldCheck, Zap, FileOutput, Search, 
  ChevronDown, CheckCircle2, 
  FileText, Layers, Sparkles
} from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "What is MarkDown Stripper and how does it work?",
    answer: "MarkDown Stripper is a specialized online utility that removes Markdown markup formatting syntax (such as headers `#`, bold `**`, italics `*`, links `[text](url)`, code fences, blockquotes, and tables) while preserving the clean, readable textual content and paragraph structure. It processes your text instantly directly in your browser."
  },
  {
    question: "Is my text data private and secure?",
    answer: "Markdown stripping, document import, OCR, safety scanning, semantic review, word counting, asset parsing, and TXT/DOCX generation happen locally in your browser. Optional model files may download, but document text and uploaded files are not sent to the usage-measurement endpoint."
  },
  {
    question: "Can I export stripped Markdown directly to Microsoft Word (.docx)?",
    answer: "Yes! MarkDown Stripper includes built-in document synthesis that converts your stripped plain text into a formatted Microsoft Word (.docx) file ready for download, in addition to standard plain text (.txt) export."
  },
  {
    question: "How does the Link and Image Extractor work?",
    answer: "MarkDown Stripper resolves inline and reference-style links, detects missing definitions, removes definitions from the document body, and can arrange deduplicated links and media in a reference section at the bottom. The Insights panel also keeps links, images, and emails available for review."
  },
  {
    question: "Which document files can I upload?",
    answer: "You can import Markdown, TXT, HTML, Microsoft Word DOCX, PDFs, and common images such as PNG, JPG, and WEBP. Text extraction happens locally in your browser. Scanned PDF pages and images can be sent through optional local OCR with an automatic language suggestion and a manual language selector."
  },
  {
    question: "What does the Safety & Privacy scanner check?",
    answer: "The instant local scanner flags likely credentials, personal data, invisible Unicode, hidden HTML comments, encoded payloads, and possible prompt-injection instructions. After page load, a compact English PII model is prepared during browser idle time and cached for optional deep scans of contextual names, addresses, and identity details without uploading the document. Findings can be selectively redacted, but no scanner is a security guarantee."
  },
  {
    question: "Can it find repeated or similar paragraphs?",
    answer: "Yes. Optional Semantic Insights compare substantial paragraphs locally and show likely repeated passages with similarity scores. The feature is advisory, never rewrites your text, and runs only after you enable its small browser model."
  },
  {
    question: "Why should I convert Markdown to Plain Text?",
    answer: "Stripping Markdown is ideal when copy-pasting content into rich text editors (like Word, Google Docs, or CMS platforms), drafting plain-text email newsletters, preparing clean text for LLM prompts to save tokens, or meeting word count and plain-text submission guidelines."
  }
];

const SYNTAX_EXAMPLES = [
  { element: "Headings (H1-H6)", markdown: "# Title\n## Subtitle", stripped: "Title\nSubtitle" },
  { element: "Bold & Italic", markdown: "**Bold** and *italic*", stripped: "Bold and italic" },
  { element: "Hyperlinks", markdown: "[Google Search](https://google.com)", stripped: "Google Search" },
  { element: "Images", markdown: "![Alt Text](https://example.com/logo.png)", stripped: "Alt Text" },
  { element: "Blockquotes", markdown: "> Markdown is lightweight.", stripped: "Markdown is lightweight." },
  { element: "Code Snippets", markdown: "`const x = 10;`", stripped: "const x = 10;" },
  { element: "Unordered Lists", markdown: "- Item A\n- Item B", stripped: "Item A\nItem B" },
  { element: "Strikethrough", markdown: "~~Old text~~ New text", stripped: "Old text New text" },
];

export const SeoContent: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const filteredFaqs = FAQS.filter(
    f => f.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
         f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white border-t border-zinc-200 mt-8 sm:mt-12">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-14 sm:space-y-20">
        
        {/* Direct Definition Capsule for AI Crawlers & Answer Engines */}
        <section className="bg-gradient-to-br from-indigo-50/70 to-zinc-50 border border-indigo-100 rounded-3xl p-6 sm:p-8 text-left">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-100/60 px-3 py-1 rounded-full">
              Quick Overview & Definition
            </span>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Core features local • No document uploads
            </div>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-2">
            What is MarkDown Stripper?
          </h2>
          <p className="text-zinc-700 text-sm sm:text-base leading-relaxed">
            <strong>MarkDown Stripper</strong> (<a href="https://markdown-stripper.site" className="text-indigo-600 font-medium hover:underline">markdown-stripper.site</a>) is a zero-latency, privacy-focused online utility that removes Markdown syntax formatting—including headings, asterisks, bold/italics, code fences, blockquotes, LaTeX markers, and HTML tags—from raw text to generate clean, readable plain text. It also imports documents and images, offers private OCR for scans, optional PII review and semantic duplicate insights, automatic asset extraction (hyperlinks, images, emails), and direct export to <strong>.TXT</strong> and <strong>Microsoft Word (.DOCX)</strong> files directly within your browser.
          </p>
        </section>

        {/* Core Features Grid */}
        <section id="features" className="scroll-mt-20">
          <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
            <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
              Why MarkDown Stripper
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mt-3 tracking-tight">
              The Fast, Privacy-First Markdown to Plain Text Converter
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base mt-2">
              Engineered for writers, developers, students, and content creators who need clean, unformatted text without manual editing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-indigo-100 shadow-lg">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Instant Structure-Aware Modes</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Switch between maximum-cleanup Plain, structured Readable, and safely wrapped AI-ready output without waiting for a server.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-4 shadow-emerald-100 shadow-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Local-First Privacy</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Your content is processed directly in your browser session. Core conversion, OCR, privacy scanning, and semantic review keep document text on your device.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-4 shadow-indigo-100 shadow-lg">
                <FileOutput className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Multi-Format Export</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Download your unformatted text as a clean <code className="text-indigo-600 font-mono">.txt</code> file or a standard Microsoft Word <code className="text-indigo-600 font-mono">.docx</code> document.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center mb-4 shadow-amber-100 shadow-lg">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Asset & Link Extraction</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Never lose embedded resources. Markdown Stripper catalogues all links, images, and email addresses in an interactive sidebar.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-indigo-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center mb-4 shadow-sky-100 shadow-lg">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Local Document Import</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Drag in Markdown, TXT, HTML, DOCX, PDF, or image documents. Heavy parsers and OCR load only when their capability is selected.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-violet-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center mb-4 shadow-violet-100 shadow-lg">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Local Semantic Insights</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Find likely repeated paragraphs and related passages with optional on-device embeddings. Results are reviewable suggestions, never silent edits.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/50 hover:border-amber-100 hover:bg-white hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-4 shadow-amber-100 shadow-lg">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Private OCR for Scans</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Recover printed text from scanned PDF pages and images locally, with language suggestions, page progress, confidence warnings, and manual review.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-to-use" className="scroll-mt-20 border-t border-zinc-100 pt-10 sm:pt-16">
          <div className="max-w-3xl mb-8 sm:mb-12">
            <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
              Step-by-Step Guide
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mt-3 tracking-tight">
              How to Convert Markdown to Clean Plain Text Online
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base mt-2">
              Transform formatted Markdown files or text snippets into unformatted plain text in three simple steps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
            <div className="flex flex-col space-y-3 bg-zinc-50 p-5 sm:p-6 rounded-2xl border border-zinc-200/80">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-indigo-100 shadow-md">
                1
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-zinc-900">Input Your Markdown</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Paste Markdown into the input editor or drop a Markdown, document, PDF, or image file from your device.
              </p>
            </div>

            <div className="flex flex-col space-y-3 bg-zinc-50 p-5 sm:p-6 rounded-2xl border border-zinc-200/80">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-indigo-100 shadow-md">
                2
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-zinc-900">Review Stripped Output</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Watch the live output panel strip headers, asterisks, formatting marks, and links while preserving paragraph breaks.
              </p>
            </div>

            <div className="flex flex-col space-y-3 bg-zinc-50 p-5 sm:p-6 rounded-2xl border border-zinc-200/80">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-indigo-100 shadow-md">
                3
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-zinc-900">Copy or Download</h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Click <strong>Copy</strong> for instant clipboard access or download the result as a <code className="font-mono text-xs bg-zinc-200 px-1 py-0.5 rounded">.txt</code> or <code className="font-mono text-xs bg-zinc-200 px-1 py-0.5 rounded">.docx</code> file.
              </p>
            </div>
          </div>
        </section>

        {/* Syntax Conversion Reference Table / Responsive Matrix */}
        <section id="syntax-reference" className="scroll-mt-20 border-t border-zinc-100 pt-10 sm:pt-16">
          <div className="max-w-3xl mb-6 sm:mb-8">
            <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
              Syntax Conversion Matrix
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mt-3 tracking-tight">
              Markdown Syntax vs. Stripped Plain Text
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base mt-2">
              See how common Markdown tags, syntax elements, and formatting codes are cleanly stripped:
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm -mx-3 sm:mx-0">
            <table className="w-full text-left text-xs sm:text-sm text-zinc-600 border-collapse min-w-[500px]">
              <thead className="bg-zinc-50 text-[11px] sm:text-xs uppercase font-bold text-zinc-500 tracking-wider border-b border-zinc-200">
                <tr>
                  <th className="px-4 sm:px-6 py-3">Markdown Element</th>
                  <th className="px-4 sm:px-6 py-3">Original Markdown Input</th>
                  <th className="px-4 sm:px-6 py-3">Stripped Plain Text Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {SYNTAX_EXAMPLES.map((item, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-4 sm:px-6 py-3.5 font-semibold text-zinc-900 whitespace-nowrap">
                      {item.element}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 font-mono text-[11px] sm:text-xs text-indigo-900 bg-indigo-50/30">
                      <pre className="whitespace-pre-wrap font-mono">{item.markdown}</pre>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 font-mono text-[11px] sm:text-xs text-zinc-800 bg-zinc-50/50">
                      <pre className="whitespace-pre-wrap font-mono">{item.stripped}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Use Cases Section */}
        <section id="use-cases" className="scroll-mt-20 border-t border-zinc-100 pt-10 sm:pt-16">
          <div className="max-w-3xl mb-8 sm:mb-12">
            <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
              Versatile Applications
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mt-3 tracking-tight">
              Popular Use Cases for Markdown Stripping
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base mt-2">
              Discover why professionals rely on Markdown Stripper across varied workflows:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 space-y-2">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ChatGPT & Claude Output Cleaner
              </h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Remove pesky asterisks (<code className="text-indigo-600 font-mono text-xs">**</code>), bold headings, and fenced backticks from AI responses before pasting into presentations or chat apps.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 space-y-2">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                LinkedIn & Social Media Posts
              </h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Clean markdown drafts for LinkedIn, X (Twitter), Slack, and Discord where unsupported raw markdown tags look messy.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 space-y-2">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                Word Processors & CMS Publishing
              </h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Paste clean text into Microsoft Word, Google Docs, Notion, or WordPress without stubborn Markdown hash symbols breaking layouts.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 space-y-2">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                LLM & AI Prompt Optimization
              </h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Strip bulky markdown tags and brackets from long training texts or prompt datasets to minimize token consumption and reduce API latency.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 space-y-2">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                Plain-Text Newsletters & Email
              </h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Prepare distraction-free plain-text versions of technical blog posts and documentation for email campaigns or SMS feeds.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl border border-zinc-100 bg-zinc-50/40 space-y-2">
              <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                Academic & Resume Formatting
              </h3>
              <p className="text-zinc-600 text-xs sm:text-sm leading-relaxed">
                Convert markdown CVs, research summaries, and cover letters into standardized plain text required by automated applicant tracking systems (ATS).
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Accordion Section */}
        <section id="faq" className="scroll-mt-20 border-t border-zinc-100 pt-10 sm:pt-16">
          <div className="max-w-3xl mb-6 sm:mb-8">
            <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
              Got Questions?
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mt-3 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base mt-2">
              Everything you need to know about stripping Markdown formatting, privacy, and supported features.
            </p>

            <div className="mt-5 sm:mt-6 relative max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search FAQ questions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-base sm:text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredFaqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div 
                  key={index}
                  className={`border rounded-2xl transition-all overflow-hidden ${
                    isOpen ? 'border-indigo-200 bg-indigo-50/20 shadow-xs' : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <button
                    data-track-button="faq_toggle"
                    onClick={() => toggleFaq(index)}
                    className="w-full px-4 sm:px-6 py-4 flex items-center justify-between text-left focus:outline-none min-h-[48px]"
                    aria-expanded={isOpen}
                  >
                    <span className="font-semibold text-zinc-900 text-sm sm:text-base pr-3 leading-snug">
                      {faq.question}
                    </span>
                    <span className={`p-1.5 rounded-full transition-transform shrink-0 ${isOpen ? 'rotate-180 text-indigo-600 bg-indigo-100' : 'text-zinc-400 bg-zinc-100'}`}>
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-6 pb-5 pt-1 text-zinc-600 text-xs sm:text-sm leading-relaxed border-t border-indigo-100/50">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredFaqs.length === 0 && (
              <div className="p-6 sm:p-8 text-center bg-zinc-50 rounded-2xl border border-zinc-200">
                <p className="text-zinc-500 text-sm">No matching questions found for "{searchQuery}".</p>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
};
