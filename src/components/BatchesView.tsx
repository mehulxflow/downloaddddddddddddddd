import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  AlertCircle,
  BookOpen,
  Pin,
  Play,
  FileText,
  Sparkles,
  LoaderCircle,
  X,
} from 'lucide-react';
import {
  type BatchItem,
  type LectureItem,
  type BatchCategoryFilter,
  filterAndSortBatches,
} from '../utils/formatters';
import { searchGlobalLectures } from '../services/api';

interface BatchesViewProps {
  batches: BatchItem[];
  loading: boolean;
  error: string | null;
  savedBatchIds: Set<string>;
  pinnedBatchIds: Set<string>;
  onToggleSaveBatch: (courseId: string) => void;
  onTogglePinBatch: (courseId: string) => void;
  onSelectBatch: (batch: BatchItem) => void;
  onSelectGlobalLecture?: (lecture: LectureItem) => void;
  onOpenGlobalPdf?: (lecture: LectureItem) => void;
  onRetry: () => void;
}

const CATEGORIES: Array<{ id: BatchCategoryFilter; label: string }> = [
  { id: 'all', label: 'All Batches' },
  { id: 'pinned', label: '📌 Pinned on Top' },
  { id: 'kgs', label: 'KGS Batches' },
  { id: 'pw', label: 'PWThor Batches' },
  { id: 'sachin', label: 'Sachin Academy' },
  { id: 'bpsc', label: 'BPSC / TRE' },
  { id: 'upsc', label: 'UPSC / Foundation' },
  { id: 'ctet', label: 'CTET / TET' },
  { id: 'archived', label: 'Archived Batches' },
  { id: 'saved', label: 'Bookmarked' },
];

export const BatchesView: React.FC<BatchesViewProps> = ({
  batches,
  loading,
  error,
  savedBatchIds,
  pinnedBatchIds,
  onToggleSaveBatch,
  onTogglePinBatch,
  onSelectBatch,
  onSelectGlobalLecture,
  onOpenGlobalPdf,
  onRetry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'batches' | 'lectures'>('batches');
  const [globalLectures, setGlobalLectures] = useState<LectureItem[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [category, setCategory] = useState<BatchCategoryFilter>('all');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const filteredBatches = useMemo(
    () =>
      filterAndSortBatches(
        batches,
        searchMode === 'batches' ? searchQuery : '',
        category,
        savedBatchIds,
        pinnedBatchIds
      ),
    [batches, searchQuery, searchMode, category, savedBatchIds, pinnedBatchIds]
  );

  // Trigger instant global lecture search when in 'lectures' mode or when user types a query
  useEffect(() => {
    if (searchMode !== 'lectures' || searchQuery.trim().length < 2) {
      setGlobalLectures([]);
      setGlobalSearching(false);
      return;
    }
    let cancelled = false;
    setGlobalSearching(true);
    const timer = setTimeout(() => {
      searchGlobalLectures(searchQuery.trim()).then((res) => {
        if (!cancelled) {
          setGlobalLectures(res);
          setGlobalSearching(false);
        }
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchMode]);

  const archivedCount = useMemo(
    () => batches.filter((b) => b.isArchived).length,
    [batches]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Search & Global Lecture Search Mode Toggle */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            aria-label={
              searchMode === 'batches'
                ? 'Search batches'
                : 'Search all lectures and PDF notes'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              searchMode === 'batches'
                ? 'Search batches (e.g. 71st BPSC, UPSC, Maths, TRE 4.0, CTET, KGS)...'
                : 'Search any lecture topic, teacher, or PDF across all batches (e.g. Polity, History, Khan Sir)...'
            }
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-2.5 min-h-[44px] text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Toggle between Batch Search and Study ROOM Global Lecture/PDF Search */}
        <div className="inline-flex items-center rounded-xl bg-slate-200/75 p-1 shrink-0">
          <button
            type="button"
            onClick={() => setSearchMode('batches')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              searchMode === 'batches'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Search Batches
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('lectures')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              searchMode === 'lectures'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <span>Global Lecture & PDF Search</span>
          </button>
        </div>
      </div>

      {/* Global Lecture & PDF Search Results Panel */}
      {searchMode === 'lectures' && (
        <div className="mb-8 rounded-2xl border border-blue-200 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Global Lecture & PDF Search Across All mehulxstudy Courses
              </h2>
              <p className="text-xs text-slate-500">
                Type at least 2 characters above to find and play any visible video lecture or PDF handout across KGS, PWThor, and Sachin Academy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchMode('batches');
                setSearchQuery('');
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Back to Batches Grid
            </button>
          </div>

          {globalSearching && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600">
              <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
              <span>Searching lectures and PDF handouts...</span>
            </div>
          )}

          {!globalSearching && searchQuery.trim().length >= 2 && globalLectures.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              No lectures or PDF notes matched "{searchQuery}".
            </div>
          )}

          {!globalSearching && globalLectures.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[520px] overflow-y-auto pr-1">
              {globalLectures.map((lec) => {
                const hasPdf = Boolean(lec.pdf_link);
                return (
                  <div
                    key={lec.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 hover:border-blue-400 transition-colors"
                  >
                    <div>
                      <div className="text-[11px] text-slate-500 mb-1 line-clamp-1">
                        <span className="font-semibold text-blue-600">
                          {lec.courseName || 'Study ROOM'}
                        </span>
                        {lec.folderName && ` · ${lec.folderName}`}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 mb-2">
                        {lec.Title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70">
                      {lec.type !== 'note' && onSelectGlobalLecture && (
                        <button
                          type="button"
                          onClick={() => onSelectGlobalLecture(lec)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 min-h-[38px] text-xs font-bold text-white hover:bg-blue-700 transition-colors"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Watch In-App</span>
                        </button>
                      )}
                      {hasPdf && onOpenGlobalPdf && (
                        <button
                          type="button"
                          onClick={() => onOpenGlobalPdf(lec)}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 min-h-[38px] text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5 text-blue-600" />
                          <span>PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Segmented Category Filter Bar */}
      <div className="mb-6 flex items-center gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-3.5 py-2 min-h-[42px] text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat.label}
              {cat.id === 'pinned' && pinnedBatchIds.size > 0
                ? ` (${pinnedBatchIds.size})`
                : ''}
              {cat.id === 'archived' && archivedCount > 0
                ? ` (${archivedCount})`
                : ''}
              {cat.id === 'saved' && savedBatchIds.size > 0
                ? ` (${savedBatchIds.size})`
                : ''}
            </button>
          );
        })}
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse"
            >
              <div className="aspect-video w-full rounded-xl bg-slate-100 mb-4" />
              <div className="h-5 w-3/4 rounded bg-slate-200 mb-2" />
              <div className="h-4 w-1/2 rounded bg-slate-100 mb-4" />
              <div className="h-9 w-full rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center max-w-lg mx-auto my-12">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 mb-3" />
          <h2 className="text-base font-semibold text-red-900">Unable to Load Batches</h2>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && !error && filteredBatches.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center max-w-md mx-auto my-12">
          <BookOpen className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <h2 className="text-base font-semibold text-slate-900">No Matching Batches</h2>
          <p className="mt-1 text-sm text-slate-500">
            {category === 'pinned'
              ? 'You have not pinned any batches yet. Click the 📌 Pin icon on any batch to lock it at the very top of your dashboard.'
              : category === 'saved'
              ? 'You have not bookmarked any batches into your Saved Vault tab yet. Click the bookmark icon on any batch card to pin it here.'
              : `No batch matched "${searchQuery}".`}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setCategory('all');
            }}
            className="mt-4 px-4 py-2 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Show All Batches
          </button>
        </div>
      )}

      {/* Batches Grid */}
      {!loading && !error && filteredBatches.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBatches.map((batch) => {
            const is2026 = (batch.course_name || '').includes('2026');
            const isSaved = savedBatchIds.has(String(batch.id));
            const isPinned =
              pinnedBatchIds.has(String(batch.id)) ||
              pinnedBatchIds.has(batch.course_name);

            const isStudyRoom = Boolean(batch.isStudyRoom);
            const ext = (batch.course_thumbnail || '').includes('.jpg') ? '.jpg' : '.png';
            const primaryThumbUrl = isStudyRoom
              ? batch.course_thumbnail || ''
              : `/assets/batches/${batch.id}${ext}`;
            const hasValidImage =
              Boolean(primaryThumbUrl) && !failedImages[String(batch.id)];

            const providerLabel =
              batch.provider === 'kgs'
                ? 'Khan Global Studies (KGS)'
                : batch.provider === 'pwthor'
                ? 'Physics Wallah (PWThor)'
                : 'Sachin Academy';

            return (
              <article
                key={batch.id}
                className={`group flex flex-col justify-between rounded-2xl border p-4 transition-all duration-150 ${
                  isPinned
                    ? 'border-amber-400/90 bg-amber-50/20 ring-1 ring-amber-300/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-blue-400'
                }`}
              >
                <div>
                  {/* Course Thumbnail with Resilient Branded Fallback */}
                  <div
                    onClick={() => onSelectBatch(batch)}
                    className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 mb-3.5 cursor-pointer"
                  >
                    {isPinned && (
                      <div className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 rounded-lg bg-amber-500/95 px-2 py-0.5 text-[11px] font-bold text-slate-950 backdrop-blur-xs shadow-md">
                        <Pin className="h-3 w-3 fill-current rotate-45" />
                        <span>Pinned on Top</span>
                      </div>
                    )}

                    {hasValidImage ? (
                      <img
                        src={primaryThumbUrl}
                        alt={batch.course_name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        onError={() => {
                          setFailedImages((prev) => ({
                            ...prev,
                            [String(batch.id)]: true,
                          }));
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-5 text-white">
                        <div className="flex items-center justify-between text-xs text-blue-200 font-medium">
                          <span>{providerLabel}</span>
                          {batch.subjectCount ? (
                            <span className="font-mono tabular-nums">
                              {batch.subjectCount} Subjects
                            </span>
                          ) : (
                            <span className="font-mono tabular-nums">HD In-App</span>
                          )}
                        </div>
                        <div>
                          <p className="text-base font-bold leading-snug text-white line-clamp-2">
                            {batch.course_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {batch.lectureCount
                              ? `${batch.lectureCount} In-App Video Lectures & PDF Notes`
                              : 'Live Classes · Recorded Video Lectures · Class PDFs'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Unboxed Metadata Kicker (Zero-Pill Discipline) */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      {isPinned ? (
                        <span className="font-bold text-amber-600">📌 Pinned</span>
                      ) : batch.provider === 'kgs' ? (
                        <span className="font-semibold text-blue-600">KGS Live</span>
                      ) : batch.provider === 'pwthor' ? (
                        <span className="font-semibold text-indigo-600">PWThor</span>
                      ) : (
                        <span className="font-semibold text-blue-600">
                          {is2026 ? 'Sachin 2026' : 'Sachin Academy'}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      {batch.subjectCount || batch.lectureCount ? (
                        <span className="font-mono font-semibold text-slate-700 tabular-nums">
                          {batch.subjectCount || 0} Subjects · {batch.lectureCount || 0} Lectures
                        </span>
                      ) : (
                        <span>Permanent Access</span>
                      )}
                      {isSaved && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 font-medium">Bookmarked</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Pin to Top Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePinBatch(String(batch.id));
                        }}
                        aria-label={
                          isPinned
                            ? `Unpin ${batch.course_name} from top`
                            : `Pin ${batch.course_name} to top`
                        }
                        title={
                          isPinned
                            ? 'Pinned on Top (क्लिक करके अनपिन करें)'
                            : 'Pin to Top (सबसे ऊपर पिन करें)'
                        }
                        className={`p-1.5 rounded-lg transition-colors ${
                          isPinned
                            ? 'text-amber-800 bg-amber-100 hover:bg-amber-200'
                            : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                        }`}
                      >
                        <Pin
                          className={`h-4 w-4 ${isPinned ? 'fill-current rotate-45' : ''}`}
                        />
                      </button>

                      {/* Bookmark to Vault Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSaveBatch(String(batch.id));
                        }}
                        aria-label={
                          isSaved
                            ? `Remove ${batch.course_name} from Saved Vault`
                            : `Save ${batch.course_name} to Permanent Vault`
                        }
                        title={
                          isSaved ? 'Saved in Permanent Vault' : 'Save batch to Vault'
                        }
                        className={`p-1.5 rounded-lg transition-colors ${
                          isSaved
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isSaved ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Batch Title */}
                  <h2
                    onClick={() => onSelectBatch(batch)}
                    className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 cursor-pointer"
                    title={batch.course_name}
                  >
                    {batch.course_name}
                  </h2>
                </div>

                {/* Primary Card Action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onSelectBatch(batch)}
                    className="w-full inline-flex items-center justify-between text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition-colors py-1"
                  >
                    <span>
                      {batch.subjectCount
                        ? `Open ${batch.subjectCount} Subjects (${batch.lectureCount || 0} Lectures)`
                        : 'Explore Subjects'}
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </span>
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
