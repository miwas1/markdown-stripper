import React, { useEffect } from 'react';
import { ArrowLeft, ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import { SeoFooter } from './SeoFooter';

type LegalPageKind = 'privacy' | 'terms';

const LAST_UPDATED = 'August 30, 2026';

const PAGE_DETAILS: Record<LegalPageKind, {
  title: string;
  description: string;
}> = {
  privacy: {
    title: 'Privacy Policy',
    description: 'How MarkDown Stripper processes documents, usage measurements, and information about this website.',
  },
  terms: {
    title: 'Terms of Use',
    description: 'The rules and conditions for using MarkDown Stripper and its browser-based document tools.',
  },
};

export const LegalPage: React.FC<{ kind: LegalPageKind }> = ({ kind }) => {
  const details = PAGE_DETAILS[kind];
  const path = `/${kind}`;

  useEffect(() => {
    const previousTitle = document.title;
    const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousDescription = descriptionMeta?.content;
    const previousCanonical = canonicalLink?.href;

    document.title = `${details.title} | MarkDown Stripper`;
    if (descriptionMeta) descriptionMeta.content = details.description;
    if (canonicalLink) canonicalLink.href = `https://markdown-stripper.site${path}`;
    window.scrollTo({ top: 0, behavior: 'auto' });

    return () => {
      document.title = previousTitle;
      if (descriptionMeta && previousDescription !== undefined) descriptionMeta.content = previousDescription;
      if (canonicalLink && previousCanonical) canonicalLink.href = previousCanonical;
    };
  }, [details, path]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 flex flex-col antialiased">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2.5 min-w-0" aria-label="MarkDown Stripper home">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-md shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 leading-tight truncate">MarkDown Stripper</p>
              <p className="text-[10px] text-zinc-400 font-medium hidden sm:block">Markdown to Plain Text Converter</p>
            </div>
          </a>

          <nav className="flex items-center gap-1 sm:gap-2 text-xs font-semibold" aria-label="Legal navigation">
            <a
              href="/privacy"
              className={`px-2.5 sm:px-3 py-2 rounded-lg transition-colors ${kind === 'privacy' ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-500 hover:bg-zinc-50 hover:text-indigo-600'}`}
              aria-current={kind === 'privacy' ? 'page' : undefined}
            >
              Privacy
            </a>
            <a
              href="/terms"
              className={`px-2.5 sm:px-3 py-2 rounded-lg transition-colors ${kind === 'terms' ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-500 hover:bg-zinc-50 hover:text-indigo-600'}`}
              aria-current={kind === 'terms' ? 'page' : undefined}
            >
              Terms
            </a>
            <a href="/" className="hidden sm:inline-flex items-center gap-1.5 ml-1 px-3 py-2 rounded-lg bg-zinc-900 text-white hover:bg-indigo-600 transition-colors">
              Open converter
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <a href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors mb-8">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to MarkDown Stripper
          </a>

          <div className="mb-8 sm:mb-10">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-indigo-600 text-xs font-bold uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
                Legal
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />
                Local-first processing
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-950">{details.title}</h1>
            <p className="mt-4 max-w-2xl text-sm sm:text-base leading-relaxed text-zinc-600">{details.description}</p>
            <p className="mt-4 text-xs text-zinc-400">Last updated: <time dateTime="2026-08-30">{LAST_UPDATED}</time></p>
          </div>

          {kind === 'privacy' ? <PrivacyPolicy /> : <TermsOfUse />}
        </div>
      </main>

      <SeoFooter />
    </div>
  );
};

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-zinc-600">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <article className="bg-white border border-zinc-200 rounded-3xl shadow-sm p-6 sm:p-10 space-y-9 sm:space-y-11">
      <LegalSection title="1. Scope">
        <p>This Privacy Policy explains how MarkDown Stripper (“MarkDown Stripper”, “we”, “us”, or “our”) handles information when you visit and use <a href="https://markdown-stripper.site" className="text-indigo-600 hover:underline">markdown-stripper.site</a> and its document-conversion features.</p>
        <p>MarkDown Stripper does not require an account. These pages describe the current product behavior and may be updated as the service changes.</p>
      </LegalSection>

      <LegalSection title="2. Your documents and text">
        <p>Core conversion, document import, OCR, safety and privacy scanning, semantic review, word counting, reference extraction, and TXT/DOCX generation run in your browser. The text you paste and the files you select are not sent to MarkDown Stripper’s usage-measurement endpoint for processing.</p>
        <p>Files are subject to the browser’s memory and temporary-session behavior. Clear your input or close the browser when you no longer want the content available in the page.</p>
        <p>Optional OCR and local AI features may download model, runtime, or language files to your browser from our dedicated Cloudflare-hosted asset domain. Those requests download capability files only; they never upload your document content. The underlying third-party artifacts remain subject to their respective licenses.</p>
      </LegalSection>

      <LegalSection title="3. Anonymous usage measurements">
        <p>We collect limited aggregate event information to understand whether the service is working and which features are useful. Events can include page views, conversions, imports, exports, OCR completion, privacy scans, semantic scans, and redaction actions.</p>
        <p>Events may include a feature name, conversion or file-format variant, a broad size category, and a success or error outcome. The application does not include document text, file contents, filenames, session identifiers, or device profiles in these events. Requests are sent without credentials and the measurement endpoint does not provide a document-upload service.</p>
        <p>As with any website, hosting, network, and security providers may receive standard request metadata such as an IP address, browser information, or access time in their infrastructure logs. We do not use that metadata to reconstruct the contents of your documents.</p>
      </LegalSection>

      <LegalSection title="4. Cookies and local storage">
        <p>MarkDown Stripper does not require cookies, advertising identifiers, or an account to convert documents. Optional models and normal browser caching may cause your browser to store downloaded capability files. You can clear those files using your browser’s site-data controls.</p>
      </LegalSection>

      <LegalSection title="5. Links and third-party services">
        <p>The app can display or open links found in the content you provide. It can also request optional model or language resources from our dedicated asset domain. When you follow a link or use a third-party service, that provider’s policies govern its handling of your visit and any information you share there.</p>
      </LegalSection>

      <LegalSection title="6. Security and retention">
        <p>Keeping document processing in the browser reduces the need to transmit your content, but no software or internet connection is completely secure. You are responsible for using a trusted device and browser and for reviewing output before sharing it.</p>
        <p>Document content is not intentionally retained on MarkDown Stripper servers. Aggregate usage measurements may be retained as operational records for analytics, troubleshooting, and service improvement.</p>
      </LegalSection>

      <LegalSection title="7. Children’s privacy">
        <p>MarkDown Stripper is not directed to children under 13, and we do not knowingly collect personal information from children. If you believe a child has provided personal information to us, please contact us so we can review the request.</p>
      </LegalSection>

      <LegalSection title="8. Your choices and contact">
        <p>You can choose not to use optional OCR, local AI, semantic, or usage-measurement features, and you can clear browser site data at any time. If you have a privacy question or request, email <a href="mailto:support@markdown-stripper.site" className="text-indigo-600 hover:underline">support@markdown-stripper.site</a>.</p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>We may revise this Privacy Policy when the service or applicable requirements change. The “Last updated” date above indicates when the current version was published. Continued use of the service after an update means you acknowledge the revised policy.</p>
      </LegalSection>
    </article>
  );
}

function TermsOfUse() {
  return (
    <article className="bg-white border border-zinc-200 rounded-3xl shadow-sm p-6 sm:p-10 space-y-9 sm:space-y-11">
      <LegalSection title="1. Acceptance of these Terms">
        <p>By visiting or using MarkDown Stripper (“the service”), you agree to these Terms of Use. If you do not agree, please do not use the service.</p>
        <p>MarkDown Stripper is a browser-based utility for converting and reviewing text and documents. You may use it only in compliance with applicable law and these Terms.</p>
      </LegalSection>

      <LegalSection title="2. Permitted use">
        <p>You may use the service for personal, educational, research, and business purposes, provided that you have the right to access and process the content you provide.</p>
        <p>You are responsible for your documents, the instructions you submit, and the decisions you make from the service’s output. Before sharing converted text, you should review it for accuracy, missing context, formatting changes, and sensitive information.</p>
      </LegalSection>

      <LegalSection title="3. Prohibited conduct">
        <p>You must not use the service to break the law, infringe another person’s rights, distribute malware, attack or overload the service, bypass reasonable technical limits, or interfere with another person’s use of the service.</p>
        <p>You must not represent scanner findings, OCR results, semantic matches, or converted output as guaranteed accurate. The safety scanner is a review aid, not a security, compliance, legal, medical, or financial certification.</p>
      </LegalSection>

      <LegalSection title="4. Your content">
        <p>You retain your rights in the text and files you provide. You grant MarkDown Stripper only the limited permission needed for the browser application to process your content and return the requested output. Core processing is designed to take place locally in your browser.</p>
        <p>You confirm that you have the rights and permissions required to upload, convert, scan, export, or otherwise process the content you provide.</p>
      </LegalSection>

      <LegalSection title="5. Intellectual property">
        <p>The MarkDown Stripper name, interface, source code where not otherwise licensed, visual design, and service materials are owned by or licensed to us and are protected by applicable intellectual-property laws. These Terms give you permission to use the service; they do not transfer ownership of it to you.</p>
        <p>Third-party libraries, model files, language data, and other resources remain subject to their respective licenses and terms.</p>
      </LegalSection>

      <LegalSection title="6. Availability and disclaimers">
        <p>The service is provided on an “as available” and “as is” basis. We do not promise that it will always be available, uninterrupted, error-free, secure, compatible with every file, or suitable for a particular purpose.</p>
        <p>Conversion, OCR, privacy findings, semantic matches, exports, and other output can contain errors or omissions. Do not rely on the service as the sole safeguard for confidential information, legal compliance, accessibility, records management, or any high-stakes decision.</p>
      </LegalSection>

      <LegalSection title="7. Third-party links and resources">
        <p>The service may open links found in your content and may use third-party resources for optional browser capabilities. We do not control or endorse third-party websites, content, availability, or policies. You use them at your own discretion.</p>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <p>To the maximum extent permitted by law, MarkDown Stripper and its operators will not be liable for indirect, incidental, special, consequential, or loss-of-data damages arising from or related to your use of, or inability to use, the service.</p>
        <p>Nothing in these Terms excludes liability that cannot lawfully be excluded or limited under applicable law.</p>
      </LegalSection>

      <LegalSection title="9. Changes or suspension">
        <p>We may change, suspend, or discontinue any part of the service, including features and limits, at any time. We may also update these Terms. The “Last updated” date above identifies the current version; continued use after a change indicates acceptance of the updated Terms.</p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>Questions about these Terms can be sent to <a href="mailto:support@markdown-stripper.site" className="text-indigo-600 hover:underline">support@markdown-stripper.site</a>.</p>
      </LegalSection>
    </article>
  );
}
