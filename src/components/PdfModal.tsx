import React, { useMemo, useState, useRef } from 'react';
import { FileText, ExternalLink, Download, X } from 'lucide-react';
import {
  resolvePdfUrl,
  buildPdfViewerUrl,
  buildPdfDownloadUrl,
} from '../utils/crypto';
import { type LectureItem } from '../utils/formatters';

interface PdfModalProps {
  lecture: LectureItem;
  onClose: () => void;
}

export const PdfModal: React.FC<PdfModalProps> = ({ lecture, onClose }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pdf1 = useMemo(() => resolvePdfUrl(lecture.pdf_link || ''), [lecture.pdf_link]);
  const pdf2 = useMemo(() => resolvePdfUrl(lecture.pdf_link2 || ''), [lecture.pdf_link2]);

  const [activePart, setActivePart] = useState<1 | 2>(1);
  const currentPdfUrl = activePart === 2 && pdf2 ? pdf2 : pdf1 || pdf2;

  const handleExtractAndDownload = async () => {
    try {
      const iframe = iframeRef.current || (document.querySelector('iframe') as HTMLIFrameElement | null);
      const app = (iframe?.contentWindow as any)?.PDFViewerApplication;
      if (app?.pdfDocument) {
        const data = await app.pdfDocument.getData();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        a.download = `${(lecture.Title || 'my_document').replace(/[/\\?%*:|"<>]/g, '_')}${activePart === 2 ? '_Part2' : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        return;
      }
    } catch (err) {
      console.warn('PDFViewerApplication extraction blocked or not ready, falling back:', err);
    }

    if (currentPdfUrl) {
      const fallbackUrl = buildPdfDownloadUrl(currentPdfUrl, `${lecture.Title || 'document'}${activePart === 2 ? '_Part2' : ''}`);
      const a = document.createElement('a');
      a.href = fallbackUrl;
      a.download = `${(lecture.Title || 'my_document').replace(/[/\\?%*:|"<>]/g, '_')}${activePart === 2 ? '_Part2' : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`PDF Notes: ${lecture.Title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 lg:p-6"
    >
      <div className="flex flex-col h-full w-full max-w-6xl max-h-[94vh] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 sm:px-4 py-3">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                {lecture.Title || 'Class PDF Notes'}
              </h2>
              <p className="text-xs text-slate-500">
                Sachin Academy Official Class Handout
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {pdf1 && pdf2 && (
              <div className="inline-flex rounded-xl bg-slate-200 p-1 mr-1">
                <button
                  type="button"
                  onClick={() => setActivePart(1)}
                  className={`px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold ${
                    activePart === 1 ? 'bg-white text-blue-600' : 'text-slate-600'
                  }`}
                >
                  PDF 1
                </button>
                <button
                  type="button"
                  onClick={() => setActivePart(2)}
                  className={`px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold ${
                    activePart === 2 ? 'bg-white text-blue-600' : 'text-slate-600'
                  }`}
                >
                  PDF 2
                </button>
              </div>
            )}

            {currentPdfUrl && (
              <>
                <button
                  type="button"
                  onClick={handleExtractAndDownload}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 min-h-[42px] text-xs font-bold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  <span>Download PDF</span>
                </button>
                <a
                  href={buildPdfViewerUrl(currentPdfUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 min-h-[42px] text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="h-4 w-4 text-blue-600" />
                  <span>New Tab</span>
                </a>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close PDF Viewer"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Embedded PDF Viewer */}
        <div className="flex-1 bg-slate-100">
          {currentPdfUrl ? (
            <iframe
              ref={iframeRef}
              src={buildPdfViewerUrl(currentPdfUrl)}
              title={`PDF Handout for ${lecture.Title}`}
              className="w-full h-full border-0"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <FileText className="h-12 w-12 text-slate-400 mb-3" />
              <h3 className="text-base font-semibold text-slate-800">
                No PDF Available
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Could not decrypt a valid PDF URL for this lecture.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
