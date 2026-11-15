import React from 'react';
import { BookOpen, PlayCircle, Download, ShieldCheck } from 'lucide-react';
import { type NavStage } from './Header';

interface MobileBottomNavProps {
  currentStage: NavStage;
  hasSelectedBatch: boolean;
  downloadsCount: number;
  activeDownloadsCount: number;
  onNavigateTab: (tab: 'batches' | 'study' | 'downloads' | 'admin') => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentStage,
  hasSelectedBatch,
  downloadsCount,
  activeDownloadsCount,
  onNavigateTab,
}) => {
  const isBatches = currentStage === 'batches';
  const isStudy =
    currentStage === 'subjects' ||
    currentStage === 'topics' ||
    currentStage === 'lectures' ||
    currentStage === 'player';
  const isDownloads = currentStage === 'downloads';

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200"
    >
      <div className="grid grid-cols-4 items-center h-[60px] px-1.5">
        <button
          type="button"
          onClick={() => onNavigateTab('batches')}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors ${
            isBatches ? 'text-blue-600 font-bold bg-blue-50/70' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-5 w-5" />
          <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
            All Batches
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab(hasSelectedBatch ? 'study' : 'batches')}
          className={`flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors ${
            isStudy ? 'text-blue-600 font-bold bg-blue-50/70' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PlayCircle className="h-5 w-5" />
          <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
            My Study
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('downloads')}
          className={`relative flex flex-col items-center justify-center min-h-[48px] rounded-xl transition-colors ${
            isDownloads ? 'text-blue-600 font-bold bg-blue-50/70' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Download className="h-5 w-5" />
          <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
            Downloads
            {downloadsCount > 0 ? ` (${downloadsCount})` : ''}
          </span>
          {activeDownloadsCount > 0 && (
            <span className="absolute top-1 right-3 font-mono text-[10px] font-bold text-blue-600">
              ↓{activeDownloadsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('admin')}
          className="flex flex-col items-center justify-center min-h-[48px] rounded-xl text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ShieldCheck className="h-5 w-5" />
          <span className="text-[11px] tracking-tight mt-0.5 whitespace-nowrap">
            Admin Panel
          </span>
        </button>
      </div>
    </nav>
  );
};
