import React, { useState } from 'react';
import {
  Download,
  Play,
  FileText,
  Trash2,
  ArrowLeft,
  Check,
  LoaderCircle,
  AlertCircle,
  Video,
} from 'lucide-react';
import {
  type DownloadedItemRecord,
  removeDownloadedItem,
  getVideoBlobFromIdb,
  triggerBrowserBlobDownload,
  startLectureVideoDownload,
  formatBytes,
} from '../services/downloadManager';
import { buildPdfDownloadUrl } from '../utils/crypto';
import { type LectureItem } from '../utils/formatters';

interface DownloadsViewProps {
  items: DownloadedItemRecord[];
  onPlayDownloadedLecture: (record: DownloadedItemRecord) => void;
  onOpenPdfModal: (lecture: LectureItem) => void;
  onBackToBatches: () => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  items,
  onPlayDownloadedLecture,
  onOpenPdfModal,
  onBackToBatches,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'video' | 'pdf'>('all');

  const filtered = items.filter((item) => {
    if (filterType === 'video') return item.type === 'video';
    if (filterType === 'pdf') return item.type === 'pdf';
    return true;
  });

  const handleSaveToDeviceAgain = async (record: DownloadedItemRecord) => {
    const blob = await getVideoBlobFromIdb(record.id);
    if (blob) {
      const cleanTitle = (record.lecture.Title || 'Sachin_Lecture')
        .replace(/[^a-zA-Z0-9_\-\u0900-\u097F ]/g, '_')
        .trim()
        .slice(0, 45);
      triggerBrowserBlobDownload(blob, `${cleanTitle}_${record.quality}.ts`);
    } else {
      startLectureVideoDownload({
        courseId: record.courseId,
        batchName: record.batchName,
        subjectName: record.subjectName,
        topicName: record.topicName,
        lecture: record.lecture,
        qualityLabel: record.quality,
      });
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      {/* Large Mobile-Friendly Back & Header */}
      <div className="mb-4">
        <button
          type="button"
          onClick={onBackToBatches}
          className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-blue-600" />
          <span>Back to Courses</span>
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-blue-600">Offline Library</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{items.length} Saved Items</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              My Downloaded Lectures & PDF Notes
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              All videos and PDFs you download are stored here for instant playback and
              saving to your phone.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 self-start">
            {(['all', 'video', 'pdf'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterType(tab)}
                className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  filterType === tab
                    ? 'bg-white text-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all'
                  ? `All (${items.length})`
                  : tab === 'video'
                  ? `Videos (${items.filter((i) => i.type === 'video').length})`
                  : `PDFs (${items.filter((i) => i.type === 'pdf').length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center max-w-md mx-auto my-8">
          <Download className="mx-auto h-12 w-12 text-slate-400 mb-3" />
          <h2 className="text-base font-bold text-slate-900">No Downloads Yet</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Tap the &ldquo;Download Video&rdquo; or &ldquo;Download PDF&rdquo; button on
            any lecture to save it to your phone and offline library.
          </p>
          <button
            type="button"
            onClick={onBackToBatches}
            className="mt-5 min-h-[48px] px-6 py-3 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Browse Batches & Lectures
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const isVideo = record.type === 'video';
            const isDownloading = record.status === 'downloading';
            const isError = record.status === 'error';

            return (
              <article
                key={record.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 ${
                      isVideo
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {isVideo ? (
                      <Video className="h-6 w-6" />
                    ) : (
                      <FileText className="h-6 w-6" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-semibold text-blue-600">
                        {isVideo ? `Video (${record.quality})` : 'PDF Handout'}
                      </span>
                      {record.subjectName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{record.subjectName}</span>
                        </>
                      )}
                      {record.downloadedBytes > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            {formatBytes(record.downloadedBytes)}
                          </span>
                        </>
                      )}
                    </div>

                    <h2 className="text-base font-bold text-slate-900 mt-0.5 line-clamp-2">
                      {record.lecture.Title}
                    </h2>

                    {isDownloading && (
                      <div className="mt-2.5 max-w-md">
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums text-blue-600 mb-1">
                          <span className="inline-flex items-center gap-1.5">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            <span>
                              Downloading ({record.completedSegments}/
                              {record.totalSegments || '?'} segments)...
                            </span>
                          </span>
                          <span>{record.progressPercent}%</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all"
                            style={{ width: `${record.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {isError && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{record.errorMessage || 'Download failed'}</span>
                      </div>
                    )}

                    {record.status === 'completed' && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                        <Check className="h-3.5 w-3.5" />
                        <span>
                          {isVideo
                            ? 'Saved for offline playback & device storage'
                            : 'PDF Notes ready to read & download'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Big Touch Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isVideo ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onPlayDownloadedLecture(record)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>Play Lecture</span>
                      </button>

                      {record.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleSaveToDeviceAgain(record)}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                        >
                          <Download className="h-4 w-4 text-blue-600" />
                          <span>Save File</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenPdfModal(record.lecture)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
                      >
                        <FileText className="h-4 w-4" />
                        <span>Read PDF</span>
                      </button>

                      {record.pdfUrl && (
                        <a
                          href={buildPdfDownloadUrl(record.pdfUrl, record.lecture.Title)}
                          download
                          className="inline-flex items-center justify-center gap-1.5 min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                        >
                          <Download className="h-4 w-4 text-blue-600" />
                          <span>Download PDF</span>
                        </a>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => removeDownloadedItem(record.id)}
                    aria-label={`Remove ${record.lecture.Title} from downloads`}
                    className="inline-flex items-center justify-center min-h-[46px] min-w-[46px] rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
