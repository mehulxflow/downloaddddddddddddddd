import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Layers,
  ChevronRight,
  AlertCircle,
  Download,
  Check,
  LoaderCircle,
  Compass,
} from 'lucide-react';
import { type BatchItem, type SubjectItem } from '../utils/formatters';

interface SubjectsViewProps {
  batch: BatchItem;
  subjects: SubjectItem[];
  loading: boolean;
  error: string | null;
  isBatchSaved: boolean;
  isSyncingVault: boolean;
  syncedLectureCount: number | null;
  onSyncBatchVault: () => void;
  onSelectSubject: (subject: SubjectItem) => void;
  onBack: () => void;
  onRetry: () => void;
}

export const SubjectsView: React.FC<SubjectsViewProps> = ({
  batch,
  subjects,
  loading,
  error,
  isBatchSaved,
  isSyncingVault,
  syncedLectureCount,
  onSyncBatchVault,
  onSelectSubject,
  onBack,
  onRetry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSubjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return subjects.filter(
      (s) => q === '' || (s.subject_name || '').toLowerCase().includes(q)
    );
  }, [subjects, searchQuery]);

  const totalBatchLectures = useMemo(() => {
    const sumFromSubjects = subjects.reduce(
      (sum, s) => sum + (Number(s.lectureCount) || 0),
      0
    );
    return sumFromSubjects || batch.lectureCount || 0;
  }, [subjects, batch.lectureCount]);

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
          <span>Back to All Batches</span>
        </button>
      </div>

      {/* Batch Banner */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-blue-600">
              {batch.provider === 'kgs'
                ? 'KGS Course Subjects'
                : batch.provider === 'pwthor'
                ? 'PWThor Course Subjects'
                : 'Sachin Academy Subjects'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {subjects.length} Total Subjects
            </span>
            {totalBatchLectures > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  {totalBatchLectures} Total Lectures & PDFs
                </span>
              </>
            )}
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
            {batch.course_name}
          </h1>
        </div>
      </div>

      {/* Subject Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            aria-label="Search subjects"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subjects / teachers (e.g. Polity, History, Maths, Khan Sir)..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
          />
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse"
            >
              <div className="h-12 w-12 rounded-xl bg-slate-100 mb-3" />
              <div className="h-5 w-2/3 rounded bg-slate-200 mb-4" />
              <div className="h-4 w-1/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center max-w-lg mx-auto my-12">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 mb-3" />
          <h2 className="text-base font-semibold text-red-900">Unable to Load Subjects</h2>
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
      {!loading && !error && filteredSubjects.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center max-w-md mx-auto my-12">
          <Layers className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <h2 className="text-base font-semibold text-slate-800">No Subjects Found</h2>
          <p className="mt-1 text-sm text-slate-500">
            {searchQuery
              ? `No subject matches "${searchQuery}".`
              : 'No subjects available in this batch.'}
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

      {/* Subjects Grid */}
      {!loading && !error && filteredSubjects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredSubjects.map((subject) => {
            const isOrientation = (subject.subject_name || '')
              .toLowerCase()
              .includes('orientation');

            return (
              <button
                key={subject.subjectid}
                type="button"
                onClick={() => onSelectSubject(subject)}
                className={`group flex flex-col justify-between text-left rounded-2xl border p-4 transition-all duration-150 cursor-pointer ${
                  isOrientation
                    ? 'border-blue-300 bg-blue-50/30 hover:border-blue-500'
                    : 'border-slate-200 bg-white hover:border-blue-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    {subject.subject_logo &&
                    !subject.subject_logo.includes('classx.co.in') &&
                    !subject.subject_logo.includes('appxcontent.in') ? (
                      <div className="relative h-12 w-12 overflow-hidden rounded-xl bg-slate-50 border border-slate-100 p-1">
                        <img
                          src={subject.subject_logo}
                          alt={subject.subject_name}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          isOrientation
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {isOrientation ? (
                          <Compass className="h-6 w-6" />
                        ) : (
                          <Layers className="h-6 w-6" />
                        )}
                      </div>
                    )}

                    {subject.lectureCount !== undefined && (
                      <span className="text-xs font-mono font-semibold tabular-nums text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                        {subject.topicCount && !subject.directLectures
                          ? `${subject.topicCount} Ch · `
                          : ''}
                        {subject.lectureCount} Lectures
                      </span>
                    )}
                  </div>
                  <h2
                    className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2"
                    title={subject.subject_name}
                  >
                    {subject.subject_name}
                  </h2>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between w-full">
                  <span className="text-xs font-medium text-slate-500 group-hover:text-blue-600 transition-colors">
                    {subject.directLectures
                      ? 'Open Lectures & PDFs'
                      : `View All ${subject.lectureCount || ''} Lectures`}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
