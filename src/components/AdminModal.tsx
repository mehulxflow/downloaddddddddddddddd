import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  PlusCircle,
  RefreshCw,
  Pin,
  Check,
  LoaderCircle,
  Layers,
  Settings,
  Search,
  Trash2,
  Globe,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ShieldCheck,
  Video,
  FileText,
  KeyRound,
  LogOut,
  Users,
  Copy,
  Smartphone,
  Monitor,
  Clock,
  MapPin,
  UploadCloud,
  Link2,
  Send,
  Play,
  Square,
  AlertCircle,
} from 'lucide-react';
import {
  fetchAdminOverview,
  adminAddLectureOrNote,
  adminPerformBatchAction,
  adminSyncKgsBatch,
  adminUntrackKgsBatch,
  fetchKgsCatalog,
  adminSaveBranding,
  verifyAdminLogin,
  adminSaveSiteLock,
  adminUpdateVisibility,
  fetchSubjects,
  fetchTopics,
  fetchStudyLectures,
  fetchAdminVisitorLogs,
  adminClearVisitorLogs,
  adminSaveLectureBackup,
  adminAutoUploadToYouTube,
  fetchAllBatchLecturesForTelegram,
  fetchBatchLecturesAndSubjectsForTelegram,
  startTelegramUploadJob,
  fetchTelegramUploadStatus,
  startServerBulkTelegramUpload,
  fetchServerBulkTelegramStatus,
  stopServerBulkTelegramUpload,
  syncTelegramForumTopics,
  type AdminOverviewResponse,
  type KgsCatalogBatchItem,
  type VisitorLogEntry,
  type TelegramQueueLectureItem,
  type TelegramScannedSubjectItem,
  type TelegramForumInfo,
} from '../services/api';
import {
  ADMIN_PANEL_PASSWORD,
  verifyAdminPassword,
  type SubjectItem,
  type TopicItem,
  type LectureItem,
} from '../utils/formatters';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataUpdated: () => void;
}

const ADMIN_SESSION_KEY = 'mehulxstudy_admin_auth_v1';
const TG_BACKEND_URL_KEY = 'mehulxstudy_tg_backend_url_v1';

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  onDataUpdated,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [verifyingLogin, setVerifyingLogin] = useState(false);

  const [activeTab, setActiveTab] = useState<
    | 'lectures'
    | 'batches'
    | 'telegram'
    | 'sitelock'
    | 'visitors'
    | 'sync'
    | 'add'
    | 'branding'
  >('lectures');
  const [syncSubTab, setSyncSubTab] = useState<'tracked' | 'browse'>('tracked');
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Visitor & IP Logs State
  const [visitorLogs, setVisitorLogs] = useState<VisitorLogEntry[]>([]);
  const [visitorSearch, setVisitorSearch] = useState('');
  const [refreshingVisitors, setRefreshingVisitors] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Website Lock State
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockCode, setLockCode] = useState('');
  const [savingLock, setSavingLock] = useState(false);

  // Batch Visibility Filter State
  const [batchProviderFilter, setBatchProviderFilter] = useState<
    'all' | 'kgs' | 'pwthor' | 'sachin'
  >('all');
  const [batchSearch, setBatchSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Lecture Visibility Manager State
  const [lecProviderFilter, setLecProviderFilter] = useState<
    'all' | 'kgs' | 'pwthor' | 'sachin'
  >('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [courseSubjects, setCourseSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [subjectTopics, setSubjectTopics] = useState<TopicItem[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [managedLectures, setManagedLectures] = useState<LectureItem[]>([]);
  const [loadingLectures, setLoadingLectures] = useState(false);
  const [lectureSearch, setLectureSearch] = useState('');

  // Bulk Telegram Auto-Uploader State
  const [tgBackendUrl, setTgBackendUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TG_BACKEND_URL_KEY) || '';
      return saved.includes('your-telegram-uploader.onrender.com') ? '' : saved;
    } catch {
      return '';
    }
  });
  const [tgProviderFilter, setTgProviderFilter] = useState<
    'sachin' | 'all' | 'kgs' | 'pwthor'
  >('sachin');
  const [tgSelectedBatchId, setTgSelectedBatchId] = useState<string>('');
  const [tgSubjectFilter, setTgSubjectFilter] = useState<string>('all');
  const [tgQueue, setTgQueue] = useState<TelegramQueueLectureItem[]>([]);
  const [tgScannedSubjects, setTgScannedSubjects] = useState<
    TelegramScannedSubjectItem[]
  >([]);
  const [tgLoadingQueue, setTgLoadingQueue] = useState<boolean>(false);
  const [tgIsRunning, setTgIsRunning] = useState<boolean>(false);
  const [tgCurrentIndex, setTgCurrentIndex] = useState<number>(0);
  const [tgCurrentJobId, setTgCurrentJobId] = useState<string | null>(null);
  const [tgCurrentStatus, setTgCurrentStatus] = useState<string>('Idle');
  const [tgCurrentProgress, setTgCurrentProgress] = useState<number>(0);
  const [tgErrorMsg, setTgErrorMsg] = useState<string | null>(null);
  const [tgCompletedIds, setTgCompletedIds] = useState<Set<string>>(new Set());
  const [tgFailedIds, setTgFailedIds] = useState<Record<string, string>>({});
  const [tgTopicCache, setTgTopicCache] = useState<Record<string, number>>({ CDP: 3 });
  const [tgForumInfo, setTgForumInfo] = useState<TelegramForumInfo | null>(null);
  const [tgSyncingTopics, setTgSyncingTopics] = useState<boolean>(false);
  const [tgCurrentThreadId, setTgCurrentThreadId] = useState<number | null>(null);
  const tgAbortRef = useRef<boolean>(false);
  const tgSingleUploadRef = useRef<boolean>(false);

  // YouTube Auto-Upload & Backup Link State
  const [showYtSetup, setShowYtSetup] = useState(false);
  const [youtubeToken, setYoutubeToken] = useState<string>(() => {
    try {
      return localStorage.getItem('mehulxstudy_yt_token_v1') || '';
    } catch {
      return '';
    }
  });
  const [uploadingLecId, setUploadingLecId] = useState<string | null>(null);
  const [editingBackupLecId, setEditingBackupLecId] = useState<string | null>(null);
  const [backupYtInput, setBackupYtInput] = useState('');
  const [backupMp4Input, setBackupMp4Input] = useState('');
  const [savingBackup, setSavingBackup] = useState(false);

  // KGS Catalog (sahukgs.com/batches)
  const [kgsCatalog, setKgsCatalog] = useState<KgsCatalogBatchItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string>('');

  // Add Lecture / Note Form
  const [courseName, setCourseName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<'video' | 'note'>('video');
  const [videoLink, setVideoLink] = useState('');
  const [videoLink2, setVideoLink2] = useState('');
  const [pdfLink, setPdfLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync KGS Batch Form
  const [syncBatchId, setSyncBatchId] = useState('');
  const [syncCustomName, setSyncCustomName] = useState('');
  const [syncingKgs, setSyncingKgs] = useState(false);
  const [syncingBatchId, setSyncingBatchId] = useState<string | null>(null);

  // Branding Form
  const [appName, setAppName] = useState('mehulxstudy');
  const [tagline, setTagline] = useState('Knowledge & Success');
  const [logoUrl, setLogoUrl] = useState('');

  const flashStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const loadOverview = async () => {
    setLoading(true);
    const data = await fetchAdminOverview();
    if (data) {
      setOverview(data);
      setAppName(data.appSettings.appName || 'mehulxstudy');
      setTagline(data.appSettings.tagline || 'Knowledge & Success');
      setLogoUrl(data.appSettings.logoUrl || '');
      setLockEnabled(Boolean(data.siteLock?.lockEnabled));
      setLockCode(data.siteLock?.lockCode || '');
      if (Array.isArray(data.visitorLogs)) {
        setVisitorLogs(data.visitorLogs);
      }

      if (!courseName && data.courses.length > 0) {
        setCourseName(data.courses[0].courseName);
        if (data.courses[0].folders.length > 0) {
          setFolderName(data.courses[0].folders[0].folderName);
        }
      }
      if (!selectedCourseId && data.courses.length > 0) {
        setSelectedCourseId(data.courses[0].id);
      }
      if (!tgSelectedBatchId && data.courses.length > 0) {
        const firstSachin = data.courses.find((c) => c.provider === 'sachin');
        setTgSelectedBatchId((firstSachin || data.courses[0]).id);
      }
    }
    setLoading(false);
  };

  const handleSaveTgBackendUrl = (url: string) => {
    setTgBackendUrl(url);
    try {
      localStorage.setItem(TG_BACKEND_URL_KEY, url.trim());
    } catch {
      // ignore
    }
  };

  const tgFilteredBatches = useMemo(() => {
    const list = overview?.courses || [];
    if (tgProviderFilter === 'all') return list;
    return list.filter((c) => c.provider === tgProviderFilter);
  }, [overview, tgProviderFilter]);

  useEffect(() => {
    if (
      tgFilteredBatches.length > 0 &&
      !tgFilteredBatches.some((c) => c.id === tgSelectedBatchId)
    ) {
      setTgSelectedBatchId(tgFilteredBatches[0].id);
    }
  }, [tgFilteredBatches, tgSelectedBatchId]);

  const tgSubjectsList = useMemo(() => {
    const map = new Map<string, number>();
    const selectedCourse = overview?.courses.find((c) => c.id === tgSelectedBatchId);
    if (selectedCourse && Array.isArray(selectedCourse.folders)) {
      for (const f of selectedCourse.folders) {
        if (f.folderName) {
          map.set(f.folderName, 0);
        }
      }
    }
    for (const s of tgScannedSubjects) {
      if (s.name) {
        map.set(s.name, s.count || 0);
      }
    }
    if (tgQueue.length > 0) {
      const queueMap = new Map<string, number>();
      for (const item of tgQueue) {
        const sName = item.subjectName || 'Subject';
        queueMap.set(sName, (queueMap.get(sName) || 0) + 1);
      }
      for (const [sName, cnt] of queueMap.entries()) {
        map.set(sName, cnt);
      }
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [overview, tgSelectedBatchId, tgScannedSubjects, tgQueue]);

  const tgActiveQueue = useMemo(() => {
    if (tgSubjectFilter === 'all') return tgQueue;
    return tgQueue.filter((item) => item.subjectName === tgSubjectFilter);
  }, [tgQueue, tgSubjectFilter]);

  const scanSelectedBatchLectures = async (batchId: string, forceRefresh = false) => {
    if (!batchId) return;
    setTgLoadingQueue(true);
    setTgErrorMsg(null);
    try {
      const [scanResult, serverBulk] = await Promise.all([
        fetchBatchLecturesAndSubjectsForTelegram(batchId, forceRefresh),
        fetchServerBulkTelegramStatus(batchId, tgBackendUrl),
      ]);
      setTgQueue(scanResult.items);
      setTgScannedSubjects(scanResult.subjects);
      if (serverBulk?.topicCache) {
        setTgTopicCache(serverBulk.topicCache);
      }
      if (serverBulk?.forumInfo) {
        setTgForumInfo(serverBulk.forumInfo);
      }

      if (serverBulk && serverBulk.courseId === batchId && serverBulk.isRunning) {
        setTgIsRunning(true);
        setTgSubjectFilter(serverBulk.subjectFilter || 'all');
        setTgCurrentIndex(serverBulk.currentIndex || 0);
        setTgCurrentJobId(serverBulk.currentJobId || null);
        setTgCurrentThreadId(serverBulk.currentThreadId ?? null);
        setTgCurrentStatus(serverBulk.currentStatus || 'Downloading');
        setTgCurrentProgress(Number(serverBulk.currentProgress) || 0);
        setTgCompletedIds(new Set(serverBulk.completedIds || []));
        setTgFailedIds(serverBulk.failedIds || {});
      } else {
        setTgSubjectFilter('all');
        setTgCurrentIndex(0);
        setTgCurrentProgress(0);
        setTgCurrentStatus('Idle');
        setTgCompletedIds(
          new Set(serverBulk?.courseCompletedIds || serverBulk?.completedIds || [])
        );
        setTgFailedIds(
          serverBulk?.courseId === batchId ? serverBulk.failedIds || {} : {}
        );
      }
    } catch (err: any) {
      setTgQueue([]);
      setTgScannedSubjects([]);
      setTgErrorMsg(err?.message || 'Failed to scan batch lectures.');
    } finally {
      setTgLoadingQueue(false);
    }
  };

  // Load all lectures for the selected batch when tgSelectedBatchId changes on the Telegram tab
  useEffect(() => {
    if (!isOpen || !isAuthenticated || activeTab !== 'telegram' || !tgSelectedBatchId) {
      return;
    }
    scanSelectedBatchLectures(tgSelectedBatchId);
  }, [isOpen, isAuthenticated, activeTab, tgSelectedBatchId]);

  // Live Server Background Queue Sync (polls GET /batch-status every 1500ms)
  useEffect(() => {
    if (!isOpen || !isAuthenticated || activeTab !== 'telegram') return;
    let cancelled = false;

    const syncServerBulkState = async () => {
      if (tgSingleUploadRef.current) return;
      const serverBulk = await fetchServerBulkTelegramStatus(tgSelectedBatchId, tgBackendUrl);
      if (cancelled || !serverBulk || tgSingleUploadRef.current) return;

      if (serverBulk.topicCache) {
        setTgTopicCache(serverBulk.topicCache);
      }
      if (serverBulk.forumInfo) {
        setTgForumInfo(serverBulk.forumInfo);
      }

      if (serverBulk.isRunning) {
        if (serverBulk.courseId && serverBulk.courseId !== tgSelectedBatchId) {
          setTgSelectedBatchId(serverBulk.courseId);
        }
        if (serverBulk.subjectFilter && serverBulk.subjectFilter !== tgSubjectFilter) {
          setTgSubjectFilter(serverBulk.subjectFilter);
        }
        setTgIsRunning(true);
        setTgCurrentIndex(serverBulk.currentIndex || 0);
        setTgCurrentJobId(serverBulk.currentJobId || null);
        setTgCurrentThreadId(serverBulk.currentThreadId ?? null);
        setTgCurrentStatus(serverBulk.currentStatus || 'Downloading');
        setTgCurrentProgress(Number(serverBulk.currentProgress) || 0);
        setTgCompletedIds(new Set(serverBulk.completedIds || []));
        setTgFailedIds(serverBulk.failedIds || {});
      } else if (tgIsRunning && !tgSingleUploadRef.current && serverBulk.courseId === tgSelectedBatchId) {
        setTgIsRunning(false);
        setTgCurrentStatus(serverBulk.currentStatus || 'Completed');
        setTgCurrentProgress(Number(serverBulk.currentProgress) || 100);
        setTgCompletedIds(new Set(serverBulk.completedIds || []));
        setTgFailedIds(serverBulk.failedIds || {});
        if (serverBulk.currentStatus === 'Completed') {
          flashStatus(`✅ Finished Bulk Telegram Upload for "${serverBulk.batchName}"!`);
        }
      }
    };

    syncServerBulkState();
    const timer = setInterval(syncServerBulkState, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, isAuthenticated, activeTab, tgSelectedBatchId, tgSubjectFilter, tgIsRunning, tgBackendUrl]);

  const pollJobUntilFinished = async (
    baseUrl: string,
    jobId: string
  ): Promise<{ finalStatus: 'Completed' | 'Failed'; error?: string }> => {
    while (!tgAbortRef.current) {
      await new Promise((r) => setTimeout(r, 1500));
      if (tgAbortRef.current) {
        return { finalStatus: 'Failed', error: 'Stopped by Admin' };
      }
      try {
        const statusData = await fetchTelegramUploadStatus(baseUrl, jobId);
        setTgCurrentStatus(statusData.status);
        setTgCurrentProgress(Number(statusData.progress) || 0);
        if (statusData.thread_id) {
          setTgCurrentThreadId(statusData.thread_id);
          if (statusData.subject_name) {
            setTgTopicCache((prev) => ({
              ...prev,
              [statusData.subject_name!]: statusData.thread_id!,
            }));
          }
        }

        if (statusData.status === 'Completed') {
          setTgCurrentProgress(100);
          return { finalStatus: 'Completed' };
        }
        if (statusData.status === 'Failed') {
          return {
            finalStatus: 'Failed',
            error: statusData.error || 'Backend reported Failed status',
          };
        }
      } catch (pollErr: any) {
        // Keep polling on transient network hiccups unless aborted
        console.warn('Polling error:', pollErr);
      }
    }
    return { finalStatus: 'Failed', error: 'Stopped by Admin' };
  };

  const handleUploadSingleTelegramLecture = async (
    item: TelegramQueueLectureItem,
    indexInQueue: number
  ) => {
    if (tgIsRunning) return;
    const batchObj = overview?.courses.find((c) => c.id === tgSelectedBatchId);
    const batchName = batchObj?.courseName || tgSelectedBatchId;
    const subjectName = item.subjectName || 'General';

    setTgErrorMsg(null);
    tgAbortRef.current = false;
    tgSingleUploadRef.current = true;
    setTgIsRunning(true);
    setTgCurrentIndex(indexInQueue);
    setTgCurrentStatus('Downloading');
    setTgCurrentProgress(1);
    setTgCurrentJobId(null);
    setTgCurrentThreadId(tgTopicCache[subjectName] ?? null);
    setTgFailedIds((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    try {
      const startRes = await startTelegramUploadJob(tgBackendUrl, {
        url: item.streamUrl,
        batch_name: batchName,
        subject_name: subjectName,
        lecture_name: item.lectureName,
      });
      const jobId = startRes.job_id;
      setTgCurrentJobId(jobId);
      if (startRes.thread_id) {
        setTgCurrentThreadId(startRes.thread_id);
      }

      const result = await pollJobUntilFinished(tgBackendUrl, jobId);
      if (!tgAbortRef.current) {
        if (result.finalStatus === 'Completed') {
          setTgCompletedIds((prev) => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
          });
          setTgCurrentStatus('Completed');
          setTgCurrentProgress(100);
          flashStatus(`✅ Uploaded "${item.lectureName}" to Topic "${subjectName}"!`);
        } else {
          setTgCurrentStatus('Failed');
          setTgFailedIds((prev) => ({
            ...prev,
            [item.id]: result.error || 'Upload failed',
          }));
          setTgErrorMsg(`Upload failed: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (err: any) {
      setTgCurrentStatus('Failed');
      setTgFailedIds((prev) => ({
        ...prev,
        [item.id]: err?.message || 'Upload request failed',
      }));
      setTgErrorMsg(err?.message || 'Upload request failed');
    } finally {
      tgSingleUploadRef.current = false;
      setTgIsRunning(false);
    }
  };

  const handleToggleBulkTelegramUpload = async () => {
    if (tgIsRunning) {
      tgAbortRef.current = true;
      tgSingleUploadRef.current = false;
      await stopServerBulkTelegramUpload();
      setTgIsRunning(false);
      setTgCurrentStatus('Stopped');
      flashStatus('Stopped Server Bulk Telegram Auto-Uploader.');
      return;
    }

    if (!tgSelectedBatchId) {
      setTgErrorMsg('Please select a Batch first.');
      return;
    }

    const batchObj = overview?.courses.find((c) => c.id === tgSelectedBatchId);
    const batchName = batchObj?.courseName || tgSelectedBatchId;

    setTgErrorMsg(null);
    setTgFailedIds({});
    tgAbortRef.current = false;

    let queueToProcess = tgActiveQueue;
    if (queueToProcess.length === 0) {
      setTgLoadingQueue(true);
      try {
        const fetched = await fetchAllBatchLecturesForTelegram(tgSelectedBatchId);
        setTgQueue(fetched);
        queueToProcess =
          tgSubjectFilter === 'all'
            ? fetched
            : fetched.filter((item) => item.subjectName === tgSubjectFilter);
      } catch (err: any) {
        setTgLoadingQueue(false);
        setTgErrorMsg(err?.message || 'Failed to fetch batch lectures.');
        return;
      }
      setTgLoadingQueue(false);
    }

    if (queueToProcess.length === 0) {
      setTgErrorMsg('No playable video lectures found in this batch.');
      return;
    }

    try {
      setTgIsRunning(true);
      setTgCurrentIndex(0);
      setTgCurrentStatus('Downloading');
      setTgCurrentProgress(1);

      // Hand off the entire batch array in one POST /upload-batch request!
      // It will automatically create Forum Topics per subject_name and upload one-by-one!
      const res = await startServerBulkTelegramUpload({
        courseId: tgSelectedBatchId,
        batchName,
        subjectFilter: tgSubjectFilter,
        items: queueToProcess,
        renderBaseUrl: tgBackendUrl,
      });

      if (res.topic_cache) {
        setTgTopicCache(res.topic_cache);
      }
      if (res.bulkState) {
        setTgCurrentIndex(res.bulkState.currentIndex || 0);
        setTgCurrentJobId(res.bulkState.currentJobId || null);
        setTgCurrentThreadId(res.bulkState.currentThreadId ?? null);
        setTgCurrentStatus(res.bulkState.currentStatus || 'Downloading');
        setTgCurrentProgress(Number(res.bulkState.currentProgress) || 1);
      }
      flashStatus(
        `🚀 Sent ${queueToProcess.length} lectures to POST /upload-batch for "${batchName}"! Auto-Topic Creation Active.`
      );
    } catch (err: any) {
      setTgIsRunning(false);
      setTgErrorMsg(err?.message || 'Failed to start server bulk upload.');
    }
  };

  const handleSyncForumTopics = async () => {
    setTgSyncingTopics(true);
    setTgErrorMsg(null);
    try {
      const subjectNamesToCreate =
        tgSubjectFilter !== 'all'
          ? [tgSubjectFilter]
          : tgSubjectsList.map((s) => s.name).filter(Boolean);
      const res = await syncTelegramForumTopics(subjectNamesToCreate);
      if (res?.topic_cache) {
        setTgTopicCache(res.topic_cache);
      }
      if (res?.forum_info) {
        setTgForumInfo(res.forum_info);
      }
      if (res?.forum_info && !res.forum_info.canManageTopics) {
        setTgErrorMsg(
          `⚠️ Telegram ने Topic बनाने से रोका (${res.forum_info.lastTopicError || 'not enough rights to create a topic'}): कृपया Telegram ऐप में "${res.forum_info.chatTitle}" ग्रुप खोलें ➔ Edit ➔ Administrators ➔ @${res.forum_info.botUsername} पर क्लिक करें ➔ "Manage Topics" को ON करके Save करें!`
        );
      } else {
        flashStatus(
          `✅ Auto-Created & Synced Forum Topics in "${res?.forum_info?.chatTitle || 'sachin 1'}" (-1004425704095)!`
        );
      }
    } finally {
      setTgSyncingTopics(false);
    }
  };

  const handleRefreshVisitors = async () => {
    setRefreshingVisitors(true);
    const logs = await fetchAdminVisitorLogs();
    setVisitorLogs(logs);
    setRefreshingVisitors(false);
  };

  const handleClearVisitors = async () => {
    setRefreshingVisitors(true);
    const ok = await adminClearVisitorLogs(ADMIN_PANEL_PASSWORD);
    setRefreshingVisitors(false);
    if (ok) {
      setVisitorLogs([]);
      flashStatus('Cleared all visitor IP logs.');
    }
  };

  const handleCopyIp = (ip: string) => {
    try {
      navigator.clipboard.writeText(ip);
      setCopiedIp(ip);
      setTimeout(() => setCopiedIp(null), 2000);
    } catch {
      // ignore
    }
  };

  const loadKgsCatalogData = async (force = false) => {
    setCatalogLoading(true);
    const res = await fetchKgsCatalog(force);
    if (res.catalog.length > 0) {
      setKgsCatalog(res.catalog);
    }
    if (res.lastSahukgsSyncAt) {
      setLastSyncAt(res.lastSahukgsSyncAt);
    }
    setCatalogLoading(false);
  };

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadOverview();
      loadKgsCatalogData(false);
    }
  }, [isOpen, isAuthenticated]);

  // Load subjects when selectedCourseId changes
  useEffect(() => {
    if (!isOpen || !isAuthenticated || !selectedCourseId) return;
    let cancelled = false;
    setLoadingLectures(true);
    fetchSubjects(selectedCourseId, true)
      .then((subs) => {
        if (cancelled) return;
        setCourseSubjects(subs);
        if (subs.length > 0) {
          setSelectedSubjectId(String(subs[0].subjectid));
        } else {
          setSelectedSubjectId('');
          setSubjectTopics([]);
          setSelectedTopicId('');
          setManagedLectures([]);
          setLoadingLectures(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCourseSubjects([]);
          setSelectedSubjectId('');
          setManagedLectures([]);
          setLoadingLectures(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, selectedCourseId]);

  // Load topics or direct lectures when selectedSubjectId changes
  useEffect(() => {
    if (!isOpen || !isAuthenticated || !selectedCourseId || !selectedSubjectId) return;
    let cancelled = false;
    const isStudyRoomCourse = selectedCourseId.startsWith('sr_');

    if (isStudyRoomCourse) {
      setSubjectTopics([]);
      setSelectedTopicId(selectedSubjectId);
      setLoadingLectures(true);
      fetchStudyLectures(selectedCourseId, selectedSubjectId, selectedSubjectId, true)
        .then((lecs) => {
          if (!cancelled) {
            setManagedLectures(lecs);
            setLoadingLectures(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setManagedLectures([]);
            setLoadingLectures(false);
          }
        });
      return;
    }

    setLoadingLectures(true);
    fetchTopics(selectedCourseId, selectedSubjectId, true)
      .then((tops) => {
        if (cancelled) return;
        setSubjectTopics(tops);
        if (tops.length > 0) {
          setSelectedTopicId('all');
        } else {
          setSelectedTopicId('');
          setManagedLectures([]);
          setLoadingLectures(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubjectTopics([]);
          setSelectedTopicId('');
          setManagedLectures([]);
          setLoadingLectures(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, selectedCourseId, selectedSubjectId]);

  // Load Sachin Academy lectures when selectedTopicId changes
  useEffect(() => {
    if (
      !isOpen ||
      !isAuthenticated ||
      !selectedCourseId ||
      selectedCourseId.startsWith('sr_') ||
      !selectedSubjectId ||
      !selectedTopicId
    ) {
      return;
    }
    let cancelled = false;
    setLoadingLectures(true);
    fetchStudyLectures(selectedCourseId, selectedSubjectId, selectedTopicId, true)
      .then((lecs) => {
        if (!cancelled) {
          setManagedLectures(lecs);
          setLoadingLectures(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManagedLectures([]);
          setLoadingLectures(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthenticated, selectedCourseId, selectedSubjectId, selectedTopicId]);

  const coursesForLectureDropdown = useMemo(() => {
    const list = overview?.courses || [];
    if (lecProviderFilter === 'all') return list;
    return list.filter((c) => c.provider === lecProviderFilter);
  }, [overview, lecProviderFilter]);

  useEffect(() => {
    if (
      coursesForLectureDropdown.length > 0 &&
      !coursesForLectureDropdown.some((c) => c.id === selectedCourseId)
    ) {
      setSelectedCourseId(coursesForLectureDropdown[0].id);
    }
  }, [coursesForLectureDropdown, selectedCourseId]);

  const filteredBatchesList = useMemo(() => {
    const list = overview?.courses || [];
    const q = batchSearch.trim().toLowerCase();
    return list.filter((c) => {
      if (batchProviderFilter !== 'all' && c.provider !== batchProviderFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.courseName.toLowerCase().includes(q) || String(c.id).toLowerCase().includes(q)
      );
    });
  }, [overview, batchProviderFilter, batchSearch]);

  const filteredManagedLectures = useMemo(() => {
    const q = lectureSearch.trim().toLowerCase();
    if (!q) return managedLectures;
    return managedLectures.filter((l) =>
      String(l.Title || '')
        .toLowerCase()
        .includes(q)
    );
  }, [managedLectures, lectureSearch]);

  const catalogById = useMemo(() => {
    const map = new Map<string, KgsCatalogBatchItem>();
    for (const item of kgsCatalog) {
      map.set(String(item.id), item);
    }
    return map;
  }, [kgsCatalog]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return kgsCatalog.slice(0, 80);
    return kgsCatalog
      .filter(
        (b) =>
          String(b.title || '')
            .toLowerCase()
            .includes(q) || String(b.id || '').includes(q)
      )
      .slice(0, 80);
  }, [kgsCatalog, catalogSearch]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setVerifyingLogin(true);
    const validLocal = verifyAdminPassword(passwordInput);
    const validServer = await verifyAdminLogin(passwordInput);
    setVerifyingLogin(false);

    if (validLocal || validServer) {
      setIsAuthenticated(true);
      setPasswordInput('');
      try {
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      } catch {
        // ignore
      }
    } else {
      setLoginError('Invalid Admin Password! Please enter the correct password.');
    }
  };

  const handleLogoutAdmin = () => {
    setIsAuthenticated(false);
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // ignore
    }
  };

  const handleSaveSiteLockForm = async (
    e?: React.FormEvent,
    overrideEnabled?: boolean
  ) => {
    if (e) e.preventDefault();
    const targetEnabled =
      overrideEnabled !== undefined ? overrideEnabled : lockEnabled;
    if (targetEnabled && !lockCode.trim()) {
      flashStatus('Please enter a Lock Code before locking the website.');
      return;
    }
    setSavingLock(true);
    const res = await adminSaveSiteLock({
      password: ADMIN_PANEL_PASSWORD,
      lockEnabled: targetEnabled,
      lockCode: lockCode.trim(),
    });
    setSavingLock(false);
    if (res.ok && res.siteLock) {
      setLockEnabled(res.siteLock.lockEnabled);
      setLockCode(res.siteLock.lockCode);
      flashStatus(
        res.siteLock.lockEnabled
          ? `🔒 Website Locked! Visitors must now enter code "${res.siteLock.lockCode}" to open mehulxstudy.`
          : '🔓 Website Lock Disabled! Anyone can open mehulxstudy now.'
      );
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleToggleBatchVisibility = async (course: {
    id: string;
    courseName: string;
    isHidden?: boolean;
  }) => {
    setTogglingId(course.id);
    const nextHidden = !course.isHidden;
    const ok = await adminUpdateVisibility({
      type: 'batch',
      ids: [course.id],
      courseName: course.courseName,
      hidden: nextHidden,
    });
    setTogglingId(null);
    if (ok) {
      flashStatus(
        nextHidden
          ? `Hidden batch "${course.courseName}" from main website.`
          : `Batch "${course.courseName}" is now visible on main website.`
      );
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleBulkBatchVisibility = async (hideAll: boolean) => {
    const ids = filteredBatchesList.map((c) => c.id);
    if (ids.length === 0) return;
    setTogglingId('bulk_batches');
    const ok = await adminUpdateVisibility({
      type: 'batch',
      ids,
      hidden: hideAll,
    });
    setTogglingId(null);
    if (ok) {
      flashStatus(
        hideAll
          ? `Hidden ${ids.length} batches from main website.`
          : `Made ${ids.length} batches visible on main website.`
      );
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleToggleSubjectVisibility = async (subject: SubjectItem) => {
    if (!selectedCourseId) return;
    const nextHidden = !subject.isHidden;
    setTogglingId(`sub_${subject.subjectid}`);
    const ok = await adminUpdateVisibility({
      type: 'subject',
      ids: [String(subject.subjectid)],
      courseId: selectedCourseId,
      hidden: nextHidden,
    });
    setTogglingId(null);
    if (ok) {
      setCourseSubjects((prev) =>
        prev.map((s) =>
          String(s.subjectid) === String(subject.subjectid)
            ? { ...s, isHidden: nextHidden }
            : s
        )
      );
      flashStatus(
        nextHidden
          ? `Subject "${subject.subject_name}" hidden from website.`
          : `Subject "${subject.subject_name}" is now visible on website.`
      );
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleToggleLectureVisibility = async (lecture: LectureItem) => {
    if (!selectedCourseId) return;
    const nextHidden = !lecture.isHidden;
    setTogglingId(`lec_${lecture.id}`);
    const ok = await adminUpdateVisibility({
      type: 'lecture',
      ids: [String(lecture.id)],
      courseId: selectedCourseId,
      hidden: nextHidden,
    });
    setTogglingId(null);
    if (ok) {
      setManagedLectures((prev) =>
        prev.map((l) =>
          String(l.id) === String(lecture.id) ? { ...l, isHidden: nextHidden } : l
        )
      );
      flashStatus(
        nextHidden
          ? `Hidden lecture "${lecture.Title}" from website.`
          : `Lecture "${lecture.Title}" is now visible on website.`
      );
      onDataUpdated();
    }
  };

  const handleBulkLectureVisibility = async (hideAll: boolean) => {
    if (!selectedCourseId || filteredManagedLectures.length === 0) return;
    const ids = filteredManagedLectures.map((l) => String(l.id));
    setTogglingId('bulk_lectures');
    const ok = await adminUpdateVisibility({
      type: 'lecture',
      ids,
      courseId: selectedCourseId,
      hidden: hideAll,
    });
    setTogglingId(null);
    if (ok) {
      const idSet = new Set(ids);
      setManagedLectures((prev) =>
        prev.map((l) => (idSet.has(String(l.id)) ? { ...l, isHidden: hideAll } : l))
      );
      flashStatus(
        hideAll
          ? `Hidden ${ids.length} lectures from main website.`
          : `Enabled ${ids.length} lectures on main website.`
      );
      onDataUpdated();
    }
  };

  const handleSaveYtToken = (val: string) => {
    setYoutubeToken(val);
    try {
      localStorage.setItem('mehulxstudy_yt_token_v1', val.trim());
    } catch {
      // ignore
    }
  };

  const handleAutoUploadLectureToYt = async (lec: LectureItem) => {
    if (!youtubeToken.trim()) {
      setShowYtSetup(true);
      flashStatus(
        'Please paste your YouTube OAuth Access Token in the YouTube Auto-Upload box first!'
      );
      return;
    }
    setUploadingLecId(String(lec.id));
    const res = await adminAutoUploadToYouTube({
      courseId: selectedCourseId,
      lectureId: String(lec.id),
      title: lec.Title || `Lecture ${lec.id}`,
      youtubeAccessToken: youtubeToken.trim(),
      privacyStatus: 'unlisted',
    });
    setUploadingLecId(null);

    if (res.ok && res.youtubeUrl) {
      setManagedLectures((prev) =>
        prev.map((l) =>
          String(l.id) === String(lec.id)
            ? ({
                ...l,
                videoLink: res.youtubeUrl,
                hasBackupOverride: true,
              } as any)
            : l
        )
      );
      flashStatus(
        `✅ Auto-Uploaded to your YouTube (Unlisted) & saved backup link: ${res.youtubeUrl}`
      );
      onDataUpdated();
    } else {
      flashStatus(`❌ YouTube Auto-Upload Error: ${res.error || 'Failed'}`);
    }
  };

  const handleSaveManualBackupLink = async (lecId: string) => {
    setSavingBackup(true);
    const ok = await adminSaveLectureBackup({
      courseId: selectedCourseId,
      lectureId: lecId,
      youtubeUrl: backupYtInput.trim() || undefined,
      mp4Url: backupMp4Input.trim() || undefined,
      clear: !backupYtInput.trim() && !backupMp4Input.trim(),
    });
    setSavingBackup(false);
    if (ok) {
      setManagedLectures((prev) =>
        prev.map((l) =>
          String(l.id) === lecId
            ? ({
                ...l,
                videoLink: backupYtInput.trim() || l.videoLink,
                videoLink2: backupMp4Input.trim() || l.videoLink2,
                hasBackupOverride: Boolean(
                  backupYtInput.trim() || backupMp4Input.trim()
                ),
              } as any)
            : l
        )
      );
      setEditingBackupLecId(null);
      flashStatus('✅ Saved permanent backup link for this lecture!');
      onDataUpdated();
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim() || !folderName.trim() || !itemName.trim()) return;
    setSubmitting(true);
    const ok = await adminAddLectureOrNote({
      courseName: courseName.trim(),
      folderName: folderName.trim(),
      name: itemName.trim(),
      type: itemType,
      videoLink: videoLink.trim(),
      videoLink2: videoLink2.trim(),
      pdfLink: pdfLink.trim(),
    });
    setSubmitting(false);
    if (ok) {
      setItemName('');
      setVideoLink('');
      setVideoLink2('');
      setPdfLink('');
      flashStatus('Lecture / Note added and synced to mehulxstudy!');
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleBatchAction = async (
    action: 'pin' | 'archive' | 'restore' | 'delete',
    targetCourse: string
  ) => {
    const ok = await adminPerformBatchAction({ action, courseName: targetCourse });
    if (ok) {
      flashStatus(`Updated "${targetCourse}" (${action})`);
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleSyncKgs = async (
    e?: React.FormEvent,
    customId?: string,
    customTitle?: string
  ) => {
    if (e) e.preventDefault();
    const targetId = customId !== undefined ? customId : syncBatchId.trim();
    const targetTitle =
      customTitle !== undefined ? customTitle : syncCustomName.trim();

    setSyncingKgs(true);
    if (targetId) setSyncingBatchId(targetId);

    const res = await adminSyncKgsBatch(
      targetId || undefined,
      targetTitle || undefined
    );

    setSyncingKgs(false);
    setSyncingBatchId(null);

    if (res.ok) {
      if (!customId) {
        setSyncBatchId('');
        setSyncCustomName('');
      }
      flashStatus(
        targetId
          ? `✅ Batch #${targetId} added to Auto-Sync & synced from sahukgs.com/batches!`
          : `✅ Live Sync Complete from sahukgs.com/batches (${res.updated || 0} new/updated folders)!`
      );
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleUntrackBatch = async (batchId: string) => {
    const ok = await adminUntrackKgsBatch(batchId);
    if (ok) {
      flashStatus(`Stopped auto-tracking Batch #${batchId}`);
      await loadOverview();
      onDataUpdated();
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await adminSaveBranding({ appName, tagline, logoUrl });
    if (ok) {
      flashStatus('Portal branding updated!');
      await loadOverview();
      onDataUpdated();
    }
  };

  const trackedIds = overview?.trackedBatches || [];
  const currentSelectedSubject = courseSubjects.find(
    (s) => String(s.subjectid) === String(selectedSubjectId)
  );

  // Password Gate Screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="mehulxstudy Admin Panel Login"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  mehulxstudy Admin Panel
                </h2>
                <p className="text-xs text-slate-500">
                  Enter Admin Password to unlock controls
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin Login"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-password-input"
                className="block text-xs font-bold text-slate-700 mb-1.5"
              >
                Admin Password
              </label>
              <div className="relative">
                <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password-input"
                  type="password"
                  autoFocus
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter admin password..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            {loginError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                {loginError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={verifyingLogin || !passwordInput.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Unlock className="h-4 w-4" />
                <span>{verifyingLogin ? 'Unlocking...' : 'Open Admin Panel'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="mehulxstudy Admin Panel"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                mehulxstudy Admin Control Panel
              </h2>
              {lockEnabled && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                  <Lock className="h-3 w-3" />
                  <span>Site Locked</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Control which lectures & batches show on the website (Sachin Academy, PWThor & KGS) + lock website with access code.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogoutAdmin}
              title="Lock Admin Panel"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lock Admin</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin Panel"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-5 py-2.5 overflow-x-auto">
          {[
            { id: 'lectures', label: 'Show / Hide Lectures', icon: Video },
            { id: 'batches', label: 'Show / Hide Batches', icon: Layers },
            { id: 'telegram', label: 'Bulk Telegram Uploader', icon: Send },
            { id: 'sitelock', label: 'Website Lock Code', icon: Lock },
            {
              id: 'visitors',
              label: `Visitors & IPs (${visitorLogs.length})`,
              icon: Users,
            },
            { id: 'sync', label: 'KGS Auto-Sync', icon: RefreshCw },
            { id: 'add', label: 'Add Lecture / PDF', icon: PlusCircle },
            { id: 'branding', label: 'Branding', icon: Settings },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id as any);
                  if (t.id === 'visitors') {
                    handleRefreshVisitors();
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {statusMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && !overview ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-600 gap-2">
              <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
              <span>Loading mehulxstudy Admin Control Panel...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: LECTURE VISIBILITY CONTROL (SACHIN ACADEMY, PWTHOR, KGS) */}
              {activeTab === 'lectures' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                    <h3 className="text-sm font-bold text-slate-900">
                      Lecture Visibility Control (Sachin Academy · PWThor · KGS)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Select any batch and subject below to control which lectures and PDFs are shown or hidden across the entire mehulxstudy website and home page search.
                    </p>

                    {/* Provider Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      {[
                        { id: 'all', label: 'All Providers' },
                        { id: 'kgs', label: 'KGS Batches' },
                        { id: 'pwthor', label: 'PWThor Batches' },
                        { id: 'sachin', label: 'Sachin Academy Batches' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setLecProviderFilter(p.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            lecProviderFilter === p.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Batch, Subject & Topic Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div>
                        <label
                          htmlFor="admin-lecture-batch-select"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          1. Select Batch ({coursesForLectureDropdown.length})
                        </label>
                        <select
                          id="admin-lecture-batch-select"
                          value={selectedCourseId}
                          onChange={(e) => setSelectedCourseId(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                        >
                          {coursesForLectureDropdown.map((c) => (
                            <option key={c.id} value={c.id}>
                              [{c.provider.toUpperCase()}] {c.courseName} ({c.subjectCount}{' '}
                              Subjects · {c.lectureCount} Lectures)
                              {c.isHidden ? ' (Hidden)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="admin-lecture-subject-select"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          2. Select Subject / Folder ({courseSubjects.length})
                        </label>
                        <select
                          id="admin-lecture-subject-select"
                          value={selectedSubjectId}
                          onChange={(e) => setSelectedSubjectId(e.target.value)}
                          disabled={courseSubjects.length === 0}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
                        >
                          {courseSubjects.map((s) => (
                            <option key={s.subjectid} value={String(s.subjectid)}>
                              {s.subject_name} ({s.lectureCount || 0} Lectures)
                              {s.isHidden ? ' (Hidden Folder)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {!selectedCourseId.startsWith('sr_') ? (
                        <div>
                          <label
                            htmlFor="admin-lecture-topic-select"
                            className="block text-[11px] font-bold text-slate-700 mb-1"
                          >
                            3. Select Chapter / Topic ({subjectTopics.length} Chapters)
                          </label>
                          <select
                            id="admin-lecture-topic-select"
                            value={selectedTopicId}
                            onChange={(e) => setSelectedTopicId(e.target.value)}
                            disabled={subjectTopics.length === 0}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50"
                          >
                            <option value="all">
                              All Chapters ({currentSelectedSubject?.lectureCount || managedLectures.length} Total Lectures)
                            </option>
                            {subjectTopics.map((t) => (
                              <option key={t.topicid} value={String(t.topicid)}>
                                {t.topic_name}
                                {(t as any).lectureCount !== undefined
                                  ? ` (${(t as any).lectureCount} Lectures)`
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-end">
                          {currentSelectedSubject && (
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleSubjectVisibility(currentSelectedSubject)
                              }
                              className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition-colors ${
                                currentSelectedSubject.isHidden
                                  ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {currentSelectedSubject.isHidden ? (
                                <>
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Unhide Entire Folder</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3.5 w-3.5" />
                                  <span>Hide Entire Folder</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Search & Bulk Show/Hide Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={lectureSearch}
                        onChange={(e) => setLectureSearch(e.target.value)}
                        placeholder="Search lectures in this folder by title..."
                        className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs sm:text-sm"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowYtSetup((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold border transition-colors ${
                          showYtSetup || youtubeToken.trim()
                            ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>
                          {youtubeToken.trim() ? 'YT Auto-Upload Ready' : 'YT Auto-Upload Setup'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkLectureVisibility(false)}
                        disabled={
                          togglingId === 'bulk_lectures' ||
                          filteredManagedLectures.length === 0
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Show All ({filteredManagedLectures.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkLectureVisibility(true)}
                        disabled={
                          togglingId === 'bulk_lectures' ||
                          filteredManagedLectures.length === 0
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Hide All ({filteredManagedLectures.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* YouTube Auto-Upload Token Setup Panel */}
                  {showYtSetup && (
                    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <UploadCloud className="h-4 w-4 text-red-600" />
                          <span>Direct Server-to-YouTube Auto-Uploader (Unlisted Backup)</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowYtSetup(false)}
                          className="text-xs font-bold text-slate-500 hover:text-slate-800"
                        >
                          Close
                        </button>
                      </div>
                      <p className="text-xs text-slate-600">
                        Paste your Google YouTube Data API v3 Access Token (scope:{' '}
                        <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                          https://www.googleapis.com/auth/youtube.upload
                        </code>{' '}
                        from{' '}
                        <a
                          href="https://developers.google.com/oauthplayground"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline font-semibold"
                        >
                          Google OAuth Playground
                        </a>
                        ). Phir kisi bhi lecture ke samne <b>"Auto-Upload YT"</b> dabayein — server bina aapka internet kharch kiye sidha video aapke YouTube par <b>Unlisted</b> upload karke link save kar dega!
                      </p>
                      <input
                        type="password"
                        value={youtubeToken}
                        onChange={(e) => handleSaveYtToken(e.target.value)}
                        placeholder="Paste Google OAuth Access Token (ya29.a0...) for YouTube Auto-Upload"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-mono text-slate-900"
                      />
                    </div>
                  )}

                  {/* Lectures List */}
                  {loadingLectures ? (
                    <div className="flex items-center justify-center py-12 text-xs text-slate-500 gap-2">
                      <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
                      <span>Loading lectures for visibility control...</span>
                    </div>
                  ) : filteredManagedLectures.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
                      No lectures found in this subject/chapter.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {filteredManagedLectures.map((lec, idx) => {
                        const isHidden = Boolean(lec.isHidden);
                        const hasPdf = Boolean(lec.pdf_link);
                        const hasBackup = Boolean((lec as any).hasBackupOverride);
                        const isUploadingThis = uploadingLecId === String(lec.id);
                        const isEditingBackup = editingBackupLecId === String(lec.id);

                        return (
                          <div
                            key={lec.id}
                            className={`rounded-xl border p-3 transition-colors space-y-2.5 ${
                              isHidden
                                ? 'border-red-200 bg-red-50/40'
                                : 'border-slate-200 bg-white hover:border-blue-300'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                  <span className="font-mono font-bold text-slate-600">
                                    #{idx + 1}
                                  </span>
                                  {(lec as any).topic_name && (
                                    <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                      {(lec as any).topic_name}
                                    </span>
                                  )}
                                  {lec.date_and_time && <span>· {lec.date_and_time}</span>}
                                  {hasPdf && (
                                    <span className="inline-flex items-center gap-0.5 text-blue-600 font-semibold">
                                      <FileText className="h-3 w-3" /> PDF
                                    </span>
                                  )}
                                  {hasBackup && (
                                    <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                                      ✓ Backup Link Active
                                    </span>
                                  )}
                                  <span
                                    className={`font-bold ${
                                      isHidden ? 'text-red-600' : 'text-emerald-700'
                                    }`}
                                  >
                                    · {isHidden ? 'Hidden from Website' : 'Showing on Website'}
                                  </span>
                                </div>
                                <h4
                                  className={`text-xs sm:text-sm font-bold truncate mt-0.5 ${
                                    isHidden
                                      ? 'text-slate-500 line-through'
                                      : 'text-slate-900'
                                  }`}
                                  title={lec.Title}
                                >
                                  {lec.Title}
                                </h4>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleAutoUploadLectureToYt(lec)}
                                  disabled={isUploadingThis}
                                  title="Stream this lecture directly from server to your YouTube channel (Unlisted)"
                                  className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {isUploadingThis ? (
                                    <>
                                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                      <span>Uploading YT...</span>
                                    </>
                                  ) : (
                                    <>
                                      <UploadCloud className="h-3.5 w-3.5" />
                                      <span>Auto-Upload YT</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingBackup) {
                                      setEditingBackupLecId(null);
                                    } else {
                                      setEditingBackupLecId(String(lec.id));
                                      setBackupYtInput(lec.videoLink || '');
                                      setBackupMp4Input(lec.videoLink2 || lec.file_link || '');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                  <span>Backup Link</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleLectureVisibility(lec)}
                                  disabled={togglingId === `lec_${lec.id}`}
                                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition-colors ${
                                    isHidden
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      : 'bg-slate-100 text-slate-800 hover:bg-red-50 hover:text-red-700 border border-slate-200'
                                  }`}
                                >
                                  {isHidden ? (
                                    <>
                                      <Eye className="h-3.5 w-3.5" />
                                      <span>Show</span>
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="h-3.5 w-3.5" />
                                      <span>Hide</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {isEditingBackup && (
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-700 mb-1">
                                      My Backup YouTube URL (Unlisted / Private)
                                    </label>
                                    <input
                                      type="text"
                                      value={backupYtInput}
                                      onChange={(e) => setBackupYtInput(e.target.value)}
                                      placeholder="https://youtu.be/..."
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-700 mb-1">
                                      My Backup Server MP4 URL (Archive.org / R2)
                                    </label>
                                    <input
                                      type="text"
                                      value={backupMp4Input}
                                      onChange={(e) => setBackupMp4Input(e.target.value)}
                                      placeholder="https://archive.org/download/...mp4"
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingBackupLecId(null)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingBackup}
                                    onClick={() => handleSaveManualBackupLink(String(lec.id))}
                                    className="rounded-lg bg-indigo-600 px-3.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    {savingBackup ? 'Saving...' : 'Save Backup Link'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: BATCH VISIBILITY CONTROL (ALL BATCHES SECTION) */}
              {activeTab === 'batches' && overview && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { id: 'all', label: `All (${overview.courses.length})` },
                        {
                          id: 'kgs',
                          label: `KGS (${
                            overview.courses.filter((c) => c.provider === 'kgs').length
                          })`,
                        },
                        {
                          id: 'pwthor',
                          label: `PWThor (${
                            overview.courses.filter((c) => c.provider === 'pwthor').length
                          })`,
                        },
                        {
                          id: 'sachin',
                          label: `Sachin Academy (${
                            overview.courses.filter((c) => c.provider === 'sachin').length
                          })`,
                        },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setBatchProviderFilter(tab.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            batchProviderFilter === tab.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBulkBatchVisibility(false)}
                        disabled={togglingId === 'bulk_batches'}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Show All</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkBatchVisibility(true)}
                        disabled={togglingId === 'bulk_batches'}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Hide All</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                      placeholder="Search any batch across KGS, PWThor, or Sachin Academy..."
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-xs sm:text-sm"
                    />
                  </div>

                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {filteredBatchesList.map((c) => {
                      const isPinned = overview.pinnedCourses.includes(c.courseName);
                      const isHidden = Boolean(c.isHidden);
                      return (
                        <div
                          key={c.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                            isHidden
                              ? 'border-red-200 bg-red-50/40'
                              : 'border-slate-200 bg-slate-50/70'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-bold uppercase text-blue-600">
                                {c.provider}
                              </span>
                              <span>·</span>
                              <span>{c.subjectCount} Subjects</span>
                              {c.lectureCount > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{c.lectureCount} Lectures</span>
                                </>
                              )}
                              <span
                                className={`font-bold ${
                                  isHidden ? 'text-red-600' : 'text-emerald-700'
                                }`}
                              >
                                · {isHidden ? 'Hidden on Website' : 'Visible on Website'}
                              </span>
                            </div>
                            <h3
                              className={`text-sm font-bold mt-0.5 ${
                                isHidden
                                  ? 'text-slate-500 line-through'
                                  : 'text-slate-900'
                              }`}
                            >
                              {c.courseName}
                            </h3>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setLecProviderFilter('all');
                                setSelectedCourseId(c.id);
                                setActiveTab('lectures');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                            >
                              <Video className="h-3.5 w-3.5" />
                              <span>Manage Lectures</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleBatchVisibility(c)}
                              disabled={togglingId === c.id}
                              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                isHidden
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-700'
                              }`}
                            >
                              {isHidden ? (
                                <>
                                  <Eye className="h-3.5 w-3.5" />
                                  <span>Show Batch</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-3.5 w-3.5" />
                                  <span>Hide Batch</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleBatchAction('pin', c.courseName)}
                              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors ${
                                isPinned
                                  ? 'bg-amber-100 border-amber-300 text-amber-900'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <Pin className="h-3.5 w-3.5" />
                              <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB: BULK TELEGRAM AUTO-UPLOADER */}
              {activeTab === 'telegram' && overview && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Send className="h-4 w-4 text-sky-600" />
                          <span>
                            24/7 Bulk Telegram Forum Auto-Uploader (Auto Topic Creation)
                          </span>
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Automatically checks <code>TOPIC_CACHE</code> (pre-populated with{' '}
                          <code>{`{"CDP": 3}`}</code>), creates missing Subject Forum Topics in{' '}
                          <code>-1004425704095</code>, and uploads each lecture in{' '}
                          <strong>Highest Available Quality</strong> one-by-one via{' '}
                          <code>POST /upload-batch</code>.
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Active Forum Topics (TOPIC_CACHE):
                          </span>
                          {Object.entries(tgTopicCache).map(([sub, tid]) => (
                            <span
                              key={sub}
                              className="inline-flex items-center gap-1 rounded-md bg-white border border-sky-200 px-2 py-0.5 text-[10px] font-mono font-bold text-sky-800"
                            >
                              <span>{sub}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-emerald-700">Topic #{tid}</span>
                            </span>
                          ))}
                          {tgForumInfo && !tgForumInfo.canManageTopics && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-bold text-red-900">
                              <span>
                                ⚠️ Telegram में @{tgForumInfo.botUsername} के लिए &quot;Manage Topics&quot; OFF है — इसे ग्रुप Admin Settings में ON करें!
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={tgSyncingTopics}
                          onClick={handleSyncForumTopics}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-2xs"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${tgSyncingTopics ? 'animate-spin' : ''}`}
                          />
                          <span>Auto-Create &amp; Sync Topics</span>
                        </button>
                        <button
                          type="button"
                          disabled={tgLoadingQueue || tgIsRunning}
                          onClick={() => scanSelectedBatchLectures(tgSelectedBatchId)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-sky-200 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${tgLoadingQueue ? 'animate-spin' : ''}`}
                          />
                          <span>Re-Scan Subjects & Lectures</span>
                        </button>
                      </div>
                    </div>

                    {/* Provider Filter Pills (Sachin Academy First!) */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      {[
                        {
                          id: 'sachin',
                          label: `⭐ Sachin Academy Batches (${
                            overview.courses.filter((c) => c.provider === 'sachin').length
                          })`,
                        },
                        {
                          id: 'all',
                          label: `All Batches (${overview.courses.length})`,
                        },
                        {
                          id: 'kgs',
                          label: `KGS Batches (${
                            overview.courses.filter((c) => c.provider === 'kgs').length
                          })`,
                        },
                        {
                          id: 'pwthor',
                          label: `PWThor Batches (${
                            overview.courses.filter((c) => c.provider === 'pwthor').length
                          })`,
                        },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={tgIsRunning}
                          onClick={() => setTgProviderFilter(p.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-60 ${
                            tgProviderFilter === p.id
                              ? 'bg-sky-600 text-white'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                      <div>
                        <label
                          htmlFor="tg-batch-select"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          1. Select Batch ({tgFilteredBatches.length})
                        </label>
                        <select
                          id="tg-batch-select"
                          value={tgSelectedBatchId}
                          disabled={tgIsRunning}
                          onChange={(e) => setTgSelectedBatchId(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
                        >
                          {tgFilteredBatches.map((c) => (
                            <option key={c.id} value={c.id}>
                              [{c.provider.toUpperCase()}] {c.courseName} ({c.subjectCount}{' '}
                              Subjects · {c.lectureCount} Lectures)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label
                            htmlFor="tg-subject-filter-select"
                            className="block text-[11px] font-bold text-slate-700"
                          >
                            2. Filter Subject ({tgSubjectsList.length} Subjects Scanned)
                          </label>
                          <button
                            type="button"
                            disabled={tgIsRunning || tgLoadingQueue || !tgSelectedBatchId}
                            onClick={() => scanSelectedBatchLectures(tgSelectedBatchId, true)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 hover:text-sky-900 disabled:opacity-50"
                            title="Force rescan all subjects & topics from upstream"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${tgLoadingQueue ? 'animate-spin' : ''}`}
                            />
                            <span>Rescan</span>
                          </button>
                        </div>
                        <select
                          id="tg-subject-filter-select"
                          value={tgSubjectFilter}
                          disabled={tgIsRunning || tgLoadingQueue}
                          onChange={(e) => {
                            setTgSubjectFilter(e.target.value);
                            setTgCurrentIndex(0);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
                        >
                          <option value="all">
                            All Subjects ({tgQueue.length} Total Lectures)
                          </option>
                          {tgSubjectsList.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name} ({s.count} Lectures)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="tg-backend-url-input"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          3. Upload Engine (Built-in or Render URL)
                        </label>
                        <input
                          id="tg-backend-url-input"
                          type="url"
                          value={tgBackendUrl}
                          disabled={tgIsRunning}
                          onChange={(e) => handleSaveTgBackendUrl(e.target.value)}
                          placeholder="Built-in MTProto Server Active"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-sky-200/70">
                      <div className="text-xs text-slate-700 font-medium">
                        {tgLoadingQueue ? (
                          <span className="inline-flex items-center gap-1.5 text-sky-700 font-bold">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                            <span>Scanning all subjects & lectures in selected batch...</span>
                          </span>
                        ) : (
                          <span>
                            Scanned:{' '}
                            <strong className="font-bold text-sky-800">
                              {tgSubjectsList.length} Subjects
                            </strong>{' '}
                            · Ready Queue:{' '}
                            <strong className="font-bold text-slate-900">
                              {tgActiveQueue.length} Video Lectures
                            </strong>{' '}
                            · Completed:{' '}
                            <strong className="font-bold text-emerald-700">
                              {tgCompletedIds.size}
                            </strong>{' '}
                            · Failed:{' '}
                            <strong className="font-bold text-red-600">
                              {Object.keys(tgFailedIds).length}
                            </strong>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleToggleBulkTelegramUpload}
                        disabled={tgLoadingQueue || tgActiveQueue.length === 0}
                        className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 ${
                          tgIsRunning
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-sky-600 hover:bg-sky-700'
                        }`}
                      >
                        {tgIsRunning ? (
                          <>
                            <Square className="h-3.5 w-3.5 fill-current" />
                            <span>Stop Bulk Upload</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>
                              Start Bulk Upload to Telegram ({tgActiveQueue.length})
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {tgErrorMsg && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                      <span>{tgErrorMsg}</span>
                    </div>
                  )}

                  {/* Real-Time Progress Card for Active Lecture */}
                  {(tgIsRunning || tgCurrentStatus !== 'Idle') &&
                    tgActiveQueue[tgCurrentIndex] && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                              <span className="font-bold text-sky-700">
                                Lecture {tgCurrentIndex + 1} of {tgActiveQueue.length}
                              </span>
                              {tgCurrentJobId && (
                                <span>· Job ID: #{tgCurrentJobId}</span>
                              )}
                              {tgCurrentThreadId && (
                                <span className="text-emerald-700 font-bold">
                                  · Topic Thread #{tgCurrentThreadId}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                              {tgActiveQueue[tgCurrentIndex].lectureName}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${
                                tgCurrentStatus === 'Downloading'
                                  ? 'bg-amber-100 text-amber-900'
                                  : tgCurrentStatus === 'Uploading'
                                  ? 'bg-sky-100 text-sky-900'
                                  : tgCurrentStatus === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {(tgCurrentStatus === 'Downloading' ||
                                tgCurrentStatus === 'Uploading') && (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              )}
                              <span>{tgCurrentStatus}</span>
                            </span>
                            <span className="font-mono text-sm font-bold text-slate-900">
                              {tgCurrentProgress}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                          <div
                            className={`h-full transition-all duration-300 ${
                              tgCurrentStatus === 'Completed'
                                ? 'bg-emerald-600'
                                : tgCurrentStatus === 'Failed'
                                ? 'bg-red-600'
                                : tgCurrentStatus === 'Uploading'
                                ? 'bg-sky-600'
                                : 'bg-amber-500'
                            }`}
                            style={{
                              width: `${Math.max(0, Math.min(100, tgCurrentProgress))}%`,
                            }}
                          />
                        </div>

                        {/* Caption Preview */}
                        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] font-mono text-slate-700 space-y-0.5">
                          <div>
                            📁 <strong>Batch:</strong>{' '}
                            {overview.courses.find((c) => c.id === tgSelectedBatchId)
                              ?.courseName || tgSelectedBatchId}
                          </div>
                          <div>
                            📚 <strong>Subject:</strong>{' '}
                            {tgActiveQueue[tgCurrentIndex].subjectName || 'General'}{' '}
                            {tgTopicCache[tgActiveQueue[tgCurrentIndex].subjectName]
                              ? `(Forum Topic #${tgTopicCache[tgActiveQueue[tgCurrentIndex].subjectName]})`
                              : '(Auto-Creates Forum Topic)'}
                          </div>
                          <div>
                            🎬 <strong>Lecture:</strong>{' '}
                            {tgActiveQueue[tgCurrentIndex].lectureName}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Sequential Lecture Queue List */}
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {tgActiveQueue.map((item, idx) => {
                      const isDone = tgCompletedIds.has(item.id);
                      const failReason = tgFailedIds[item.id];
                      const isCurrent = tgIsRunning && idx === tgCurrentIndex;

                      return (
                        <div
                          key={`${item.subjectId || 'sub'}_${item.id}_${idx}`}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs transition-colors ${
                            isCurrent
                              ? 'border-sky-400 bg-sky-50/60'
                              : isDone
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : failReason
                              ? 'border-red-200 bg-red-50/40'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                              <span className="font-bold text-slate-700">
                                #{idx + 1}
                              </span>
                              <span>·</span>
                              <span className="truncate font-semibold text-sky-700">
                                {item.subjectName}
                              </span>
                              {item.topicName && (
                                <>
                                  <span>·</span>
                                  <span className="truncate text-slate-500">
                                    {item.topicName}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="font-bold text-slate-900 truncate mt-0.5">
                              {item.lectureName}
                            </p>
                            {failReason && (
                              <p className="text-[11px] text-red-600 font-semibold mt-0.5">
                                Error: {failReason}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                                <Check className="h-3.5 w-3.5" />
                                <span>Completed</span>
                              </span>
                            ) : isCurrent ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white">
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                <span>
                                  {tgCurrentStatus} ({tgCurrentProgress}%)
                                </span>
                              </span>
                            ) : failReason ? (
                              <>
                                <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-800">
                                  <span>Failed</span>
                                </span>
                                <button
                                  type="button"
                                  disabled={tgIsRunning}
                                  onClick={() => handleUploadSingleTelegramLecture(item, idx)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  <span>Retry</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  Queued
                                </span>
                                <button
                                  type="button"
                                  disabled={tgIsRunning}
                                  onClick={() => handleUploadSingleTelegramLecture(item, idx)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                                >
                                  <Send className="h-3 w-3" />
                                  <span>Upload</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: WEBSITE LOCK CONTROL */}
              {activeTab === 'sitelock' && (
                <div className="max-w-xl space-y-5">
                  <div
                    className={`rounded-2xl border p-4 ${
                      lockEnabled
                        ? 'border-amber-300 bg-amber-50/70'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                            lockEnabled
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {lockEnabled ? (
                            <Lock className="h-5 w-5" />
                          ) : (
                            <Unlock className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {lockEnabled
                              ? 'Website Lock is ACTIVE (Site Locked)'
                              : 'Website Lock is OFF (Site Open)'}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {lockEnabled
                              ? `No one can open mehulxstudy without entering the lock code: "${lockCode}"`
                              : 'Create a lock code below to lock the entire website behind an access code.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => handleSaveSiteLockForm(e)}
                    className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div>
                      <label
                        htmlFor="site-lock-code-input"
                        className="block text-xs font-bold text-slate-700 mb-1.5"
                      >
                        Create / Change Website Access Lock Code
                      </label>
                      <input
                        id="site-lock-code-input"
                        type="text"
                        value={lockCode}
                        onChange={(e) => setLockCode(e.target.value)}
                        placeholder="Enter secret code to unlock website (e.g. 7788, mehul123)..."
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Jab Website Lock ON hoga, tab bina ye code dale koi bhi website nahi khol payega.
                      </p>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Lock Entire Website (Require Code on Entry)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Toggle ON to lock the website immediately
                        </span>
                      </div>
                      <input
                        id="site-lock-toggle"
                        type="checkbox"
                        checked={lockEnabled}
                        onChange={(e) => setLockEnabled(e.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={savingLock}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 min-h-[42px] text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Lock className="h-4 w-4" />
                        <span>
                          {savingLock ? 'Saving...' : 'Save Website Lock Settings'}
                        </span>
                      </button>

                      {lockEnabled && (
                        <button
                          type="button"
                          onClick={() => handleSaveSiteLockForm(undefined, false)}
                          disabled={savingLock}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 min-h-[42px] text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          <Unlock className="h-4 w-4" />
                          <span>Unlock Website Now</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: VISITORS & IP TRACKER */}
              {activeTab === 'visitors' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        <span>Live Website Visitors & IP Address Log</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Dekhein aapki mehulxstudy website par kon-kon aaya hai, unka IP Address, Mobile/Desktop device, aur unhone konsa batch ya lecture khola.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleRefreshVisitors}
                        disabled={refreshingVisitors}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${refreshingVisitors ? 'animate-spin' : ''}`}
                        />
                        <span>Refresh IPs</span>
                      </button>
                      {visitorLogs.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearVisitors}
                          disabled={refreshingVisitors}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Clear Logs</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Unique Visitor IPs
                      </span>
                      <p className="text-xl font-bold text-slate-900 mt-0.5 font-mono">
                        {new Set(visitorLogs.map((v) => v.ip)).size}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Total Visitor Sessions
                      </span>
                      <p className="text-xl font-bold text-blue-600 mt-0.5 font-mono">
                        {visitorLogs.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Total Page / Lecture Views
                      </span>
                      <p className="text-xl font-bold text-emerald-700 mt-0.5 font-mono">
                        {visitorLogs.reduce((acc, v) => acc + (Number(v.visitCount) || 1), 0)}
                      </p>
                    </div>
                  </div>

                  {/* Search Visitor IPs */}
                  <div className="relative">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={visitorSearch}
                      onChange={(e) => setVisitorSearch(e.target.value)}
                      placeholder="Search visitor by IP address, device (Android, Windows, iPhone), or lecture/batch activity..."
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-xs sm:text-sm"
                    />
                  </div>

                  {/* Visitor IP List */}
                  {visitorLogs.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-xs text-slate-500">
                      No visitor logs recorded yet. Click "Refresh IPs" to load current visitors.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {visitorLogs
                        .filter((v) => {
                          const q = visitorSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            v.ip.toLowerCase().includes(q) ||
                            v.device.toLowerCase().includes(q) ||
                            v.lastAction.toLowerCase().includes(q) ||
                            (v.location || '').toLowerCase().includes(q)
                          );
                        })
                        .map((v, idx) => {
                          const isMobile = v.device.toLowerCase().includes('mobile');
                          const lastSeenDate = new Date(v.lastSeenAt);
                          const formattedTime = !isNaN(lastSeenDate.getTime())
                            ? lastSeenDate.toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : v.lastSeenAt;

                          return (
                            <div
                              key={v.id || `${v.ip}_${idx}`}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-blue-300 transition-colors"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                                    <span>IP: {v.ip}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyIp(v.ip)}
                                    title="Copy IP Address"
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    {copiedIp === v.ip ? (
                                      <>
                                        <Check className="h-3 w-3 text-emerald-600" />
                                        <span className="text-emerald-700">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="h-3 w-3" />
                                        <span>Copy IP</span>
                                      </>
                                    )}
                                  </button>
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                                    {isMobile ? (
                                      <Smartphone className="h-3 w-3" />
                                    ) : (
                                      <Monitor className="h-3 w-3" />
                                    )}
                                    <span>{v.device}</span>
                                  </span>
                                  {v.location && (
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                      <MapPin className="h-3 w-3 text-slate-500" />
                                      <span>{v.location}</span>
                                    </span>
                                  )}
                                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                    {v.visitCount} {v.visitCount === 1 ? 'Visit' : 'Visits'}
                                  </span>
                                </div>

                                <p className="text-xs font-semibold text-slate-800 truncate pt-0.5">
                                  Activity:{' '}
                                  <span className="font-bold text-blue-700">
                                    {v.lastAction}
                                  </span>
                                </p>
                              </div>

                              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 text-[11px] text-slate-500 font-mono">
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  <span>{formattedTime}</span>
                                </span>
                                {v.userAgent && (
                                  <span
                                    className="max-w-[240px] truncate text-[10px] text-slate-400"
                                    title={v.userAgent}
                                  >
                                    {v.userAgent}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: KGS AUTO-SYNC */}
              {activeTab === 'sync' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                          <Globe className="h-4 w-4 text-indigo-600" />
                          <span>KGS Live Auto-Sync Engine (sahukgs.com/batches)</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Auto-Update ON (Every 5m)
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Automatically syncs new lectures & PDFs from sahukgs.com/batches for tracked batches.
                      </p>
                      {lastSyncAt && (
                        <p className="text-[11px] text-slate-500 mt-1 font-mono">
                          Last Checked: {new Date(lastSyncAt).toLocaleTimeString()} · Catalog: {kgsCatalog.length || 1143} KGS Batches
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSyncKgs()}
                      disabled={syncingKgs}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 min-h-[42px] text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0 shadow-xs"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncingKgs ? 'animate-spin' : ''}`} />
                      <span>
                        {syncingKgs ? 'Syncing sahukgs.com...' : 'Sync All from sahukgs.com Now'}
                      </span>
                    </button>
                  </div>

                  <div className="flex gap-2 p-1.5 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSyncSubTab('tracked')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        syncSubTab === 'tracked'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tracked Auto-Updating Batches ({trackedIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSyncSubTab('browse');
                        if (kgsCatalog.length === 0) loadKgsCatalogData(true);
                      }}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        syncSubTab === 'browse'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Browse sahukgs.com/batches ({kgsCatalog.length || 1143})
                    </button>
                  </div>

                  {syncSubTab === 'tracked' ? (
                    <div className="space-y-4">
                      <form
                        onSubmit={(e) => handleSyncKgs(e)}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end"
                      >
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Add New KGS Batch ID from sahukgs.com/batches
                          </label>
                          <input
                            type="text"
                            value={syncBatchId}
                            onChange={(e) => setSyncBatchId(e.target.value)}
                            placeholder="e.g. 1285, 1265, 330, 1028"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Custom Title (Optional)
                          </label>
                          <input
                            type="text"
                            value={syncCustomName}
                            onChange={(e) => setSyncCustomName(e.target.value)}
                            placeholder="Optional custom batch name"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={syncingKgs || !syncBatchId.trim()}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 min-h-[36px] text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shrink-0"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          <span>Track & Sync Batch</span>
                        </button>
                      </form>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {trackedIds.map((bId) => {
                          const catItem = catalogById.get(String(bId));
                          const matchedCourse = overview?.courses.find(
                            (c) => c.id === `sr_kgs_${bId}`
                          );
                          const customTitle = overview?.customBatchNames?.[String(bId)];
                          const displayTitle =
                            customTitle ||
                            matchedCourse?.courseName ||
                            catItem?.title ||
                            `KGS Batch #${bId}`;

                          return (
                            <div
                              key={bId}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[11px] font-mono text-indigo-600 font-bold">
                                  <span>Batch ID: #{bId}</span>
                                  {matchedCourse && (
                                    <span className="text-emerald-700">
                                      · {matchedCourse.lectureCount} Lectures
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-xs font-bold text-slate-900 truncate mt-0.5">
                                  {displayTitle}
                                </h4>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleSyncKgs(undefined, String(bId))}
                                  disabled={syncingKgs}
                                  title="Force sync this batch now"
                                  className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                >
                                  <RefreshCw
                                    className={`h-3.5 w-3.5 ${
                                      syncingBatchId === String(bId) ? 'animate-spin' : ''
                                    }`}
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUntrackBatch(String(bId))}
                                  title="Stop auto-tracking this batch"
                                  className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          placeholder="Search any KGS batch from sahukgs.com/batches..."
                          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-xs sm:text-sm"
                        />
                      </div>

                      {catalogLoading && kgsCatalog.length === 0 ? (
                        <div className="flex items-center justify-center py-10 text-xs text-slate-500 gap-2">
                          <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />
                          <span>Loading live catalog from sahukgs.com/batches...</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                          {filteredCatalog.map((item) => {
                            const idStr = String(item.id);
                            const isTracked = trackedIds.includes(idStr);
                            const isThisSyncing = syncingBatchId === idStr;
                            const thumb = item.image_thumb || item.image_large || '';

                            return (
                              <div
                                key={idStr}
                                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {thumb ? (
                                    <img
                                      src={thumb}
                                      alt={item.title}
                                      className="h-12 w-16 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200"
                                    />
                                  ) : (
                                    <div className="h-12 w-16 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                                      #{idStr}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-mono font-bold text-indigo-600">
                                      KGS #{idStr}
                                    </span>
                                    <h4
                                      className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug"
                                      title={item.title}
                                    >
                                      {item.title}
                                    </h4>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSyncKgs(undefined, idStr)}
                                  disabled={syncingKgs}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                                    isTracked
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  }`}
                                >
                                  {isThisSyncing ? (
                                    <span className="inline-flex items-center gap-1">
                                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                      <span>Syncing...</span>
                                    </span>
                                  ) : isTracked ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      <span>Tracked</span>
                                    </span>
                                  ) : (
                                    <span>+ Track & Sync</span>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: ADD CUSTOM LECTURE / PDF */}
              {activeTab === 'add' && (
                <form onSubmit={handleAddSubmit} className="space-y-4 max-w-xl">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Course / Batch Name
                    </label>
                    <input
                      type="text"
                      required
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="e.g. UPSC (3 Year) Foundation Batch-Hindi Medium"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Subject / Folder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      placeholder="e.g. Polity (NCERT) By Arun Sir"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Lecture / PDF Title
                      </label>
                      <input
                        type="text"
                        required
                        value={itemName}
                        onChange={(e) => setItemName(e.target.value)}
                        placeholder="e.g. Lecture 15 || Constitutional Amendments"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Item Type
                      </label>
                      <select
                        value={itemType}
                        onChange={(e) => setItemType(e.target.value as 'video' | 'note')}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white"
                      >
                        <option value="video">Video Lecture</option>
                        <option value="note">PDF Note Only</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Direct Stream MP4 / M3U8 URL (Custom Player — Optional)
                    </label>
                    <input
                      type="text"
                      value={videoLink2}
                      onChange={(e) => setVideoLink2(e.target.value)}
                      placeholder="https://kgs-v2.akamaized.net/...mp4"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      YouTube Video URL (Original YouTube Player — Optional)
                    </label>
                    <input
                      type="text"
                      value={videoLink}
                      onChange={(e) => setVideoLink(e.target.value)}
                      placeholder="https://youtu.be/... or https://www.youtube.com/watch?v=..."
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Class PDF Handout URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={pdfLink}
                      onChange={(e) => setPdfLink(e.target.value)}
                      placeholder="https://kgs-v2.akamaized.net/...pdf"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 min-h-[44px] text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>{submitting ? 'Saving...' : 'Publish to Course'}</span>
                  </button>
                </form>
              )}

              {/* TAB 6: PORTAL BRANDING */}
              {activeTab === 'branding' && (
                <form onSubmit={handleSaveBranding} className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Portal Brand Title
                    </label>
                    <input
                      type="text"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Portal Tagline
                    </label>
                    <input
                      type="text"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 min-h-[44px] text-xs font-bold text-white hover:bg-blue-700"
                  >
                    <Check className="h-4 w-4" />
                    <span>Save Branding</span>
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
