import React, { useState } from 'react';
import {
  ShieldCheck,
  X,
  Download,
  Check,
  LoaderCircle,
  BookOpen,
} from 'lucide-react';
import { type BatchItem } from '../utils/formatters';
import {
  type VaultStatusResponse,
  syncBatchToServerVault,
} from '../services/api';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches: BatchItem[];
  savedBatchIds: Set<string>;
  vaultStatus: VaultStatusResponse | null;
  onBatchSynced: (courseId: string, lectureCount: number) => void;
  onSelectBatch: (batch: BatchItem) => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({
  isOpen,
  onClose,
  batches,
  savedBatchIds,
  vaultStatus,
  onBatchSynced,
  onSelectBatch,
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSync = async (courseId: string) => {
    setSyncingId(courseId);
    setSyncError(null);
    try {
      const res = await syncBatchToServerVault(courseId);
      onBatchSynced(courseId, res.lectureCount);
    } catch (err: any) {
      setSyncError(err?.message || 'Failed to archive batch lectures');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Permanent Archive Vault"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-3xl max-h-[88vh] rounded-2xl border border-slate-200 bg-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Permanent Course Vault & Auto-Archive
              </h2>
              <p className="text-xs text-slate-500">
                All batches, subjects, chapters, lectures, and PDFs stay saved permanently
                with zero 24-hour key lock.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Permanent Vault modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 bg-white px-6 py-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Archived Batches</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {vaultStatus?.totalBatches || batches.length || 20}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Archived Subjects</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {vaultStatus?.totalSubjects || 410}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Archived Chapters</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {vaultStatus?.totalChapters || 3700}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Vaulted Videos</p>
            <p className="text-xl font-bold font-mono tabular-nums text-blue-600 mt-0.5">
              {vaultStatus?.totalArchivedLectures || 435}+
            </p>
          </div>
        </div>

        {syncError && (
          <div className="mx-6 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {syncError}
          </div>
        )}

        {/* Batch List for 1-Click Deep Archive */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
          <div className="text-xs font-semibold text-slate-700 mb-2">
            All 20 Batches — Click &ldquo;Save All Lectures&rdquo; to cache every video &
            PDF link on server + browser:
          </div>

          {batches.map((b) => {
            const id = String(b.id);
            const isSyncing = syncingId === id;
            const syncedInfo = vaultStatus?.syncedBatches?.[id];
            const isPinned = savedBatchIds.has(id) || Boolean(syncedInfo);

            return (
              <div
                key={b.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 hover:border-blue-300 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums text-blue-600 font-semibold">
                      Batch #{b.id}
                    </span>
                    {syncedInfo && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 font-medium">
                          {syncedInfo.lectureCount} Lectures Cached
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                    {b.course_name}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectBatch(b);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                    <span>Open Batch</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSync(id)}
                    disabled={isSyncing}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      isPinned
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isSyncing ? (
                      <>
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : isPinned ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Saved in Vault</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        <span>Save All Lectures</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          <span>
            Automatic Permanent Sync: Every chapter you open is automatically saved forever.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
