import React from 'react';
import { FileText, ShieldCheck } from 'lucide-react';

export const SeoFooter: React.FC = () => {
  return (
    <footer className="w-full bg-zinc-900 text-zinc-400 text-sm border-t border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          
          {/* Brand Col */}
          <div className="space-y-3 sm:col-span-2 lg:col-span-1">
            <a href="/" className="flex items-center gap-2 w-fit">
              <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-white font-bold tracking-tight text-base">MarkDown Stripper</span>
            </a>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              The free, instant browser tool to convert Markdown and documents into clean text with optional private OCR and PII scanning.
            </p>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Core features process locally</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Features</h4>
            <ul className="space-y-2.5 text-xs">
              <li><a href="/#features" className="hover:text-indigo-400 transition-colors py-1 block">Real-Time Markdown Stripper</a></li>
              <li><a href="/#how-to-use" className="hover:text-indigo-400 transition-colors py-1 block">How to Convert Guide</a></li>
              <li><a href="/#syntax-reference" className="hover:text-indigo-400 transition-colors py-1 block">Syntax Conversion Matrix</a></li>
              <li><a href="/#use-cases" className="hover:text-indigo-400 transition-colors py-1 block">Supported Use Cases</a></li>
              <li><a href="/#faq" className="hover:text-indigo-400 transition-colors py-1 block">Frequently Asked Questions</a></li>
            </ul>
          </div>

          {/* Conversions & Formats */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Supported Formats</h4>
            <ul className="space-y-2 text-xs">
              <li><span className="text-zinc-300">Markdown (.md) to Plain Text (.txt)</span></li>
              <li><span className="text-zinc-300">Markdown to Word Document (.docx)</span></li>
              <li><span className="text-zinc-300">CommonMark & GitHub Flavored Markdown</span></li>
              <li><span className="text-zinc-300">Asset & Link Extractor</span></li>
              <li><span className="text-zinc-300">Scanned PDF & Image OCR</span></li>
              <li><span className="text-zinc-300">Local PII Scan</span></li>
            </ul>
          </div>

          {/* SEO Tag Cloud */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Popular Searches</h4>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">Markdown to Text</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">Remove Markdown Tags</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">Strip MD formatting</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">Markdown to DOCX</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">Unmarkdown online</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">Clean markdown prompt</span>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-6 sm:pt-8 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 text-center sm:text-left">
          <p>© {new Date().getFullYear()} MarkDown Stripper. All rights reserved. Free & Open online utility.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="/privacy" className="hover:text-zinc-300 transition-colors p-1">Privacy policy</a>
            <a href="/terms" className="hover:text-zinc-300 transition-colors p-1">Terms of use</a>
            <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors p-1">robots.txt</a>
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors p-1">sitemap.xml</a>
            <a href="/site.webmanifest" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors p-1">manifest</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
