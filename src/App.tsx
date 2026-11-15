/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, ShieldCheck, KeyRound } from 'lucide-react';
import { Header, type NavStage } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { BatchesView } from './components/BatchesView';
import { SubjectsView } from './components/SubjectsView';
import { TopicsView } from './components/TopicsView';
import { LecturesView, type LectureTab } from './components/LecturesView';
import { VideoPlayerView } from './components/VideoPlayerView';
import { DownloadsView } from './components/DownloadsView';
import { PdfModal } from './components/PdfModal';
import { AdminModal } from './components/AdminModal';
import {
  type BatchItem,
  type SubjectItem,
  type TopicItem,
  type LectureItem,
} from './utils/formatters';
import {
  fetchBatchesWithMeta,
  fetchSubjects,
  fetchTopics,
  fetchStudyLectures,
  fetchLiveUpcomingLectures,
  fetchPreviousLiveLectures,
  getSavedBatchIds,
  toggleSavedBatchId,
  getPinnedBatchIds,
  togglePinnedBatchId,
  getFavoriteLectureIds,
  toggleFavoriteLectureId,
  verifySiteLockCode,
  pingVisitorActivity,
  type SiteLockPublicStatus,
} from './services/api';
import {
  subscribeDownloads,
  startLectureVideoDownload,
  type DownloadedItemRecord,
} from './services/downloadManager';

const UNLOCKED_VERSION_KEY = 'mehulxstudy_unlocked_version_v1';

export default function App() {
  const [stage, setStage] = useState<NavStage>('batches');
  const [appName, setAppName] = useState<string>('mehulxstudy');
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<TopicItem | null>(null);
  const [selectedLecture, setSelectedLecture] = useState<LectureItem | null>(null);

  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [studyLectures, setStudyLectures] = useState<LectureItem[]>([]);
  const [liveUpcomingLectures, setLiveUpcomingLectures] = useState<LectureItem[]>([]);
  const [previousLiveLectures, setPreviousLiveLectures] = useState<LectureItem[]>([]);
  const [activeLectureTab, setActiveLectureTab] = useState<LectureTab>('study');

  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  const [lecturesLoading, setLecturesLoading] = useState(false);
  const [lecturesError, setLecturesError] = useState<string | null>(null);

  const [pdfModalLecture, setPdfModalLecture] = useState<LectureItem | null>(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(
    () => typeof window !== 'undefined' && window.location.pathname === '/admin'
  );
  const [savedBatchIds, setSavedBatchIds] = useState<Set<string>>(() => getSavedBatchIds());
  const [pinnedBatchIds, setPinnedBatchIds] = useState<Set<string>>(() => getPinnedBatchIds());
  const [favoriteLectureIds, setFavoriteLectureIds] = useState<Set<string>>(() =>
    getFavoriteLectureIds()
  );
  const [downloadedItems, setDownloadedItems] = useState<DownloadedItemRecord[]>([]);

  // Website Lock State
  const [siteLock, setSiteLock] = useState<SiteLockPublicStatus>({
    lockEnabled: false,
    hasLockCode: false,
    lockVersion: 'v1',
  });
  const [unlockedVersion, setUnlockedVersion] = useState<string>(() => {
    try {
      return localStorage.getItem(UNLOCKED_VERSION_KEY) || '';
    } catch {
      return '';
    }
  });
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    document.title = `${appName} - Online Learning Portal`;
  }, [appName]);

  useEffect(() => {
    const unsub = subscribeDownloads((items) => {
      setDownloadedItems(items);
    });
    return unsub;
  }, []);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const {
        batches: list,
        pinnedCourses,
        appSettings,
        siteLock: lockMeta,
      } = await fetchBatchesWithMeta();
      setBatches(list);
      if (appSettings?.appName) {
        setAppName(appSettings.appName);
      }
      if (lockMeta) {
        setSiteLock(lockMeta);
      }
      if (Array.isArray(pinnedCourses) && pinnedCourses.length > 0) {
        setPinnedBatchIds((prev) => {
          const next = new Set(prev);
          for (const cName of pinnedCourses) {
            next.add(cName);
            const matched = list.find((b) => b.course_name === cName);
            if (matched) next.add(String(matched.id));
          }
          return next;
        });
      }
      setBatchesLoading(false);
    } catch (err: any) {
      setBatchesError(err?.message || 'Failed to load enrolled batches.');
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
    pingVisitorActivity('Opened mehulxstudy Home Page');
    if (window.location.search.includes('verify_key')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [loadBatches]);

  const loadSubjects = useCallback(async (courseId: string) => {
    setSubjectsLoading(true);
    setSubjectsError(null);
    try {
      const list = await fetchSubjects(courseId);
      setSubjects(list);
      setSubjectsLoading(false);
    } catch (err: any) {
      setSubjectsError(err?.message || 'Failed to load batch subjects.');
      setSubjectsLoading(false);
    }
  }, []);

  const loadTopics = useCallback(async (courseId: string, subjectId: string) => {
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      const list = await fetchTopics(courseId, subjectId);
      setTopics(list);
      setTopicsLoading(false);
    } catch (err: any) {
      setTopicsError(err?.message || 'Failed to load subject chapters.');
      setTopicsLoading(false);
    }
  }, []);

  const loadLectures = useCallback(
    async (courseId: string, subjectId: string, topicId: string) => {
      setLecturesLoading(true);
      setLecturesError(null);
      try {
        const studyList = await fetchStudyLectures(courseId, subjectId, topicId);
        setStudyLectures(studyList);
        setLecturesLoading(false);

        // Fetch Live & Previous Live in background without blocking main study lectures
        Promise.allSettled([
          fetchLiveUpcomingLectures(courseId),
          fetchPreviousLiveLectures(courseId),
        ]).then(([liveRes, prevRes]) => {
          setLiveUpcomingLectures(liveRes.status === 'fulfilled' ? liveRes.value : []);
          setPreviousLiveLectures(prevRes.status === 'fulfilled' ? prevRes.value : []);
        });
      } catch (err: any) {
        setLecturesError(err?.message || 'Failed to load chapter lectures.');
        setLecturesLoading(false);
      }
    },
    []
  );

  const handleSelectBatch = (batch: BatchItem) => {
    setSelectedBatch(batch);
    setSelectedSubject(null);
    setSelectedTopic(null);
    setSelectedLecture(null);
    setActiveLectureTab('study');
    setStage('subjects');
    loadSubjects(batch.id);
    pingVisitorActivity(`Viewing Batch: ${batch.course_name}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectSubject = (subject: SubjectItem) => {
    if (!selectedBatch) return;
    setSelectedSubject(subject);
    setSelectedLecture(null);
    setActiveLectureTab('study');

    if (subject.directLectures || selectedBatch.isStudyRoom) {
      const syntheticTopic: TopicItem = {
        topicid: subject.subjectid,
        topic_name: subject.subject_name,
        sortingparam: 1,
        lectureCount: subject.lectureCount,
      };
      setSelectedTopic(syntheticTopic);
      setTopics([syntheticTopic]);
      setStage('lectures');
      loadLectures(selectedBatch.id, subject.subjectid, subject.subjectid);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSelectedTopic(null);
    setStage('topics');
    loadTopics(selectedBatch.id, subject.subjectid);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTopic = (topic: TopicItem) => {
    if (!selectedBatch || !selectedSubject) return;
    setSelectedTopic(topic);
    setSelectedLecture(null);
    setActiveLectureTab('study');
    setStage('lectures');
    loadLectures(selectedBatch.id, selectedSubject.subjectid, topic.topicid);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectLecture = (lecture: LectureItem) => {
    setSelectedLecture(lecture);
    setStage('player');
    pingVisitorActivity(`Watching Lecture: ${lecture.Title}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectGlobalLecture = (lecture: LectureItem) => {
    const matchedBatch =
      batches.find(
        (b) =>
          String(b.id) === String(lecture.course_id) ||
          b.course_name === lecture.courseName
      ) ||
      ({
        id: lecture.course_id || 'sr_global',
        course_name: lecture.courseName || 'mehulxstudy Course',
        isStudyRoom: true,
      } as BatchItem);

    const folderSubject: SubjectItem = {
      subjectid: lecture.id.split('_item_')[0] || 'folder',
      subject_name: lecture.folderName || lecture.subject || 'Subject Classes',
      directLectures: true,
    };

    const folderTopic: TopicItem = {
      topicid: folderSubject.subjectid,
      topic_name: folderSubject.subject_name,
    };

    setSelectedBatch(matchedBatch);
    setSelectedSubject(folderSubject);
    setSelectedTopic(folderTopic);
    setSelectedLecture(lecture);
    loadLectures(matchedBatch.id, folderSubject.subjectid, folderTopic.topicid);
    setStage('player');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (targetStage: NavStage) => {
    if (targetStage === 'batches') {
      setStage('batches');
      setSelectedLecture(null);
    } else if (targetStage === 'downloads') {
      setStage('downloads');
    } else if (targetStage === 'subjects' && selectedBatch) {
      setStage('subjects');
      setSelectedLecture(null);
    } else if (targetStage === 'topics' && selectedBatch && selectedSubject) {
      if (selectedSubject.directLectures || selectedBatch.isStudyRoom) {
        setStage('lectures');
      } else {
        setStage('topics');
      }
      setSelectedLecture(null);
    } else if (
      targetStage === 'lectures' &&
      selectedBatch &&
      selectedSubject &&
      selectedTopic
    ) {
      setStage('lectures');
      setSelectedLecture(null);
    }
  };

  const handleMobileBottomTab = (tab: 'batches' | 'study' | 'downloads' | 'admin') => {
    if (tab === 'batches') {
      setStage('batches');
      setSelectedLecture(null);
    } else if (tab === 'downloads') {
      setStage('downloads');
    } else if (tab === 'admin') {
      setIsAdminModalOpen(true);
    } else if (tab === 'study') {
      if (selectedLecture && selectedBatch) {
        setStage('player');
      } else if (selectedTopic && selectedSubject && selectedBatch) {
        setStage('lectures');
      } else if (selectedSubject && selectedBatch) {
        setStage('topics');
      } else if (selectedBatch) {
        setStage('subjects');
      } else {
        setStage('batches');
      }
    }
  };

  const handleToggleSaveBatch = (courseId: string) => {
    const updated = toggleSavedBatchId(courseId);
    setSavedBatchIds(updated);
  };

  const handleTogglePinBatch = (courseId: string) => {
    const updated = togglePinnedBatchId(courseId);
    setPinnedBatchIds(updated);
  };

  const handleToggleFavoriteLecture = (lectureId: string) => {
    const updated = toggleFavoriteLectureId(lectureId);
    setFavoriteLectureIds(updated);
  };

  const handleDownloadVideoFromList = (lecture: LectureItem) => {
    if (!selectedBatch) return;
    startLectureVideoDownload({
      courseId: selectedBatch.id,
      batchName: selectedBatch.course_name,
      subjectName: selectedSubject?.subject_name,
      topicName: selectedTopic?.topic_name,
      lecture,
    });
  };

  const handlePlayDownloadedLecture = (record: DownloadedItemRecord) => {
    const matchedBatch =
      batches.find((b) => String(b.id) === String(record.courseId)) ||
      selectedBatch || {
        id: record.courseId,
        course_name: record.batchName || 'Downloaded Course',
      };
    setSelectedBatch(matchedBatch);
    setSelectedLecture(record.lecture);
    setStage('player');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUnlockWebsiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    if (!unlockInput.trim()) return;
    setUnlocking(true);
    const res = await verifySiteLockCode(unlockInput.trim());
    setUnlocking(false);

    if (res.valid) {
      setUnlockedVersion(res.lockVersion || siteLock.lockVersion);
      setUnlockInput('');
      try {
        localStorage.setItem(
          UNLOCKED_VERSION_KEY,
          res.lockVersion || siteLock.lockVersion
        );
      } catch {
        // ignore
      }
    } else {
      setUnlockError('Invalid Access Code! Please enter the correct website lock code.');
    }
  };

  const activePlaylist =
    activeLectureTab === 'study' ||
    activeLectureTab === 'notes-only' ||
    activeLectureTab === 'favorites'
      ? studyLectures
      : activeLectureTab === 'live-upcoming'
      ? liveUpcomingLectures
      : previousLiveLectures;

  const activeDownloadsCount = downloadedItems.filter(
    (d) => d.status === 'downloading'
  ).length;

  const isWebsiteCurrentlyLocked =
    siteLock.lockEnabled && unlockedVersion !== siteLock.lockVersion;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        currentStage={stage}
        appName={appName}
        isSiteLockActive={siteLock.lockEnabled}
        selectedBatchName={selectedBatch?.course_name}
        selectedSubjectName={selectedSubject?.subject_name}
        selectedTopicName={selectedTopic?.topic_name}
        selectedLectureTitle={selectedLecture?.Title}
        downloadsCount={downloadedItems.length}
        activeDownloadsCount={activeDownloadsCount}
        onNavigate={handleNavigate}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
      />

      {isWebsiteCurrentlyLocked ? (
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {appName} is Locked
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
              This website is protected by an access code. Enter the unlock code below to access batches and video lectures.
            </p>

            <form onSubmit={handleUnlockWebsiteSubmit} className="mt-6 space-y-4 text-left">
              <div>
                <label
                  htmlFor="website-unlock-code-input"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Website Access Code
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="website-unlock-code-input"
                    type="password"
                    autoFocus
                    required
                    value={unlockInput}
                    onChange={(e) => setUnlockInput(e.target.value)}
                    placeholder="Enter website unlock code..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              {unlockError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                  {unlockError}
                </div>
              )}

              <button
                type="submit"
                disabled={unlocking || !unlockInput.trim()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Unlock className="h-4 w-4" />
                <span>{unlocking ? 'Verifying Code...' : `Unlock ${appName}`}</span>
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsAdminModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Open Admin Panel</span>
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 pb-24 md:pb-16">
          {stage === 'batches' && (
            <BatchesView
              batches={batches}
              loading={batchesLoading}
              error={batchesError}
              savedBatchIds={savedBatchIds}
              pinnedBatchIds={pinnedBatchIds}
              onToggleSaveBatch={handleToggleSaveBatch}
              onTogglePinBatch={handleTogglePinBatch}
              onSelectBatch={handleSelectBatch}
              onSelectGlobalLecture={handleSelectGlobalLecture}
              onOpenGlobalPdf={(lec) => setPdfModalLecture(lec)}
              onRetry={loadBatches}
            />
          )}

          {stage === 'subjects' && selectedBatch && (
            <SubjectsView
              batch={selectedBatch}
              subjects={subjects}
              loading={subjectsLoading}
              error={subjectsError}
              isBatchSaved={savedBatchIds.has(String(selectedBatch.id))}
              isSyncingVault={false}
              syncedLectureCount={null}
              onSyncBatchVault={() => {}}
              onSelectSubject={handleSelectSubject}
              onBack={() => handleNavigate('batches')}
              onRetry={() => loadSubjects(selectedBatch.id)}
            />
          )}

          {stage === 'topics' && selectedBatch && selectedSubject && (
            <TopicsView
              batch={selectedBatch}
              subject={selectedSubject}
              topics={topics}
              loading={topicsLoading}
              error={topicsError}
              onSelectTopic={handleSelectTopic}
              onBack={() => handleNavigate('subjects')}
              onRetry={() => loadTopics(selectedBatch.id, selectedSubject.subjectid)}
            />
          )}

          {stage === 'lectures' && selectedBatch && selectedSubject && selectedTopic && (
            <LecturesView
              batch={selectedBatch}
              subject={selectedSubject}
              topic={selectedTopic}
              activeTab={activeLectureTab}
              onTabChange={setActiveLectureTab}
              studyLectures={studyLectures}
              liveUpcomingLectures={liveUpcomingLectures}
              previousLiveLectures={previousLiveLectures}
              favoriteLectureIds={favoriteLectureIds}
              onToggleFavoriteLecture={handleToggleFavoriteLecture}
              downloadedItems={downloadedItems}
              loading={lecturesLoading}
              error={lecturesError}
              onSelectLecture={handleSelectLecture}
              onDownloadVideo={handleDownloadVideoFromList}
              onOpenPdf={(lec) => setPdfModalLecture(lec)}
              onBack={() =>
                selectedSubject.directLectures || selectedBatch.isStudyRoom
                  ? handleNavigate('subjects')
                  : handleNavigate('topics')
              }
              onRetry={() =>
                loadLectures(
                  selectedBatch.id,
                  selectedSubject.subjectid,
                  selectedTopic.topicid
                )
              }
            />
          )}

          {stage === 'player' && selectedBatch && selectedLecture && (
            <VideoPlayerView
              courseId={selectedBatch.id}
              batchName={selectedBatch.course_name}
              subjectName={selectedSubject?.subject_name}
              topicName={selectedTopic?.topic_name}
              lecture={selectedLecture}
              playlist={activePlaylist.length > 0 ? activePlaylist : [selectedLecture]}
              downloadedItems={downloadedItems}
              onSelectLecture={(lec) => setSelectedLecture(lec)}
              onOpenPdfModal={(lec) => setPdfModalLecture(lec)}
              onOpenDownloadsTab={() => setStage('downloads')}
              onBack={() => {
                if (selectedTopic && selectedSubject) {
                  handleNavigate('lectures');
                } else if (selectedSubject) {
                  handleNavigate('subjects');
                } else {
                  handleNavigate('batches');
                }
              }}
            />
          )}

          {stage === 'downloads' && (
            <DownloadsView
              items={downloadedItems}
              onPlayDownloadedLecture={handlePlayDownloadedLecture}
              onOpenPdfModal={(lec) => setPdfModalLecture(lec)}
              onBackToBatches={() => handleNavigate('batches')}
            />
          )}
        </main>
      )}

      <footer className="hidden md:block border-t border-slate-200 bg-white py-5 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {appName} — Online Learning Portal (In-App Video Player, KGS, PWThor & Sachin Academy Batches, Offline Downloads & PDF Handouts)
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsAdminModalOpen(true)}
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Admin Panel
            </button>
          </div>
        </div>
      </footer>

      <MobileBottomNav
        currentStage={stage}
        hasSelectedBatch={Boolean(selectedBatch)}
        downloadsCount={downloadedItems.length}
        activeDownloadsCount={activeDownloadsCount}
        onNavigateTab={handleMobileBottomTab}
      />

      {pdfModalLecture && (
        <PdfModal
          lecture={pdfModalLecture}
          onClose={() => setPdfModalLecture(null)}
        />
      )}

      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onDataUpdated={() => {
          loadBatches();
          if (selectedBatch) {
            loadSubjects(selectedBatch.id);
          }
          if (selectedBatch && selectedSubject && selectedTopic) {
            loadLectures(
              selectedBatch.id,
              selectedSubject.subjectid,
              selectedTopic.topicid
            );
          }
        }}
      />
    </div>
  );
}
