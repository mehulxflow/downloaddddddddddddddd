import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Video,
  Radio,
  History,
  Play,
  FileText,
  Download,
  Check,
  LoaderCircle,
  AlertCircle,
  Heart,
  ArrowUpDown,
} from 'lucide-react';
import {
  type BatchItem,
  type SubjectItem,
  type TopicItem,
  type LectureItem,
  formatDurationHuman,
  formatLectureTitle,
} from '../utils/formatters';
import { type DownloadedItemRecord } from '../services/downloadManager';

export type LectureTab =
  | 'study'
  | 'notes-only'
  | 'favorites'
  | 'live-upcoming'
  | 'previous-live';

interface LecturesViewProps {
  batch: BatchItem;
  subject: SubjectItem;
  topic: TopicItem;
  activeTab: LectureTab;
  onTabChange: (tab: LectureTab) => void;
  studyLectures: LectureItem[];
  liveUpcomingLectures: LectureItem[];
  previousLiveLectures: LectureItem[];
  favoriteLectureIds: Set<string>;
  onToggleFavoriteLecture: (lectureId: string) => void;
  downloadedItems: DownloadedItemRecord[];
  loading: boolean;
  error: string | null;
  onSelectLecture: (lecture: LectureItem) => void;
  onDownloadVideo: (lecture: LectureItem) => void;
  onOpenPdf: (lecture: LectureItem) => void;
  onBack: () => void;
  onRetry: () => void;
}

export const LecturesView: React.FC<LecturesViewProps> = ({
  batch,
  subject,
  topic,
  activeTab,
  onTabChange,
  studyLectures,
  liveUpcomingLectures,
  previousLiveLectures,
  favoriteLectureIds,
  onToggleFavoriteLecture,
  downloadedItems,
  loading,
  error,
  onSelectLecture,
  onDownloadVideo,
  onOpenPdf,
  onBack,
  onRetry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'default' | 'newest' | 'oldest'>('default');
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const videoLectures = useMemo(
    () => studyLectures.filter((l) => l.type !== 'note'),
    [studyLectures]
  );

  const pdfNoteLectures = useMemo(
    () => studyLectures.filter((l) => Boolean(l.pdf_link || l.pdf_link2 || l.type === 'note')),
    [studyLectures]
  );

  const favoriteLectures = useMemo(
    () => studyLectures.filter((l) => favoriteLectureIds.has(String(l.id))),
    [studyLectures, favoriteLectureIds]
  );

  const activeList = useMemo(() => {
    switch (activeTab) {
      case 'study':
        return videoLectures.length > 0 ? videoLectures : studyLectures;
      case 'notes-only':
        return pdfNoteLectures;
      case 'favorites':
        return favoriteLectures;
      case 'live-upcoming':
        return liveUpcomingLectures;
      case 'previous-live':
        return previousLiveLectures;
      default:
        return studyLectures;
    }
  }, [
    activeTab,
    videoLectures,
    studyLectures,
    pdfNoteLectures,
    favoriteLectures,
    liveUpcomingLectures,
    previousLiveLectures,
  ]);

  const filteredLectures = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = activeList.filter((item, idx) => {
      const displayTitle = formatLectureTitle(item.Title, topic.topic_name, idx).toLowerCase();
      return q === '' || displayTitle.includes(q);
    });

    if (sortOrder === 'newest') {
      return [...filtered].sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    }
    if (sortOrder === 'oldest') {
      return [...filtered].sort((a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0));
    }
    return filtered;
  }, [activeList, searchQuery, topic.topic_name, sortOrder]);

  const tabs: Array<{
    id: LectureTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
  }> = batch.isStudyRoom
    ? [
        {
          id: 'study',
          label: 'All Classes',
          icon: Video,
          count: videoLectures.length || studyLectures.length,
        },
        {
          id: 'notes-only',
          label: 'Class PDF Notes',
          icon: FileText,
          count: pdfNoteLectures.length,
        },
        {
          id: 'favorites',
          label: 'Saved Favorites',
          icon: Heart,
          count: favoriteLectures.length,
        },
      ]
    : [
        { id: 'study', label: 'Study Lectures', icon: Video, count: studyLectures.length },
        {
          id: 'notes-only',
          label: 'Class PDFs',
          icon: FileText,
          count: pdfNoteLectures.length,
        },
        {
          id: 'live-upcoming',
          label: 'Live & Upcoming',
          icon: Radio,
          count: liveUpcomingLectures.length,
        },
        {
          id: 'previous-live',
          label: 'Previous Live',
          icon: History,
          count: previousLiveLectures.length,
        },
        {
          id: 'favorites',
          label: 'Favorites',
          icon: Heart,
          count: favoriteLectures.length,
        },
      ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6 sm:px-6 lg:px-8">
      {/* Large Mobile-Friendly Back Button */}
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 min-h-[44px] text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-slate-600" />
          <span>
            {subject.directLectures
              ? `Back to Subjects (${batch.course_name})`
              : `Back to Chapters (${subject.subject_name})`}
          </span>
        </button>
      </div>

      {/* Chapter Header Card */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-blue-600">{batch.course_name}</span>
          <span aria-hidden="true">·</span>
          <span>{subject.subject_name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {videoLectures.length} Video Lectures · {pdfNoteLectures.length} PDF Notes
          </span>
        </div>
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
          {topic.topic_name}
        </h1>
      </div>

      {/* Segmented Tab Controls, Sort Order & Lecture Search */}
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-200/70 p-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[42px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-white text-blue-600'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isSelected ? 'text-blue-600' : 'text-slate-500'
                  }`}
                />
                <span>{tab.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-slate-500">
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) =>
                prev === 'default' ? 'newest' : prev === 'newest' ? 'oldest' : 'default'
              )
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 min-h-[44px] text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowUpDown className="h-3.5 w-3.5 text-blue-600" />
            <span>
              {sortOrder === 'newest'
                ? 'Newest First'
                : sortOrder === 'oldest'
                ? 'Oldest First'
                : 'Class Order'}
            </span>
          </button>

          <div className="relative flex-1 lg:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              aria-label="Search lectures"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search lectures..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 min-h-[44px] text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse"
            >
              <div className="aspect-video w-full rounded-xl bg-slate-100 mb-3" />
              <div className="h-5 w-3/4 rounded bg-slate-200 mb-2" />
              <div className="h-4 w-1/2 rounded bg-slate-100 mb-4" />
              <div className="flex gap-2">
                <div className="h-11 flex-1 rounded-xl bg-slate-100" />
                <div className="h-11 w-24 rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center max-w-lg mx-auto my-12">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 mb-3" />
          <h2 className="text-base font-semibold text-red-900">Unable to Load Lectures</h2>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredLectures.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center max-w-md mx-auto my-12">
          <Video className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <h2 className="text-base font-semibold text-slate-800">
            {activeTab === 'favorites'
              ? 'No Favorite Lectures Saved Yet'
              : activeTab === 'notes-only'
              ? 'No PDF Notes Found in this Folder'
              : 'No Lectures Found'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery
              ? `No lecture matched "${searchQuery}".`
              : activeTab === 'favorites'
              ? 'Click the heart icon on any lecture card to bookmark it for quick revision.'
              : 'No items available in this tab.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              Clear search query
            </button>
          )}
        </div>
      )}

      {/* Lectures Grid */}
      {!loading && !error && filteredLectures.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLectures.map((lecture, idx) => {
            const hasPdf = Boolean(lecture.pdf_link || lecture.pdf_link2);
            const isNoteOnly = lecture.type === 'note' && !lecture.videoLink && !lecture.videoLink2 && !lecture.file_link;
            const durationStr = formatDurationHuman(lecture.duration);
            const displayChapter = lecture.topic_name || topic.topic_name;
            const title = formatLectureTitle(lecture.Title, displayChapter, idx);
            const thumbKey = String(lecture.id || idx);
            const isBlockedThumb =
              Boolean(lecture.thumbnail) &&
              (lecture.thumbnail!.includes('classx.co.in') ||
                lecture.thumbnail!.includes('appxcontent.in'));
            const showThumb =
              Boolean(lecture.thumbnail) && !isBlockedThumb && !failedThumbs[thumbKey];
            const isFavorite = favoriteLectureIds.has(String(lecture.id));

            const videoDownloadId = `video_${lecture.id}`;
            const dlItem = downloadedItems.find((d) => d.id === videoDownloadId);
            const isDownloading = dlItem?.status === 'downloading';
            const isDownloaded = dlItem?.status === 'completed';

            const handlePrimaryOpen = () => {
              if (isNoteOnly && hasPdf) {
                onOpenPdf({ ...lecture, Title: title });
              } else {
                onSelectLecture({ ...lecture, Title: title });
              }
            };

            return (
              <article
                key={thumbKey}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-blue-400"
              >
                <div>
                  {/* Lecture Thumbnail with Branded Fallback */}
                  <div
                    onClick={handlePrimaryOpen}
                    className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 mb-3.5 cursor-pointer"
                  >
                    {showThumb ? (
                      <img
                        src={lecture.thumbnail}
                        alt={title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        onError={() =>
                          setFailedThumbs((prev) => ({ ...prev, [thumbKey]: true }))
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4 text-white">
                        <div className="flex items-center justify-between text-[11px] text-blue-200 font-medium">
                          <span className="truncate max-w-[70%]">
                            {lecture.topic_name
                              ? `${subject.subject_name} · ${lecture.topic_name}`
                              : subject.subject_name}
                          </span>
                          <span className="font-mono tabular-nums">Class #{idx + 1}</span>
                        </div>
                        <div className="pr-10">
                          <p className="text-xs font-semibold text-slate-200 line-clamp-2">
                            {title}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Play / Read Overlay Scrim */}
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/65 via-black/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg">
                        {isNoteOnly ? (
                          <FileText className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5 fill-current ml-0.5" />
                        )}
                      </div>
                    </div>

                    {/* Duration Readout */}
                    {durationStr && durationStr !== '00:00' && (
                      <div className="absolute bottom-2.5 right-2.5 rounded bg-black/80 px-2 py-0.5 text-[11px] font-mono tabular-nums text-white">
                        {durationStr}
                      </div>
                    )}
                  </div>

                  {/* Unboxed Metadata Line + Favorite Button */}
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono tabular-nums text-blue-600 font-semibold">
                        #{idx + 1}
                      </span>
                      {lecture.topic_name && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate font-semibold text-slate-700">
                            {lecture.topic_name}
                          </span>
                        </>
                      )}
                      {lecture.date_and_time && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{lecture.date_and_time}</span>
                        </>
                      )}
                      {hasPdf && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-700 font-medium">PDF Attached</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteLecture(String(lecture.id));
                      }}
                      aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
                      className={`p-1 rounded-lg transition-colors shrink-0 ${
                        isFavorite
                          ? 'text-red-600 bg-red-50'
                          : 'text-slate-400 hover:text-red-600 hover:bg-slate-100'
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {/* Lecture Title */}
                  <h2
                    onClick={handlePrimaryOpen}
                    className="line-clamp-2 text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors cursor-pointer"
                    title={title}
                  >
                    {title}
                  </h2>
                </div>

                {/* Large Phone-Friendly Action Buttons (100% In-App Playback — Zero External YouTube Links!) */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {!isNoteOnly && (
                    <button
                      type="button"
                      onClick={() => onSelectLecture({ ...lecture, Title: title })}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 min-h-[46px] text-xs font-bold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      <span>Watch Lecture</span>
                    </button>
                  )}

                  {!isNoteOnly && (
                    <button
                      type="button"
                      onClick={() => onDownloadVideo({ ...lecture, Title: title })}
                      aria-label={`Download Video for ${title}`}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 min-h-[46px] text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                        isDownloaded
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : isDownloading
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                      }`}
                    >
                      {isDownloading ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="font-mono tabular-nums">{dlItem.progressPercent}%</span>
                        </>
                      ) : isDownloaded ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 text-blue-600" />
                          <span>Download</span>
                        </>
                      )}
                    </button>
                  )}

                  {hasPdf && (
                    <button
                      type="button"
                      onClick={() => onOpenPdf({ ...lecture, Title: title })}
                      aria-label={`Read PDF Notes for ${title}`}
                      className={`${
                        isNoteOnly ? 'flex-1 bg-blue-600 text-white hover:bg-blue-700' : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                      } inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 min-h-[46px] text-xs font-bold transition-colors whitespace-nowrap shrink-0`}
                    >
                      <FileText className={`h-4 w-4 ${isNoteOnly ? 'text-white' : 'text-blue-600'}`} />
                      <span>{isNoteOnly ? 'Open PDF Handout' : 'PDF'}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
