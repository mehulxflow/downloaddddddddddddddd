import React from 'react';
import { ChevronRight, Home, Download, ShieldCheck, Lock } from 'lucide-react';

export type NavStage =
  | 'batches'
  | 'subjects'
  | 'topics'
  | 'lectures'
  | 'player'
  | 'downloads';

interface HeaderProps {
  currentStage: NavStage;
  appName?: string;
  isSiteLockActive?: boolean;
  selectedBatchName?: string;
  selectedSubjectName?: string;
  selectedTopicName?: string;
  selectedLectureTitle?: string;
  downloadsCount?: number;
  activeDownloadsCount?: number;
  onNavigate: (stage: NavStage) => void;
  onOpenAdminModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentStage,
  appName = 'mehulxstudy',
  isSiteLockActive = false,
  selectedBatchName,
  selectedSubjectName,
  selectedTopicName,
  selectedLectureTitle,
  downloadsCount = 0,
  activeDownloadsCount = 0,
  onNavigate,
  onOpenAdminModal,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 md:h-16 max-w-7xl items-center justify-between gap-4 md:gap-8 px-3 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Title */}
        <button
          type="button"
          onClick={() => onNavigate('batches')}
          className="flex items-center gap-2.5 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg py-1 min-h-[44px] whitespace-nowrap shrink-0"
        >
          <img
            src="/assets/logo.jpg"
            alt={`${appName} Logo`}
            referrerPolicy="no-referrer"
            className="h-8 w-8 md:h-9 md:w-9 rounded-full object-cover border border-slate-200 bg-blue-600"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (!img.src.includes('iili.io')) {
                img.src = 'https://iili.io/n0BGt6l.jpg';
              } else {
                img.style.display = 'none';
              }
            }}
          />
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors whitespace-nowrap shrink-0">
            {appName}
          </span>
        </button>

        {/* Zone 2: Breadcrumb / Stage Navigation Links */}
        <nav
          aria-label="Breadcrumb"
          className="hidden md:flex items-center gap-3 overflow-hidden text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => onNavigate('batches')}
            className={`inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              currentStage === 'batches' ? 'text-blue-600 font-semibold' : ''
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span>All Batches</span>
          </button>

          {selectedBatchName && currentStage !== 'downloads' && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigate('subjects')}
                className={`truncate max-w-[160px] hover:text-slate-900 transition-colors whitespace-nowrap ${
                  currentStage === 'subjects' ? 'text-blue-600 font-semibold' : ''
                }`}
                title={selectedBatchName}
              >
                {selectedBatchName}
              </button>
            </>
          )}

          {selectedSubjectName && currentStage !== 'downloads' && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigate('topics')}
                className={`truncate max-w-[140px] hover:text-slate-900 transition-colors whitespace-nowrap ${
                  currentStage === 'topics' ? 'text-blue-600 font-semibold' : ''
                }`}
                title={selectedSubjectName}
              >
                {selectedSubjectName}
              </button>
            </>
          )}

          {selectedTopicName &&
            selectedTopicName !== selectedSubjectName &&
            currentStage !== 'downloads' && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => onNavigate('lectures')}
                  className={`truncate max-w-[140px] hover:text-slate-900 transition-colors whitespace-nowrap ${
                    currentStage === 'lectures' ? 'text-blue-600 font-semibold' : ''
                  }`}
                  title={selectedTopicName}
                >
                  {selectedTopicName}
                </button>
              </>
            )}

          {currentStage === 'player' && selectedLectureTitle && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span
                className="truncate max-w-[150px] text-blue-600 font-semibold whitespace-nowrap"
                title={selectedLectureTitle}
              >
                {selectedLectureTitle}
              </span>
            </>
          )}

          <span className="text-slate-300 select-none" aria-hidden="true">
            |
          </span>

          <button
            type="button"
            onClick={() => onNavigate('downloads')}
            className={`inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              currentStage === 'downloads' ? 'text-blue-600 font-semibold' : ''
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>
              Downloads
              {downloadsCount > 0 ? ` (${downloadsCount})` : ''}
              {activeDownloadsCount > 0 ? ` · ↓${activeDownloadsCount}` : ''}
            </span>
          </button>
        </nav>

        {/* Zone 3: Admin Panel Action (Replaced Permanent Vault) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenAdminModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isSiteLockActive ? (
              <Lock className="h-4 w-4 shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0" />
            )}
            <span>Admin Panel</span>
          </button>
        </div>
      </div>
    </header>
  );
};
