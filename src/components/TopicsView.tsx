import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  BookOpen,
  ChevronRight,
  AlertCircle,
  FolderGit2,
} from 'lucide-react';
import {
  type BatchItem,
  type SubjectItem,
  type TopicItem,
} from '../utils/formatters';

interface TopicsViewProps {
  batch: BatchItem;
  subject: SubjectItem;
  topics: TopicItem[];
  loading: boolean;
  error: string | null;
  onSelectTopic: (topic: TopicItem) => void;
  onBack: () => void;
  onRetry: () => void;
}

export const TopicsView: React.FC<TopicsViewProps> = ({
  batch,
  subject,
  topics,
  loading,
  error,
  onSelectTopic,
  onBack,
  onRetry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTopics = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return topics.filter(
      (t) => q === '' || (t.topic_name || '').toLowerCase().includes(q)
    );
  }, [topics, searchQuery]);

  const totalSubjectLectures = useMemo(() => {
    const sumFromTopics = topics.reduce(
      (sum, t) => sum + (Number(t.lectureCount) || 0),
      0
    );
    return sumFromTopics || subject.lectureCount || 0;
  }, [topics, subject.lectureCount]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Back Button */}
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 min-h-[44px] text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Subjects</span>
        </button>
      </div>

      {/* Subject Banner */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-blue-600">{batch.course_name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {topics.length} Chapters
            </span>
            {totalSubjectLectures > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  {totalSubjectLectures} Total Lectures & PDFs
                </span>
              </>
            )}
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
            {subject.subject_name} — Chapters & All Lectures
          </h1>
        </div>

        {topics.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onSelectTopic({
                topicid: 'all',
                topic_name: `${subject.subject_name} (All ${topics.length} Chapters)`,
                lectureCount: totalSubjectLectures,
              })
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-blue-700 transition-colors shrink-0 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
            <span>
              Open All {totalSubjectLectures || ''} Lectures (All Chapters Combined)
            </span>
          </button>
        )}
      </div>

      {/* Search Chapters */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            aria-label="Search chapters"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chapters..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
          />
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100" />
                <div className="h-5 w-56 rounded bg-slate-200" />
              </div>
              <div className="h-7 w-20 rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center max-w-lg mx-auto my-12">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 mb-3" />
          <h2 className="text-base font-semibold text-red-900">Unable to Load Chapters</h2>
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

      {/* Empty State */}
      {!loading && !error && filteredTopics.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center max-w-md mx-auto my-12">
          <FolderGit2 className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <h2 className="text-base font-semibold text-slate-800">No Chapters Found</h2>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery
              ? `No chapter matches "${searchQuery}".`
              : 'No chapters available under this subject.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              Clear search filter
            </button>
          )}
        </div>
      )}

      {/* Chapters Grid */}
      {!loading && !error && filteredTopics.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredTopics.map((topic, index) => (
            <button
              key={topic.topicid}
              type="button"
              onClick={() => onSelectTopic(topic)}
              className="group flex items-center justify-between text-left rounded-xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-blue-400 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0 pr-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 font-mono text-xs font-semibold tabular-nums shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0">
                  <h2
                    className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate"
                    title={topic.topic_name}
                  >
                    {topic.topic_name}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {topic.lectureCount !== undefined
                    ? `${topic.lectureCount} Lectures`
                    : 'Lectures'}
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
