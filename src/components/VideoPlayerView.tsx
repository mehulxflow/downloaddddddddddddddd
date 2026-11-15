import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Settings,
  FileText,
  Bookmark,
  ListVideo,
  Download,
  Trash2,
  Clock,
  Check,
  X,
  LoaderCircle,
  AlertCircle,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Tv,
  Camera,
  Zap,
  Wifi,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import {
  resolvePdfUrl,
  buildPdfViewerUrl,
  extractStreamQualities,
  extractYouTubeId,
  buildMasterM3u8Content,
  getResolutionMetadata,
  type StreamQualityOption,
} from '../utils/crypto';
import {
  type LectureItem,
  formatPlayerTime,
  formatLectureTitle,
} from '../utils/formatters';
import { fetchVideoDetails } from '../services/api';
import {
  startLectureVideoDownload,
  downloadLecturePdf,
  getVideoBlobFromIdb,
  type DownloadedItemRecord,
  formatBytes,
} from '../services/downloadManager';

// Global YouTube IFrame API Loader (In-App Custom Controlled Player — Zero External Redirects)
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      if (window.YT && window.YT.Player) {
        resolved = true;
        clearInterval(checkTimer);
        resolve(window.YT);
      }
    };

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      finish();
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }

    const checkTimer = setInterval(finish, 50);
  });
  return ytApiPromise;
}

/**
 * Aggressively unloads YouTube's internal captions/subtitles modules and clears active tracks
 * so auto-generated Hindi/English captions never cover the teacher's board.
 */
function forceDisableYtCaptions(player: any): void {
  if (!player) return;
  try {
    if (typeof player.unloadModule === 'function') {
      player.unloadModule('captions');
      player.unloadModule('cc');
    }
    if (typeof player.setOption === 'function') {
      player.setOption('captions', 'track', {});
      player.setOption('cc', 'track', {});
      player.setOption('captions', 'reload', false);
    }
  } catch {
    // ignore
  }
}

function getLectureYouTubeId(lec?: LectureItem | null): string | null {
  if (!lec) return null;
  const id =
    lec.youtubeId ||
    extractYouTubeId(lec.videoLink) ||
    extractYouTubeId(lec.videoLink2) ||
    extractYouTubeId(lec.file_link);
  return id || null;
}

const YT_QUALITY_OPTIONS: Array<{ label: string; vq: string; height: number }> = [
  { label: 'Auto', vq: 'default', height: 360 },
  { label: '240p', vq: 'small', height: 240 },
  { label: '360p', vq: 'medium', height: 360 },
  { label: '480p', vq: 'large', height: 480 },
  { label: '720p', vq: 'hd720', height: 720 },
  { label: '1080p', vq: 'hd1080', height: 1080 },
];

function mapLabelToYtVq(label: string, mode: NetworkShieldMode): { vq: string; height: number } {
  if (label === 'Auto') {
    if (mode === 'ultra-saver') return { vq: 'small', height: 240 };
    if (mode === 'hotspot-smart') return { vq: 'medium', height: 360 };
    return { vq: 'hd720', height: 720 };
  }
  const found = YT_QUALITY_OPTIONS.find((o) => o.label === label);
  return found ? { vq: found.vq, height: found.height } : { vq: 'medium', height: 360 };
}

interface TimedNote {
  id: string;
  videoId: string;
  timeSeconds: number;
  formattedTime: string;
  text: string;
  createdAt: number;
}

export type NetworkShieldMode = 'hotspot-smart' | 'ultra-saver' | 'high-hd';
export type PlayerSourceMode = 'direct' | 'youtube-inapp';

interface VideoPlayerViewProps {
  courseId: string;
  batchName?: string;
  subjectName?: string;
  topicName?: string;
  lecture: LectureItem;
  playlist: LectureItem[];
  downloadedItems: DownloadedItemRecord[];
  onSelectLecture: (lecture: LectureItem) => void;
  onOpenPdfModal: (lecture: LectureItem) => void;
  onOpenDownloadsTab: () => void;
  onBack: () => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const AUTO_HIDE_DELAY_MS = 2200;

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  courseId,
  batchName,
  subjectName,
  topicName,
  lecture,
  playlist,
  downloadedItems,
  onSelectLecture,
  onOpenPdfModal,
  onOpenDownloadsTab,
  onBack,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);
  const mountedYtVideoIdRef = useRef<string | null>(null);
  const pendingYtPlayRef = useRef<boolean>(true);
  const lastManualSeekMsRef = useRef<number>(0);
  const lastManualSeekTargetRef = useRef<number>(0);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const masterBlobUrlRef = useRef<string | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallWatchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for seamless quality switching & preventing synthetic mousemove bugs
  const resumeTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(true);
  const isSwitchingQualityRef = useRef<boolean>(false);
  const activeLectureIdRef = useRef<string>(lecture.id);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });

  // Mobile Hotspot / Low-Net Shield Mode (Default: 'hotspot-smart' for phone internet users)
  const [networkMode, setNetworkMode] = useState<NetworkShieldMode>(() => {
    try {
      const saved = localStorage.getItem('sachin_network_mode') as NetworkShieldMode | null;
      if (saved === 'hotspot-smart' || saved === 'ultra-saver' || saved === 'high-hd') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'hotspot-smart';
  });

  // Playback & Audio State (with persisted speed & volume)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [bufferedAheadSeconds, setBufferedAheadSeconds] = useState(0);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sachin_player_volume');
      return saved !== null ? Math.max(0, Math.min(1, parseFloat(saved))) : 1;
    } catch {
      return 1;
    }
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoMutedByBrowser, setIsAutoMutedByBrowser] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sachin_player_speed');
      return saved !== null ? Math.max(0.25, Math.min(2.5, parseFloat(saved))) : 1;
    } catch {
      return 1;
    }
  });
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isAutoplay, setIsAutoplay] = useState(true);

  // Layout & Viewing Modes
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isTheaterFullscreen, setIsTheaterFullscreen] = useState(false);
  const [isRotatedLandscape, setIsRotatedLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hudFeedback, setHudFeedback] = useState<string | null>(null);
  const [doubleClickRipple, setDoubleClickRipple] = useState<'left' | 'right' | null>(null);

  // Scrubber Hover & Drag State
  const [isHoveringScrubber, setIsHoveringScrubber] = useState(false);
  const [hoverPositionRatio, setHoverPositionRatio] = useState(0);
  const [isDraggingScrubber, setIsDraggingScrubber] = useState(false);

  // Synchronous Initial Stream & YouTube Resolution (Frame 1 — Zero Delay!)
  const initialExtractedQualities = useMemo(() => extractStreamQualities(lecture), [lecture]);
  const initialYtId = useMemo(() => getLectureYouTubeId(lecture), [lecture]);

  const [isBuffering, setIsBuffering] = useState(false);
  const [isResolvingStream, setIsResolvingStream] = useState<boolean>(
    () => initialExtractedQualities.length === 0 && !initialYtId
  );
  const [streamError, setStreamError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<StreamQualityOption[]>(initialExtractedQualities);
  const [resolvedYoutubeId, setResolvedYoutubeId] = useState<string | null>(initialYtId);
  const [playerSourceMode, setPlayerSourceMode] = useState<PlayerSourceMode>(() =>
    initialExtractedQualities.length > 0
      ? 'direct'
      : initialYtId
      ? 'youtube-inapp'
      : 'direct'
  );
  const [hasYtStartedPlaying, setHasYtStartedPlaying] = useState(false);
  const [ytEmbedFallback, setYtEmbedFallback] = useState(false);
  const [selectedQualityLabel, setSelectedQualityLabel] = useState<string>('Auto');
  const [activeStreamHeight, setActiveStreamHeight] = useState<number>(() =>
    networkMode === 'ultra-saver' ? 240 : networkMode === 'high-hd' ? 720 : 360
  );
  const [useDirectStream, setUseDirectStream] = useState(false);
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);
  const [cleanPdfUrl, setCleanPdfUrl] = useState<string>(() =>
    lecture.pdf_link ? resolvePdfUrl(lecture.pdf_link) : ''
  );
  const [cleanPdfUrl2, setCleanPdfUrl2] = useState<string>(() =>
    lecture.pdf_link2 ? resolvePdfUrl(lecture.pdf_link2) : ''
  );

  // Settings Popover & Submenus
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSubmenu, setSettingsSubmenu] = useState<'speed' | 'quality' | 'network' | null>(
    null
  );

  // Sheets & Study Deck Tabs
  const [showDownloadSheet, setShowDownloadSheet] = useState(false);
  const [activeDeckTab, setActiveDeckTab] = useState<'playlist' | 'pdf' | 'notes'>('playlist');

  // Timed Notes State
  const [notes, setNotes] = useState<TimedNote[]>([]);
  const [noteInput, setNoteInput] = useState('');

  const currentDownloadRecord = downloadedItems.find(
    (d) => d.id === `video_${lecture.id}`
  );

  // Enrich playlist titles so purely numeric titles ("1", "2") always display cleanly
  const enrichedPlaylist = useMemo(
    () =>
      playlist.map((item, idx) => ({
        ...item,
        Title: formatLectureTitle(item.Title, topicName, idx),
      })),
    [playlist, topicName]
  );

  const currentIndex = enrichedPlaylist.findIndex((item) => item.id === lecture.id);
  const displayLectureTitle = useMemo(
    () =>
      formatLectureTitle(
        lecture.Title,
        topicName,
        currentIndex >= 0 ? currentIndex : 0
      ),
    [lecture.Title, topicName, currentIndex]
  );

  const prevLecture = currentIndex > 0 ? enrichedPlaylist[currentIndex - 1] : null;
  const nextLecture =
    currentIndex >= 0 && currentIndex < enrichedPlaylist.length - 1
      ? enrichedPlaylist[currentIndex + 1]
      : null;

  // Live Refs so YT.Player callbacks & pollTimer NEVER read stale closures!
  const isDraggingScrubberRef = useRef(isDraggingScrubber);
  isDraggingScrubberRef.current = isDraggingScrubber;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isLoopingRef = useRef(isLooping);
  isLoopingRef.current = isLooping;
  const isAutoplayRef = useRef(isAutoplay);
  isAutoplayRef.current = isAutoplay;
  const nextLectureRef = useRef(nextLecture);
  nextLectureRef.current = nextLecture;
  const onSelectLectureRef = useRef(onSelectLecture);
  onSelectLectureRef.current = onSelectLecture;
  const selectedQualityLabelRef = useRef(selectedQualityLabel);
  selectedQualityLabelRef.current = selectedQualityLabel;
  const networkModeRef = useRef(networkMode);
  networkModeRef.current = networkMode;

  const effectiveDuration = duration > 0 ? duration : Number(lecture.duration) || 0;
  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const hoverTime = hoverPositionRatio * effectiveDuration;
  const clampedTooltipLeft = Math.max(4, Math.min(96, hoverPositionRatio * 100));

  // Should both controls and laptop mouse cursor be completely hidden?
  const shouldHideControlsAndCursor =
    isPlaying && !showControls && !settingsOpen && !isDraggingScrubber && !streamError;

  const showHud = useCallback((text: string) => {
    setHudFeedback(text);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => {
      setHudFeedback(null);
    }, 1150);
  }, []);

  // Format buffered ahead seconds in a compact human badge ("+45s" or "+3m 20s")
  const formattedBufferAhead = useMemo(() => {
    if (bufferedAheadSeconds <= 0) return '0s';
    if (bufferedAheadSeconds < 60) return `+${bufferedAheadSeconds}s`;
    const mins = Math.floor(bufferedAheadSeconds / 60);
    const secs = bufferedAheadSeconds % 60;
    return secs > 0 ? `+${mins}m ${secs}s` : `+${mins}m`;
  }, [bufferedAheadSeconds]);

  // Sync native fullscreen exit (when user presses ESC in browser fullscreen)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFull = Boolean(
        document.fullscreenElement || (document as any).webkitFullscreenElement
      );
      if (!isDocFull && isTheaterFullscreen && !isRotatedLandscape) {
        setIsTheaterFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isTheaterFullscreen, isRotatedLandscape]);

  // Guaranteed Auto-Hide Timer for Controls & Mouse Cursor
  const startAutoHideTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
    if (isPlaying && !settingsOpen && !isDraggingScrubber) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
      }, AUTO_HIDE_DELAY_MS);
    }
  }, [isPlaying, settingsOpen, isDraggingScrubber]);

  const wakeControls = useCallback(() => {
    setShowControls(true);
    startAutoHideTimer();
  }, [startAutoHideTimer]);

  // Ignore synthetic 0px mousemove events fired by browser DOM updates while video plays
  const handleStageMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
      const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
      if (dx < 4 && dy < 4) {
        return;
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      wakeControls();
    },
    [wakeControls]
  );

  const handleStageMouseLeave = useCallback(() => {
    if (isPlaying && !settingsOpen && !isDraggingScrubber) {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = null;
      }
      setShowControls(false);
    }
  }, [isPlaying, settingsOpen, isDraggingScrubber]);

  useEffect(() => {
    if (!isPlaying || settingsOpen || isDraggingScrubber) {
      setShowControls(true);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = null;
      }
    } else {
      startAutoHideTimer();
    }
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [isPlaying, settingsOpen, isDraggingScrubber, startAutoHideTimer]);

  // Helper to choose default quality label for a given NetworkShieldMode
  const getPreferredQualityForMode = useCallback(
    (mode: NetworkShieldMode, available: StreamQualityOption[]): string => {
      if (available.length === 0) return 'Auto';
      if (mode === 'ultra-saver') {
        const q240 = available.find((q) => q.label === '240p');
        const q360 = available.find((q) => q.label === '360p');
        return (q240 || q360 || available[available.length - 1]).label;
      }
      if (mode === 'hotspot-smart') {
        return 'Auto';
      }
      const q720 = available.find((q) => q.label === '720p');
      const q480 = available.find((q) => q.label === '480p');
      return (q720 || q480 || available[0]).label;
    },
    []
  );

  // Reset player state cleanly when switching to a different lecture
  useEffect(() => {
    activeLectureIdRef.current = lecture.id;
    isSwitchingQualityRef.current = false;
    wasPlayingRef.current = true;
    pendingYtPlayRef.current = true;
    lastManualSeekMsRef.current = 0;

    let savedPos = 0;
    try {
      const raw = localStorage.getItem(`sachin_watch_pos_${lecture.id}`);
      if (raw) {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed) && parsed > 5) {
          savedPos = parsed;
        }
      }
    } catch {
      // ignore
    }

    resumeTimeRef.current = savedPos;
    setCurrentTime(savedPos);
    setDuration(0);
    setBufferedPercent(0);
    setBufferedAheadSeconds(0);
    setIsPlaying(false);
    setIsBuffering(false);
    setHasYtStartedPlaying(false);
    setYtEmbedFallback(false);
    setIsAutoMutedByBrowser(false);
    setSettingsOpen(false);
    setSettingsSubmenu(null);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = savedPos;
    }
  }, [lecture.id]);

  // Load saved notes for current lecture
  useEffect(() => {
    const key = `sachin_notes_${lecture.id}`;
    try {
      const saved = localStorage.getItem(key);
      setNotes(saved ? JSON.parse(saved) : []);
    } catch {
      setNotes([]);
    }
  }, [lecture.id]);

  // Check offline Blob in IndexedDB
  useEffect(() => {
    let activeUrl: string | null = null;
    let cancelled = false;
    getVideoBlobFromIdb(`video_${lecture.id}`).then((blob) => {
      if (!cancelled && blob && blob.size > 0) {
        activeUrl = URL.createObjectURL(blob);
        setOfflineBlobUrl(activeUrl);
      } else if (!cancelled) {
        setOfflineBlobUrl(null);
      }
    });
    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [lecture.id, currentDownloadRecord?.status]);

  // Keep video playbackRate and volume locked to React state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        const clampedYtRate = Math.min(2, Math.max(0.25, playbackSpeed));
        ytPlayerRef.current.setPlaybackRate(clampedYtRate);
      } catch {
        // ignore
      }
    }
    try {
      localStorage.setItem('sachin_player_speed', String(playbackSpeed));
    } catch {
      // ignore
    }
  }, [playbackSpeed]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(Math.round(volume * 100));
        if (isMuted || volume === 0) {
          ytPlayerRef.current.mute();
        } else {
          ytPlayerRef.current.unMute();
          setIsAutoMutedByBrowser(false);
        }
      } catch {
        // ignore
      }
    }
    try {
      localStorage.setItem('sachin_player_volume', String(volume));
    } catch {
      // ignore
    }
  }, [volume, isMuted]);

  const persistNotes = (updated: TimedNote[]) => {
    setNotes(updated);
    try {
      localStorage.setItem(`sachin_notes_${lecture.id}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    let sec = Math.floor(currentTime);
    if (playerSourceMode === 'direct' && videoRef.current) {
      sec = Math.floor(videoRef.current.currentTime || currentTime);
    } else if (playerSourceMode === 'youtube-inapp' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        sec = Math.floor(ytPlayerRef.current.getCurrentTime() || currentTime);
      } catch {
        // ignore
      }
    }
    const newNote: TimedNote = {
      id: Date.now().toString(),
      videoId: lecture.id,
      timeSeconds: sec,
      formattedTime: formatPlayerTime(sec),
      text: noteInput.trim(),
      createdAt: Date.now(),
    };
    const next = [...notes, newNote].sort((a, b) => a.timeSeconds - b.timeSeconds);
    persistNotes(next);
    setNoteInput('');
  };

  const handleDeleteNote = (id: string) => {
    persistNotes(notes.filter((n) => n.id !== id));
  };

  const handleSeekTo = (seconds: number) => {
    setCurrentTime(seconds);
    resumeTimeRef.current = seconds;
    lastManualSeekMsRef.current = Date.now();
    lastManualSeekTargetRef.current = seconds;
    if (playerSourceMode === 'youtube-inapp' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(seconds, true);
        ytPlayerRef.current.playVideo();
      } catch {
        // ignore
      }
      return;
    }
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    if (!isPlaying) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Instant Silent Screenshot Capture (Pressed via 'S' key or Camera button — no popups, no pause!)
  const captureInstantScreenshot = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl || playerSourceMode === 'youtube-inapp') {
      if (playerSourceMode === 'youtube-inapp') {
        if (qualities.length > 0) {
          showHud('Switch to Server 1 (Direct MP4) for canvas screenshot');
        } else {
          showHud('📸 Timestamp bookmarked in Notes');
        }
      }
      return;
    }

    try {
      const width = videoEl.videoWidth || 1280;
      const height = videoEl.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoEl, 0, 0, width, height);

      const timeFormatted = formatPlayerTime(videoEl.currentTime || currentTime).replace(
        /:/g,
        '-'
      );
      const safeTitle = (displayLectureTitle || 'Lecture')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .trim()
        .slice(0, 50);
      const fileName = `${safeTitle}_${timeFormatted}.png`;

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showHud('📸 Screenshot Saved');
      }, 'image/png');
    } catch (err) {
      console.warn('Screenshot capture error:', err);
    }
  }, [currentTime, displayLectureTitle, playerSourceMode, qualities.length, showHud]);

  // Resolve and Decrypt Stream, YouTube ID & PDF Links (Instant on Frame 1 when lecture already has links!)
  const loadLectureStreams = useCallback(async () => {
    setStreamError(null);

    const applyResolvedLecture = (fullLecture: LectureItem) => {
      const rawPdf1 = fullLecture.pdf_link || lecture.pdf_link || '';
      const rawPdf2 = fullLecture.pdf_link2 || lecture.pdf_link2 || '';
      const clean1 = rawPdf1 ? resolvePdfUrl(rawPdf1) : '';
      const clean2 = rawPdf2 ? resolvePdfUrl(rawPdf2) : '';
      setCleanPdfUrl(clean1);
      setCleanPdfUrl2(clean2);

      const ytId = getLectureYouTubeId(fullLecture) || getLectureYouTubeId(lecture);
      const extracted = extractStreamQualities(fullLecture);

      setResolvedYoutubeId(ytId);
      setQualities(extracted);

      if (extracted.length > 0) {
        setPlayerSourceMode('direct');
        const preferredLabel = getPreferredQualityForMode(networkModeRef.current, extracted);
        setSelectedQualityLabel(preferredLabel);
        setIsResolvingStream(false);
        return true;
      }

      if (ytId) {
        setPlayerSourceMode('youtube-inapp');
        const ytQ = mapLabelToYtVq('Auto', networkModeRef.current);
        setSelectedQualityLabel('Auto');
        setActiveStreamHeight(ytQ.height);
        setIsResolvingStream(false);
        return true;
      }

      if (clean1) {
        setActiveDeckTab('pdf');
        setStreamError('This item is a PDF Handout Note. Read or download the PDF from the panel.');
        setIsResolvingStream(false);
        return true;
      }

      return false;
    };

    // Fast path: if the lecture prop already contains playable links, apply synchronously right now!
    const resolvedImmediately = applyResolvedLecture(lecture);
    if (resolvedImmediately && courseId.startsWith('sr_')) {
      return;
    }

    if (!resolvedImmediately) {
      setIsResolvingStream(true);
    }

    try {
      const fetched = await fetchVideoDetails(courseId, lecture.id);
      if (activeLectureIdRef.current !== lecture.id) return;

      if (fetched) {
        const merged: LectureItem = {
          ...lecture,
          ...fetched,
          Title: lecture.Title || fetched.Title,
        };
        const ok = applyResolvedLecture(merged);
        if (ok) return;
      }

      if (!resolvedImmediately) {
        setStreamError('No playable stream link found for this lecture.');
        setIsResolvingStream(false);
      }
    } catch (err: any) {
      if (activeLectureIdRef.current !== lecture.id) return;
      if (!resolvedImmediately) {
        setStreamError(err?.message || 'Failed to resolve lecture video stream.');
        setIsResolvingStream(false);
      }
    }
  }, [courseId, lecture, getPreferredQualityForMode]);

  useEffect(() => {
    loadLectureStreams();
  }, [loadLectureStreams]);

  // Destroy YT player only when unmounting VideoPlayerView or leaving 'youtube-inapp' mode
  useEffect(() => {
    if (playerSourceMode !== 'youtube-inapp') {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
        mountedYtVideoIdRef.current = null;
      }
    }
  }, [playerSourceMode]);

  useEffect(() => {
    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
        ytPlayerRef.current = null;
        ytReadyRef.current = false;
        mountedYtVideoIdRef.current = null;
      }
    };
  }, []);

  // Mount & Manage Original In-App YouTube Player when playerSourceMode === 'youtube-inapp'
  useEffect(() => {
    if (playerSourceMode !== 'youtube-inapp' || !resolvedYoutubeId || ytEmbedFallback) {
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let initialCaptionDisabled = false;

    if (videoRef.current) {
      videoRef.current.pause();
    }

    setStreamError(null);

    const startPlayback = (player: any, startSec: number) => {
      if (!player || cancelled) return;
      try {
        if (startSec > 2) {
          player.seekTo?.(startSec, true);
        }
        player.playVideo?.();
      } catch {
        // ignore
      }
    };

    const attachPollTimer = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (cancelled || !ytPlayerRef.current || !ytReadyRef.current) return;
        try {
          const p = ytPlayerRef.current;
          if (typeof p.getCurrentTime === 'function') {
            const t = p.getCurrentTime() || 0;
            const d = p.getDuration ? p.getDuration() || 0 : 0;
            const loadedFrac = p.getVideoLoadedFraction ? p.getVideoLoadedFraction() : 0;
            if (d > 0) {
              setDuration(d);
              const bufEnd = loadedFrac * d;
              setBufferedPercent(Math.min(100, loadedFrac * 100));
              setBufferedAheadSeconds(Math.max(0, Math.round(bufEnd - t)));
            }

            if (t > 0) {
              setCurrentTime(t);
              resumeTimeRef.current = t;
            }

            if (t > 5 && Math.floor(t) % 3 === 0) {
              localStorage.setItem(
                `sachin_watch_pos_${lecture.id}`,
                String(Math.floor(t))
              );
            }
          }
        } catch {
          // ignore
        }
      }, 500);
    };

    const startSec = Math.max(0, Math.floor(resumeTimeRef.current || 0));

    // Reuse existing YT.Player instance when switching between YouTube lectures
    if (
      ytPlayerRef.current &&
      ytReadyRef.current &&
      typeof ytPlayerRef.current.loadVideoById === 'function'
    ) {
      if (mountedYtVideoIdRef.current !== resolvedYoutubeId) {
        mountedYtVideoIdRef.current = resolvedYoutubeId;
        initialCaptionDisabled = false;
        setIsResolvingStream(false);
        setIsBuffering(false);
        try {
          ytPlayerRef.current.loadVideoById({
            videoId: resolvedYoutubeId,
            startSeconds: startSec > 2 ? startSec : 0,
          });
        } catch {
          // ignore
        }
      }
      attachPollTimer();
      return () => {
        cancelled = true;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    setIsResolvingStream(false);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !ytContainerRef.current) return;
        ytContainerRef.current.innerHTML = '';
        const mountEl = document.createElement('div');
        mountEl.style.width = '100%';
        mountEl.style.height = '100%';
        ytContainerRef.current.appendChild(mountEl);

        mountedYtVideoIdRef.current = resolvedYoutubeId;

        const playerVars: Record<string, any> = {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          fs: 1,
        };
        if (startSec > 2) {
          playerVars.start = startSec;
        }

        const player = new YT.Player(mountEl, {
          width: '100%',
          height: '100%',
          videoId: resolvedYoutubeId,
          playerVars,
          events: {
            onReady: (event: any) => {
              if (cancelled) return;
              ytReadyRef.current = true;
              setIsResolvingStream(false);
              setIsBuffering(false);
              try {
                const iframeEl = event.target.getIframe?.();
                if (iframeEl) {
                  iframeEl.setAttribute(
                    'allow',
                    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen'
                  );
                  iframeEl.setAttribute('allowfullscreen', 'true');
                }
                const dur = event.target.getDuration?.() || 0;
                if (dur > 0) setDuration(dur);
              } catch {
                // ignore
              }
              startPlayback(event.target, startSec);
            },
            onApiChange: (event: any) => {
              if (cancelled || initialCaptionDisabled) return;
              initialCaptionDisabled = true;
              forceDisableYtCaptions(event.target);
            },
            onStateChange: (event: any) => {
              if (cancelled) return;
              const state = event.data;
              if (state === 1) {
                setHasYtStartedPlaying(true);
                setIsPlaying(true);
                setIsBuffering(false);
                setIsResolvingStream(false);
                setStreamError(null);
                wasPlayingRef.current = true;
                try {
                  const dur = event.target.getDuration?.() || 0;
                  if (dur > 0) setDuration(dur);
                } catch {
                  // ignore
                }
              } else if (state === 2) {
                setIsPlaying(false);
                setIsBuffering(false);
              } else if (state === 3) {
                setIsBuffering(true);
                setIsResolvingStream(false);
              } else if (state === 0) {
                setIsPlaying(false);
                setIsBuffering(false);
                try {
                  localStorage.removeItem(`sachin_watch_pos_${lecture.id}`);
                } catch {
                  // ignore
                }
                if (isLoopingRef.current) {
                  event.target.seekTo(0, true);
                  event.target.playVideo();
                } else if (isAutoplayRef.current && nextLectureRef.current) {
                  const nxt = nextLectureRef.current;
                  showHud('Autoplaying next video...');
                  setTimeout(() => onSelectLectureRef.current(nxt), 1500);
                }
              }
            },
            onError: () => {
              if (cancelled) return;
              setIsResolvingStream(false);
              setIsBuffering(false);
              if (qualities.length > 0) {
                setPlayerSourceMode('direct');
                showHud('Switched to Server 1 (Custom Player)');
              } else {
                setYtEmbedFallback(true);
              }
            },
          },
        });

        ytPlayerRef.current = player;
        attachPollTimer();
      })
      .catch(() => {
        if (!cancelled) {
          setIsResolvingStream(false);
          setYtEmbedFallback(true);
        }
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [playerSourceMode, resolvedYoutubeId, lecture.id, ytEmbedFallback, qualities.length, showHud]);

  // Apply quality & networkMode rules to an active Hls instance WITHOUT destroying it or flushing buffer!
  const syncHlsLevelsToSelection = useCallback(
    (hls: Hls, targetLabel: string, mode: NetworkShieldMode, immediate = false) => {
      if (!hls.levels || hls.levels.length === 0) return;

      const findIdxByHeight = (h: number) =>
        hls.levels.findIndex((lvl) => lvl.height === h);

      if (targetLabel === 'Auto') {
        if (mode === 'ultra-saver') {
          const idx240 = findIdxByHeight(240);
          const idx360 = findIdxByHeight(360);
          const targetIdx = idx240 !== -1 ? idx240 : idx360 !== -1 ? idx360 : 0;
          hls.loadLevel = targetIdx;
          hls.autoLevelCapping = targetIdx;
          setActiveStreamHeight(hls.levels[targetIdx]?.height || 240);
        } else if (mode === 'hotspot-smart') {
          const idx480 = findIdxByHeight(480);
          const idx360 = findIdxByHeight(360);
          hls.autoLevelCapping =
            idx480 !== -1 ? idx480 : idx360 !== -1 ? idx360 : hls.levels.length - 1;
          hls.loadLevel = -1;
          hls.nextLevel = -1;
        } else {
          hls.autoLevelCapping = -1;
          hls.loadLevel = -1;
          hls.nextLevel = -1;
        }
        return;
      }

      const requestedHeight = getResolutionMetadata(targetLabel).height;
      const exactIdx = findIdxByHeight(requestedHeight);
      if (exactIdx !== -1) {
        hls.autoLevelCapping = -1;
        if (immediate) {
          hls.currentLevel = exactIdx;
        } else {
          hls.nextLevel = exactIdx;
          hls.loadLevel = exactIdx;
        }
        setActiveStreamHeight(hls.levels[exactIdx]?.height || requestedHeight);
      }
    },
    []
  );

  // Initialize Multi-Bitrate Master HLS / Direct MP4 Player when playerSourceMode === 'direct'
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || qualities.length === 0 || playerSourceMode !== 'direct') return;

    const targetResumeTime = resumeTimeRef.current > 0 ? resumeTimeRef.current : 0;
    const shouldPlay = wasPlayingRef.current || true;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (masterBlobUrlRef.current) {
      URL.revokeObjectURL(masterBlobUrlRef.current);
      masterBlobUrlRef.current = null;
    }

    let restored = false;
    const restorePlaybackState = () => {
      if (restored) return;
      restored = true;
      if (targetResumeTime > 0) {
        try {
          videoEl.currentTime = targetResumeTime;
          setCurrentTime(targetResumeTime);
        } catch {
          // ignore
        }
      }
      videoEl.playbackRate = playbackSpeed;
      videoEl.volume = volume;
      videoEl.muted = isMuted;
      if (shouldPlay) {
        setIsBuffering(true);
        videoEl
          .play()
          .then(() => {
            setIsBuffering(false);
          })
          .catch(() => {
            setIsBuffering(false);
          });
      } else {
        setIsBuffering(false);
      }
    };

    const m3u8Qualities = qualities.filter((q) => q.isM3u8);

    if (m3u8Qualities.length > 0 && Hls.isSupported()) {
      const masterM3u8Text = buildMasterM3u8Content(m3u8Qualities, useDirectStream);
      const blob = new Blob([masterM3u8Text], {
        type: 'application/vnd.apple.mpegurl',
      });
      const masterBlobUrl = URL.createObjectURL(blob);
      masterBlobUrlRef.current = masterBlobUrl;

      const sortedAsc = [...m3u8Qualities].sort(
        (a, b) =>
          getResolutionMetadata(a.label).height - getResolutionMetadata(b.label).height
      );
      let initialLevelIdx = 0;
      if (selectedQualityLabel !== 'Auto') {
        const found = sortedAsc.findIndex((q) => q.label === selectedQualityLabel);
        if (found !== -1) initialLevelIdx = found;
      } else if (networkMode === 'hotspot-smart') {
        const idx360 = sortedAsc.findIndex((q) => q.label === '360p');
        initialLevelIdx = idx360 !== -1 ? idx360 : 0;
      } else if (networkMode === 'high-hd') {
        const idx720 = sortedAsc.findIndex((q) => q.label === '720p');
        initialLevelIdx = idx720 !== -1 ? idx720 : sortedAsc.length - 1;
      }

      const hls = new Hls({
        lowLatencyMode: false,
        enableWorker: true,
        startLevel: initialLevelIdx,
        startPosition: targetResumeTime > 0 ? targetResumeTime : -1,
        maxBufferLength: networkMode === 'high-hd' ? 180 : 360,
        maxMaxBufferLength: 600,
        maxBufferSize: 160 * 1000 * 1000,
        backBufferLength: 120,
        maxBufferHole: 1.5,
        nudgeOffset: 0.25,
        nudgeMaxRetry: 12,
        abrEwmaDefaultEstimate: networkMode === 'ultra-saver' ? 240000 : 420000,
        abrBandWidthFactor: 0.68,
        abrBandWidthUpFactor: 0.48,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 800,
        fragLoadingMaxRetryTimeout: 15000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 6,
      });

      hlsRef.current = hls;
      hls.loadSource(masterBlobUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        syncHlsLevelsToSelection(hls, selectedQualityLabel, networkMode, true);
        restorePlaybackState();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const lvl = hls.levels[data.level];
        if (lvl && lvl.height) {
          setActiveStreamHeight(lvl.height);
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setIsBuffering(false);
        isSwitchingQualityRef.current = false;
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) {
          if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT
          ) {
            if (videoEl && videoEl.buffered.length > 0) {
              for (let i = 0; i < videoEl.buffered.length; i++) {
                const start = videoEl.buffered.start(i);
                const end = videoEl.buffered.end(i);
                if (
                  start > videoEl.currentTime &&
                  start - videoEl.currentTime <= 2.0 &&
                  end > start + 0.5
                ) {
                  videoEl.currentTime = start + 0.1;
                  break;
                }
              }
            }
            if (networkMode !== 'high-hd' && hls.levels && hls.levels.length > 1) {
              const curLvl = hls.loadLevel >= 0 ? hls.loadLevel : hls.currentLevel;
              if (curLvl > 0) {
                const lowerLvl = curLvl - 1;
                hls.loadLevel = lowerLvl;
                hls.nextLoadLevel = lowerLvl;
                const newH = hls.levels[lowerLvl]?.height || 240;
                setActiveStreamHeight(newH);
              }
            }
          }
          return;
        }

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (!useDirectStream) {
              if (videoEl.currentTime > 0) {
                resumeTimeRef.current = videoEl.currentTime;
                wasPlayingRef.current = !videoEl.paused;
              }
              setUseDirectStream(true);
            } else if (resolvedYoutubeId) {
              // Seamless fallback to In-App YouTube Player if direct stream is unreachable
              setPlayerSourceMode('youtube-inapp');
            } else {
              hls.startLoad();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            setIsBuffering(false);
            hls.destroy();
            if (resolvedYoutubeId) {
              setPlayerSourceMode('youtube-inapp');
            }
            break;
        }
      });
    } else {
      // Direct MP4 playback (e.g. kgs-v2.akamaized.net/...mp4)
      const chosen =
        qualities.find((q) => q.label === selectedQualityLabel) ||
        qualities[qualities.length - 1];
      const streamUrl = useDirectStream ? chosen.url : chosen.proxiedUrl;
      videoEl.src = streamUrl;
      const h = getResolutionMetadata(chosen.label).height;
      setActiveStreamHeight(h);

      const onLoadedMeta = () => {
        restorePlaybackState();
      };
      const onCanPlay = () => {
        restorePlaybackState();
        isSwitchingQualityRef.current = false;
        setIsBuffering(false);
      };
      const onVideoError = () => {
        // If direct MP4 fails and we haven't tried proxy/direct flip or YouTube fallback:
        if (!useDirectStream && chosen.proxiedUrl !== chosen.url) {
          setUseDirectStream(true);
        } else if (resolvedYoutubeId) {
          setPlayerSourceMode('youtube-inapp');
          showHud('Switched to In-App Stream 2');
        } else {
          setIsBuffering(false);
          setStreamError('Unable to load direct video stream.');
        }
      };

      videoEl.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
      videoEl.addEventListener('canplay', onCanPlay, { once: true });
      videoEl.addEventListener('error', onVideoError, { once: true });
      return () => {
        videoEl.removeEventListener('loadedmetadata', onLoadedMeta);
        videoEl.removeEventListener('canplay', onCanPlay);
        videoEl.removeEventListener('error', onVideoError);
      };
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (masterBlobUrlRef.current) {
        URL.revokeObjectURL(masterBlobUrlRef.current);
        masterBlobUrlRef.current = null;
      }
    };
  }, [qualities, useDirectStream, playerSourceMode, resolvedYoutubeId]);

  // Automatic Stall Watchdog: If video waits/buffers for >1.6s on mobile hotspot, step down to 240p/360p seamlessly
  useEffect(() => {
    if (stallWatchdogTimer.current) {
      clearTimeout(stallWatchdogTimer.current);
      stallWatchdogTimer.current = null;
    }

    if (
      playerSourceMode === 'direct' &&
      isBuffering &&
      isPlaying &&
      networkMode !== 'high-hd'
    ) {
      stallWatchdogTimer.current = setTimeout(() => {
        const hls = hlsRef.current;
        if (hls && hls.levels && hls.levels.length > 1) {
          const curLvl = hls.loadLevel >= 0 ? hls.loadLevel : hls.currentLevel;
          if (curLvl > 0) {
            const nextLower = 0;
            hls.loadLevel = nextLower;
            hls.nextLoadLevel = nextLower;
            const h = hls.levels[nextLower]?.height || 240;
            setActiveStreamHeight(h);
            showHud(`⚡ Low-Net Shield: Boosted at ${h}p`);
          }
        }
      }, 1600);
    }

    return () => {
      if (stallWatchdogTimer.current) {
        clearTimeout(stallWatchdogTimer.current);
      }
    };
  }, [playerSourceMode, isBuffering, isPlaying, networkMode, showHud]);

  // Update buffer range and calculate exact seconds buffered ahead of currentTime
  const updateBuffered = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.duration || el.duration <= 0 || el.buffered.length === 0) return;
    try {
      const now = el.currentTime;
      for (let i = el.buffered.length - 1; i >= 0; i--) {
        const start = el.buffered.start(i);
        const end = el.buffered.end(i);
        if (start - 0.5 <= now && now <= end + 0.5) {
          setBufferedPercent(Math.min(100, (end / el.duration) * 100));
          setBufferedAheadSeconds(Math.max(0, Math.round(end - now)));
          return;
        }
      }
      const lastEnd = el.buffered.end(el.buffered.length - 1);
      setBufferedPercent(Math.min(100, (lastEnd / el.duration) * 100));
      setBufferedAheadSeconds(Math.max(0, Math.round(lastEnd - now)));
    } catch {
      // ignore
    }
  }, []);

  // Switch Network Shield Mode ('hotspot-smart' | 'ultra-saver' | 'high-hd') without restarting video!
  const handleSelectNetworkMode = useCallback(
    (mode: NetworkShieldMode) => {
      setNetworkMode(mode);
      networkModeRef.current = mode;
      try {
        localStorage.setItem('sachin_network_mode', mode);
      } catch {
        // ignore
      }

      if (playerSourceMode === 'youtube-inapp') {
        const targetLabel =
          mode === 'ultra-saver' ? '240p' : mode === 'hotspot-smart' ? 'Auto' : '720p';
        const { vq, height } = mapLabelToYtVq(targetLabel, mode);
        setSelectedQualityLabel(targetLabel);
        selectedQualityLabelRef.current = targetLabel;
        setActiveStreamHeight(height);
        if (ytPlayerRef.current && ytReadyRef.current) {
          try {
            ytPlayerRef.current.setPlaybackQuality?.(vq);
            ytPlayerRef.current.setPlaybackQualityRange?.(vq, vq);
          } catch {
            // ignore
          }
        }
      } else {
        const preferredLabel = getPreferredQualityForMode(mode, qualities);
        setSelectedQualityLabel(preferredLabel);
        selectedQualityLabelRef.current = preferredLabel;
        const h =
          preferredLabel === 'Auto'
            ? mode === 'ultra-saver'
              ? 240
              : mode === 'high-hd'
              ? 720
              : 360
            : getResolutionMetadata(preferredLabel).height;
        setActiveStreamHeight(h);

        if (hlsRef.current) {
          hlsRef.current.config.maxBufferLength = mode === 'high-hd' ? 180 : 360;
          syncHlsLevelsToSelection(hlsRef.current, preferredLabel, mode, false);
        }
      }

      setSettingsSubmenu(null);
      setSettingsOpen(false);

      if (mode === 'ultra-saver') {
        showHud('⚡ Ultra Low-Net ON (240p + 10m Buffer)');
      } else if (mode === 'hotspot-smart') {
        showHud('⚡ Hotspot Shield ON (Smart 360p + 5m Buffer)');
      } else {
        showHud('HD Mode ON (720p/1080p)');
      }
    },
    [playerSourceMode, qualities, getPreferredQualityForMode, syncHlsLevelsToSelection, showHud]
  );

  const cycleNetworkModeShortcut = useCallback(() => {
    const order: NetworkShieldMode[] = ['hotspot-smart', 'ultra-saver', 'high-hd'];
    const nextIdx = (order.indexOf(networkMode) + 1) % order.length;
    handleSelectNetworkMode(order[nextIdx]);
  }, [networkMode, handleSelectNetworkMode]);

  const unmuteAutoMutedYt = useCallback(() => {
    if (!isAutoMutedByBrowser) return;
    setIsAutoMutedByBrowser(false);
    setIsMuted(false);
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.unMute?.();
        const targetVol = volumeRef.current > 0 ? volumeRef.current : 1;
        ytPlayerRef.current.setVolume?.(Math.round(targetVol * 100));
      } catch {
        // ignore
      }
    }
  }, [isAutoMutedByBrowser]);

  const togglePlay = useCallback(() => {
    if (playerSourceMode === 'youtube-inapp') {
      if (isAutoMutedByBrowser) {
        unmuteAutoMutedYt();
      }
      if (!ytPlayerRef.current || !ytReadyRef.current) {
        pendingYtPlayRef.current = true;
        setIsResolvingStream(true);
        showHud('Loading stream...');
        return;
      }
      try {
        const p = ytPlayerRef.current;
        const state = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1;
        forceDisableYtCaptions(p);
        if (state === 1) {
          wasPlayingRef.current = false;
          pendingYtPlayRef.current = false;
          setIsPlaying(false);
          p.pauseVideo?.();
          showHud('Pause');
        } else {
          wasPlayingRef.current = true;
          pendingYtPlayRef.current = true;
          setIsPlaying(true);
          if (!isMutedRef.current && volumeRef.current > 0) {
            p.unMute?.();
            p.setVolume?.(Math.round(volumeRef.current * 100));
          }
          p.playVideo?.();
          showHud('Play');
          setTimeout(() => {
            try {
              const nextSt = p.getPlayerState?.();
              if (nextSt !== 1 && nextSt !== 3 && pendingYtPlayRef.current) {
                p.mute?.();
                setIsAutoMutedByBrowser(true);
                p.playVideo?.();
              }
            } catch {
              // ignore
            }
          }, 350);
        }
      } catch {
        // ignore
      }
      return;
    }

    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      wasPlayingRef.current = true;
      el.playbackRate = playbackSpeed;
      el.play().catch(() => {});
      showHud('Play');
    } else {
      wasPlayingRef.current = false;
      el.pause();
      setIsBuffering(false);
      showHud('Pause');
    }
  }, [playerSourceMode, isAutoMutedByBrowser, unmuteAutoMutedYt, playbackSpeed, showHud]);

  const skipSeconds = useCallback(
    (delta: number) => {
      if (playerSourceMode === 'youtube-inapp' && ytPlayerRef.current && ytReadyRef.current) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime() || currentTime;
          const maxDur = ytPlayerRef.current.getDuration() || duration || 3600;
          const target = Math.max(0, Math.min(maxDur, cur + delta));
          lastManualSeekMsRef.current = Date.now();
          lastManualSeekTargetRef.current = target;
          setCurrentTime(target);
          resumeTimeRef.current = target;
          ytPlayerRef.current.seekTo(target, true);
          showHud(delta > 0 ? `+${delta}s` : `${delta}s`);
        } catch {
          // ignore
        }
        return;
      }

      const el = videoRef.current;
      if (!el) return;
      const maxDur = el.duration || duration || Number(lecture.duration) || 3600;
      const target = Math.max(0, Math.min(maxDur, el.currentTime + delta));
      lastManualSeekMsRef.current = Date.now();
      lastManualSeekTargetRef.current = target;
      el.currentTime = target;
      setCurrentTime(target);
      resumeTimeRef.current = target;
      showHud(delta > 0 ? `+${delta}s` : `${delta}s`);
    },
    [playerSourceMode, currentTime, duration, lecture.duration, showHud]
  );

  const seekToPercent = useCallback(
    (ratio: number) => {
      if (playerSourceMode === 'youtube-inapp' && ytPlayerRef.current && ytReadyRef.current) {
        try {
          const maxDur = ytPlayerRef.current.getDuration() || duration || 3600;
          const target = Math.max(0, Math.min(maxDur, ratio * maxDur));
          lastManualSeekMsRef.current = Date.now();
          lastManualSeekTargetRef.current = target;
          setCurrentTime(target);
          resumeTimeRef.current = target;
          ytPlayerRef.current.seekTo(target, true);
          showHud(`${Math.round(ratio * 100)}%`);
        } catch {
          // ignore
        }
        return;
      }

      const el = videoRef.current;
      if (!el) return;
      const maxDur = el.duration || duration || Number(lecture.duration) || 3600;
      const target = Math.max(0, Math.min(maxDur, ratio * maxDur));
      lastManualSeekMsRef.current = Date.now();
      lastManualSeekTargetRef.current = target;
      el.currentTime = target;
      setCurrentTime(target);
      resumeTimeRef.current = target;
      showHud(`${Math.round(ratio * 100)}%`);
    },
    [playerSourceMode, duration, lecture.duration, showHud]
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      const el = videoRef.current;
      const baseVol = isMuted ? 0 : volume;
      const newVol = Math.max(0, Math.min(1, Math.round((baseVol + delta) * 100) / 100));
      setVolume(newVol);
      const muted = newVol === 0;
      setIsMuted(muted);
      if (!muted) setIsAutoMutedByBrowser(false);
      if (el) {
        el.volume = newVol;
        el.muted = muted;
      }
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.setVolume(Math.round(newVol * 100));
          if (muted) ytPlayerRef.current.mute();
          else ytPlayerRef.current.unMute();
        } catch {
          // ignore
        }
      }
      showHud(`Volume ${Math.round(newVol * 100)}%`);
    },
    [volume, isMuted, showHud]
  );

  const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    const muted = val === 0;
    setIsMuted(muted);
    if (!muted) setIsAutoMutedByBrowser(false);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = muted;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.setVolume(Math.round(val * 100));
        if (muted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
      } catch {
        // ignore
      }
    }
  };

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    const nextMuted = isAutoMutedByBrowser ? false : !isMuted;
    setIsAutoMutedByBrowser(false);
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      if (el) el.volume = 0.5;
    }
    if (el) {
      el.muted = nextMuted;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (nextMuted) ytPlayerRef.current.mute();
        else {
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.setVolume(Math.round((volume || 0.5) * 100));
        }
      } catch {
        // ignore
      }
    }
    showHud(nextMuted ? 'Muted' : `Volume ${Math.round((volume || 0.5) * 100)}%`);
  }, [isAutoMutedByBrowser, isMuted, volume, showHud]);

  const changeSpeed = useCallback(
    (rate: number) => {
      setPlaybackSpeed(rate);
      playbackSpeedRef.current = rate;
      if (videoRef.current) {
        videoRef.current.playbackRate = rate;
      }
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.setPlaybackRate(Math.min(2, Math.max(0.25, rate)));
        } catch {
          // ignore
        }
      }
      showHud(`${rate}x Speed`);
    },
    [showHud]
  );

  const changeSpeedStep = useCallback(
    (delta: number) => {
      const target = Math.max(
        0.25,
        Math.min(2.5, Math.round((playbackSpeed + delta) * 100) / 100)
      );
      changeSpeed(target);
    },
    [playbackSpeed, changeSpeed]
  );

  // Switch between Direct MP4/HLS Stream and In-App YouTube Stream without losing timestamp
  const handleSwitchPlayerSource = useCallback(
    (nextMode: PlayerSourceMode) => {
      if (nextMode === playerSourceMode) return;
      resumeTimeRef.current = currentTime;
      wasPlayingRef.current = isPlaying || true;
      pendingYtPlayRef.current = true;
      setStreamError(null);
      setYtEmbedFallback(false);
      setPlayerSourceMode(nextMode);
      showHud(
        nextMode === 'direct'
          ? 'Server 1: Direct MP4 Player'
          : 'Server 2: In-App HD Player'
      );
    },
    [playerSourceMode, currentTime, isPlaying, showHud]
  );

  // Seamless Live Quality Switching for both Direct HLS/MP4 and In-App YouTube Streams!
  const handleQualitySelect = (label: string, forceMode?: PlayerSourceMode) => {
    const targetMode = forceMode || playerSourceMode;
    if (targetMode !== playerSourceMode) {
      handleSwitchPlayerSource(targetMode);
    }

    setSelectedQualityLabel(label);
    selectedQualityLabelRef.current = label;
    setSettingsSubmenu(null);
    setSettingsOpen(false);

    if (targetMode === 'youtube-inapp') {
      const { vq, height } = mapLabelToYtVq(label, networkMode);
      setActiveStreamHeight(height);
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.setPlaybackQuality?.(vq);
          ytPlayerRef.current.setPlaybackQualityRange?.(vq, vq);
        } catch {
          // ignore
        }
      }
      showHud(`Quality: ${label === 'Auto' ? `Auto (${height}p)` : label}`);
      startAutoHideTimer();
      return;
    }

    const videoEl = videoRef.current;
    const exactNow =
      videoEl && videoEl.currentTime > 0 ? videoEl.currentTime : currentTime;
    const playingNow = videoEl ? !videoEl.paused : isPlaying;

    resumeTimeRef.current = exactNow;
    wasPlayingRef.current = playingNow;

    if (hlsRef.current && hlsRef.current.levels && hlsRef.current.levels.length > 0) {
      syncHlsLevelsToSelection(hlsRef.current, label, networkMode, !playingNow);
      showHud(`Quality: ${label}`);
      startAutoHideTimer();
      return;
    }

    const h =
      label === 'Auto'
        ? networkMode === 'ultra-saver'
          ? 240
          : networkMode === 'high-hd'
          ? 720
          : 360
        : getResolutionMetadata(label).height;
    setActiveStreamHeight(h);
    showHud(`Quality: ${label}`);
    startAutoHideTimer();
  };

  // Fullscreen & Orientation Handlers
  const enterFullScreenMobileSafe = useCallback((rotateLandscape = false) => {
    setIsTheaterFullscreen(true);
    if (rotateLandscape) {
      setIsRotatedLandscape(true);
    }
    const container = playerContainerRef.current as any;
    const videoEl = videoRef.current as any;
    try {
      if (container?.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if (container?.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (!rotateLandscape && videoEl?.webkitEnterFullscreen) {
        videoEl.webkitEnterFullscreen();
      }
      if (rotateLandscape && (screen as any)?.orientation?.lock) {
        (screen as any).orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // Fixed viewport overlay is already active
    }
  }, []);

  const exitFullScreenMobileSafe = useCallback(() => {
    setIsTheaterFullscreen(false);
    setIsRotatedLandscape(false);
    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      if ((screen as any)?.orientation?.unlock) {
        (screen as any).orientation.unlock();
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isTheaterFullscreen || document.fullscreenElement) {
      exitFullScreenMobileSafe();
      showHud('Exit Fullscreen');
    } else {
      enterFullScreenMobileSafe(false);
      showHud('Fullscreen');
    }
  }, [isTheaterFullscreen, exitFullScreenMobileSafe, enterFullScreenMobileSafe, showHud]);

  const toggleTheaterMode = useCallback(() => {
    setIsTheaterMode((prev) => {
      const next = !prev;
      showHud(next ? 'Theater Mode' : 'Default View');
      return next;
    });
  }, [showHud]);

  const toggleMiniplayer = useCallback(async () => {
    if (!videoRef.current || playerSourceMode === 'youtube-inapp') return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        showHud('Exit Miniplayer');
      } else if (
        document.pictureInPictureEnabled &&
        videoRef.current.requestPictureInPicture
      ) {
        await videoRef.current.requestPictureInPicture();
        showHud('Miniplayer Active');
      }
    } catch (err) {
      console.warn('Picture in Picture failed:', err);
    }
  }, [playerSourceMode, showHud]);

  const toggleLandscapeRotation = () => {
    if (isTheaterFullscreen && isRotatedLandscape) {
      setIsRotatedLandscape(false);
      showHud('Portrait Mode');
    } else {
      enterFullScreenMobileSafe(true);
      showHud('Landscape 90°');
    }
  };

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.shiftKey) {
        if (
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === '>' ||
          e.key === '.'
        ) {
          e.preventDefault();
          changeSpeedStep(0.25);
          return;
        }
        if (
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowDown' ||
          e.key === '<' ||
          e.key === ','
        ) {
          e.preventDefault();
          changeSpeedStep(-0.25);
          return;
        }
        if (e.key === 'N' || e.key === 'n') {
          e.preventDefault();
          if (nextLecture) {
            onSelectLecture(nextLecture);
            showHud('Next Video');
          }
          return;
        }
        if (e.key === 'P' || e.key === 'p') {
          e.preventDefault();
          if (prevLecture) {
            onSelectLecture(prevLecture);
            showHud('Previous Video');
          }
          return;
        }
      }

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          captureInstantScreenshot();
          break;
        case 'd':
          e.preventDefault();
          cycleNetworkModeShortcut();
          break;
        case ' ':
        case 'k':
          e.preventDefault();
          if (target && target.tagName === 'BUTTON') {
            target.blur();
          }
          togglePlay();
          break;
        case 'j':
          e.preventDefault();
          skipSeconds(-10);
          break;
        case 'l':
          e.preventDefault();
          skipSeconds(10);
          break;
        case 'arrowleft':
          e.preventDefault();
          skipSeconds(-5);
          break;
        case 'arrowright':
          e.preventDefault();
          skipSeconds(5);
          break;
        case 'arrowup':
          e.preventDefault();
          adjustVolume(0.05);
          break;
        case 'arrowdown':
          e.preventDefault();
          adjustVolume(-0.05);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 't':
          e.preventDefault();
          toggleTheaterMode();
          break;
        case 'i':
          e.preventDefault();
          toggleMiniplayer();
          break;
        case 'home':
          e.preventDefault();
          seekToPercent(0);
          break;
        case 'end':
          e.preventDefault();
          seekToPercent(1);
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault();
          seekToPercent(parseInt(e.key, 10) * 0.1);
          break;
        case 'escape':
          if (settingsOpen) {
            setSettingsOpen(false);
            setSettingsSubmenu(null);
          } else if (isTheaterFullscreen) {
            exitFullScreenMobileSafe();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    captureInstantScreenshot,
    cycleNetworkModeShortcut,
    changeSpeedStep,
    togglePlay,
    skipSeconds,
    adjustVolume,
    toggleMute,
    toggleFullscreen,
    toggleTheaterMode,
    toggleMiniplayer,
    seekToPercent,
    nextLecture,
    prevLecture,
    onSelectLecture,
    showHud,
    settingsOpen,
    isTheaterFullscreen,
    exitFullScreenMobileSafe,
  ]);

  // Calculate normalized [0..1] ratio along the scrubber
  const computeScrubberRatio = useCallback(
    (clientX: number, clientY: number): number => {
      if (!progressBarRef.current) return 0;
      const rect = progressBarRef.current.getBoundingClientRect();
      if (isTheaterFullscreen && isRotatedLandscape) {
        if (rect.height <= 0) return 0;
        return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      }
      if (rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    [isTheaterFullscreen, isRotatedLandscape]
  );

  const applyScrubRatio = useCallback(
    (ratio: number, commitSeek = true) => {
      let activeDur =
        (videoRef.current && videoRef.current.duration) ||
        duration ||
        Number(lecture.duration) ||
        0;
      if (playerSourceMode === 'youtube-inapp' && ytPlayerRef.current && ytReadyRef.current) {
        try {
          activeDur = ytPlayerRef.current.getDuration() || activeDur;
        } catch {
          // ignore
        }
      }
      if (activeDur <= 0) return;
      const targetTime = ratio * activeDur;
      lastManualSeekMsRef.current = Date.now();
      lastManualSeekTargetRef.current = targetTime;
      setCurrentTime(targetTime);
      resumeTimeRef.current = targetTime;
      if (playerSourceMode === 'youtube-inapp' && ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.seekTo(targetTime, commitSeek);
        } catch {
          // ignore
        }
        return;
      }
      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
      }
    },
    [playerSourceMode, duration, lecture.duration]
  );

  // Scrubber Pointer / Touch / Mouse Handlers
  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const ratio = computeScrubberRatio(e.clientX, e.clientY);
    setHoverPositionRatio(ratio);
  };

  const handleScrubberMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const ratio = computeScrubberRatio(e.clientX, e.clientY);
    setHoverPositionRatio(ratio);
    isDraggingScrubberRef.current = true;
    setIsDraggingScrubber(true);
    applyScrubRatio(ratio, true);
  };

  const handleScrubberTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const ratio = computeScrubberRatio(touch.clientX, touch.clientY);
    setHoverPositionRatio(ratio);
    setIsHoveringScrubber(true);
    isDraggingScrubberRef.current = true;
    setIsDraggingScrubber(true);
    applyScrubRatio(ratio, true);
  };

  useEffect(() => {
    if (!isDraggingScrubber) return;

    let latestRatio = hoverPositionRatio;

    const onWindowMouseMove = (e: MouseEvent) => {
      const ratio = computeScrubberRatio(e.clientX, e.clientY);
      latestRatio = ratio;
      setHoverPositionRatio(ratio);
      applyScrubRatio(ratio, false);
    };

    const onWindowTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const ratio = computeScrubberRatio(touch.clientX, touch.clientY);
      latestRatio = ratio;
      setHoverPositionRatio(ratio);
      applyScrubRatio(ratio, false);
    };

    const onWindowUp = () => {
      applyScrubRatio(latestRatio, true);
      isDraggingScrubberRef.current = false;
      setIsDraggingScrubber(false);
      setIsHoveringScrubber(false);
      startAutoHideTimer();
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowUp);
    window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', onWindowUp);
    window.addEventListener('touchcancel', onWindowUp);

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowUp);
      window.removeEventListener('touchcancel', onWindowUp);
    };
  }, [isDraggingScrubber, hoverPositionRatio, computeScrubberRatio, applyScrubRatio, startAutoHideTimer]);

  // Smart Click / Double-Click / Touch Handler on Video Stage (Only for custom player on normal videos)
  const handlePlayerAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (playerSourceMode === 'youtube-inapp') return;
    if ((e.target as HTMLElement).closest('.yt-control-element')) return;

    if (settingsOpen) {
      setSettingsOpen(false);
      setSettingsSubmenu(null);
      startAutoHideTimer();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    let isRightHalf = e.clientX - rect.left > rect.width / 2;
    if (isTheaterFullscreen && isRotatedLandscape) {
      isRightHalf = e.clientY - rect.top > rect.height / 2;
    }

    const isTouchDevice =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      if (isRightHalf) {
        setDoubleClickRipple('right');
        skipSeconds(10);
      } else {
        setDoubleClickRipple('left');
        skipSeconds(-10);
      }
      setTimeout(() => setDoubleClickRipple(null), 600);
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        if (isTouchDevice) {
          setShowControls((prev) => {
            const next = !prev;
            if (next && isPlaying) {
              startAutoHideTimer();
            }
            return next;
          });
        } else {
          togglePlay();
          wakeControls();
        }
      }, 200);
    }
  };

  // PDF Extraction & Download Handler
  const handleExtractPdfFromIframe = async (targetPdfUrl?: string, partLabel?: string) => {
    const urlToUse = targetPdfUrl || cleanPdfUrl;
    const filename = `${(displayLectureTitle || 'my_document').replace(
      /[/\\?%*:|"<>]/g,
      '_'
    )}${partLabel ? `_${partLabel}` : ''}.pdf`;

    try {
      const iframe =
        pdfIframeRef.current ||
        (document.querySelector('iframe.pdf-viewer-frame') as HTMLIFrameElement | null);
      const app = (iframe?.contentWindow as any)?.PDFViewerApplication;
      if (app?.pdfDocument) {
        const data = await app.pdfDocument.getData();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        showHud('PDF Saved');
        return;
      }
    } catch (err) {
      console.warn(
        'PDFViewerApplication extraction failed, falling back to server download:',
        err
      );
    }

    if (urlToUse) {
      downloadLecturePdf({
        courseId,
        batchName,
        subjectName,
        topicName,
        lecture: {
          ...lecture,
          Title: filename.replace('.pdf', ''),
        },
      });
      showHud('Downloading PDF...');
    }
  };

  const handleStartVideoDownload = (qualityLabel: string, maxSegmentsLimit?: number) => {
    startLectureVideoDownload({
      courseId,
      batchName,
      subjectName,
      topicName,
      lecture: {
        ...lecture,
        Title: displayLectureTitle,
      },
      qualityLabel,
      maxSegmentsLimit,
    });
    setShowDownloadSheet(false);
    showHud(`Starting download (${qualityLabel})`);
  };

  const cursorVisibilityClass = shouldHideControlsAndCursor
    ? '!cursor-none [&_*]:!cursor-none'
    : '';

  const stageOuterClass = isTheaterFullscreen
    ? `fixed inset-0 z-[100] w-full h-full bg-black flex items-center justify-center select-none overflow-hidden ${cursorVisibilityClass}`
    : isTheaterMode
    ? `relative w-full aspect-[21/9] sm:aspect-[2.35/1] max-h-[75vh] min-h-[340px] rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-2xl select-none ${cursorVisibilityClass}`
    : `relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-xl select-none ${cursorVisibilityClass}`;

  const stageInnerClass =
    isTheaterFullscreen && isRotatedLandscape
      ? 'relative w-[100dvh] h-[100dvw] rotate-90 shrink-0 flex flex-col justify-center overflow-hidden bg-black'
      : 'relative w-full h-full flex flex-col justify-center overflow-hidden';

  const effectiveQualityBadge =
    selectedQualityLabel === 'Auto'
      ? `Auto (${activeStreamHeight}p)`
      : selectedQualityLabel;

  const hasDualSources = qualities.length > 0 && Boolean(resolvedYoutubeId);

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4">
      {/* Top Header Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-xs"
        >
          <ArrowLeft className="h-4 w-4 text-red-600" />
          <span>Back to Lectures</span>
        </button>

        {/* Stream Source Switcher & Mobile Hotspot / Low-Net Shield Status */}
        <div className="flex flex-wrap items-center gap-2">
          {hasDualSources && (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
              <button
                type="button"
                onClick={() => handleSwitchPlayerSource('direct')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  playerSourceMode === 'direct'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Player (Direct MP4)
              </button>
              <button
                type="button"
                onClick={() => handleSwitchPlayerSource('youtube-inapp')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  playerSourceMode === 'youtube-inapp'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Original YouTube Player
              </button>
            </div>
          )}

          {playerSourceMode === 'direct' && (
            <button
              type="button"
              onClick={cycleNetworkModeShortcut}
              title="Click or press D to switch Mobile Hotspot / Low-Net Mode"
              className={`inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors border shadow-xs ${
                networkMode === 'ultra-saver'
                  ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                  : networkMode === 'hotspot-smart'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Zap
                className={`h-4 w-4 shrink-0 ${
                  networkMode === 'ultra-saver'
                    ? 'text-white fill-current'
                    : networkMode === 'hotspot-smart'
                    ? 'text-amber-600 fill-current'
                    : 'text-slate-500'
                }`}
              />
              <span>
                {networkMode === 'ultra-saver'
                  ? 'Ultra Low-Net (240p Lock)'
                  : networkMode === 'hotspot-smart'
                  ? 'Hotspot Shield ON'
                  : 'High-Speed HD Mode'}
              </span>
              <span className="hidden sm:inline font-mono text-[11px] opacity-85">
                • {effectiveQualityBadge} • Buffer {formattedBufferAhead}
              </span>
            </button>
          )}

          {prevLecture && (
            <button
              type="button"
              onClick={() => onSelectLecture(prevLecture)}
              title="Previous Video (Shift+P)"
              className="inline-flex items-center gap-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Prev Class</span>
            </button>
          )}
          {nextLecture && (
            <button
              type="button"
              onClick={() => onSelectLecture(nextLecture)}
              title="Next Video (Shift+N)"
              className="inline-flex items-center gap-1 min-h-[42px] px-3 py-2 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-xs"
            >
              <span>Next Class</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Adapts cleanly when Theater Mode is on vs off */}
      <div
        className={
          isTheaterMode
            ? 'flex flex-col gap-5'
            : 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'
        }
      >
        {/* Left Zone: Video Player */}
        <div
          className={
            isTheaterMode
              ? 'w-full flex flex-col gap-3.5'
              : 'lg:col-span-8 flex flex-col gap-3.5'
          }
        >
          {/* Video Player Viewport */}
          <div
            ref={playerContainerRef}
            onMouseMove={playerSourceMode === 'direct' ? handleStageMouseMove : undefined}
            onMouseLeave={playerSourceMode === 'direct' ? handleStageMouseLeave : undefined}
            onClick={playerSourceMode === 'direct' ? handlePlayerAreaClick : undefined}
            className={`${stageOuterClass} group`}
          >
            <div className={stageInnerClass}>
              {/* Exit Fullscreen Button when rotated / fullscreen in YouTube mode */}
              {playerSourceMode === 'youtube-inapp' && isTheaterFullscreen && (
                <button
                  type="button"
                  onClick={exitFullScreenMobileSafe}
                  aria-label="Exit Fullscreen"
                  className="yt-control-element absolute top-3 left-3 z-30 inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 text-white text-xs font-bold border border-white/25 backdrop-blur-md shadow-lg"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Exit Fullscreen</span>
                </button>
              )}

              {/* Custom Top Shadow Overlay (ONLY for normal videos in Custom Player mode) */}
              {playerSourceMode === 'direct' && (
                <div
                  className={`yt-control-element absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-b from-black/90 via-black/40 to-transparent px-3 sm:px-4 py-2.5 transition-opacity duration-200 ${
                    !shouldHideControlsAndCursor
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isTheaterFullscreen && (
                      <button
                        type="button"
                        onClick={exitFullScreenMobileSafe}
                        aria-label="Exit Fullscreen"
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold backdrop-blur-md shrink-0"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back</span>
                      </button>
                    )}
                    <span className="text-xs sm:text-sm font-semibold text-white truncate drop-shadow-md">
                      {displayLectureTitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(true);
                        setSettingsSubmenu('network');
                      }}
                      title="Hotspot / Low-Net Shield Settings (Press D)"
                      className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors ${
                        bufferedAheadSeconds >= 25
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/90'
                          : 'bg-amber-950/80 text-amber-300 border-amber-500/40 hover:bg-amber-900/90'
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5 fill-current shrink-0" />
                      <span>{effectiveQualityBadge}</span>
                      {bufferedAheadSeconds > 0 && (
                        <span className="hidden sm:inline">• {formattedBufferAhead}</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleLandscapeRotation}
                      title="Rotate Phone 90°"
                      className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/90 text-white text-xs font-medium border border-white/20 transition-colors"
                    >
                      <Smartphone className="h-3.5 w-3.5 text-blue-400 rotate-90" />
                      <span className="hidden sm:inline">
                        {isRotatedLandscape ? 'Portrait' : 'Rotate 90°'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Engine 1: Native HTML5 <video> + HLS.js (Normal Direct MP4 / M3U8 Streams with Custom Player) */}
              <video
                ref={videoRef}
                poster={lecture.thumbnail || undefined}
                loop={isLooping}
                preload="auto"
                onTimeUpdate={() => {
                  if (playerSourceMode !== 'direct') return;
                  if (videoRef.current) {
                    const t = videoRef.current.currentTime;
                    if (
                      isSwitchingQualityRef.current &&
                      resumeTimeRef.current > 1 &&
                      t < 1
                    ) {
                      videoRef.current.currentTime = resumeTimeRef.current;
                      return;
                    }
                    if (
                      isSwitchingQualityRef.current &&
                      resumeTimeRef.current > 0 &&
                      Math.abs(t - resumeTimeRef.current) < 2
                    ) {
                      isSwitchingQualityRef.current = false;
                    }
                    if (!isDraggingScrubber) {
                      setCurrentTime(t);
                    }
                    setDuration(videoRef.current.duration || 0);
                    updateBuffered();

                    if (t > 5 && Math.floor(t) % 3 === 0) {
                      try {
                        localStorage.setItem(
                          `sachin_watch_pos_${lecture.id}`,
                          String(Math.floor(t))
                        );
                      } catch {
                        // ignore
                      }
                    }
                  }
                }}
                onProgress={updateBuffered}
                onPlay={() => {
                  if (playerSourceMode !== 'direct') return;
                  setIsPlaying(true);
                  wasPlayingRef.current = true;
                  if (videoRef.current && videoRef.current.playbackRate !== playbackSpeed) {
                    videoRef.current.playbackRate = playbackSpeed;
                  }
                }}
                onPause={() => {
                  if (playerSourceMode !== 'direct') return;
                  setIsPlaying(false);
                  setIsBuffering(false);
                }}
                onWaiting={() => {
                  if (playerSourceMode !== 'direct') return;
                  if (videoRef.current && !videoRef.current.paused) {
                    setIsBuffering(true);
                  }
                }}
                onPlaying={() => {
                  if (playerSourceMode !== 'direct') return;
                  setIsBuffering(false);
                  setIsPlaying(true);
                }}
                onCanPlay={() => {
                  if (playerSourceMode !== 'direct') return;
                  setIsBuffering(false);
                }}
                onSeeked={() => {
                  if (playerSourceMode !== 'direct') return;
                  setIsBuffering(false);
                }}
                onEnded={() => {
                  if (playerSourceMode !== 'direct') return;
                  setIsPlaying(false);
                  setIsBuffering(false);
                  try {
                    localStorage.removeItem(`sachin_watch_pos_${lecture.id}`);
                  } catch {
                    // ignore
                  }
                  if (isAutoplay && nextLecture) {
                    showHud('Autoplaying next video...');
                    setTimeout(() => onSelectLecture(nextLecture), 1500);
                  }
                }}
                playsInline
                className={`h-full w-full object-contain ${
                  playerSourceMode === 'direct' ? 'block' : 'hidden'
                } ${shouldHideControlsAndCursor ? '!cursor-none' : 'cursor-pointer'}`}
              />

              {/* Engine 2: Original YouTube Player (No custom layer on top — 100% native YouTube player!) */}
              {playerSourceMode === 'youtube-inapp' && resolvedYoutubeId && (
                <div className="relative h-full w-full overflow-hidden bg-black">
                  {ytEmbedFallback ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${resolvedYoutubeId}?autoplay=1&controls=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&cc_load_policy=0&fs=1`}
                      title={displayLectureTitle}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full border-0"
                    />
                  ) : (
                    <div
                      ref={ytContainerRef}
                      className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0"
                    />
                  )}
                </div>
              )}

              {/* Buffering Spinner (ONLY for Custom Player mode) */}
              {playerSourceMode === 'direct' &&
                (isResolvingStream || (isBuffering && isPlaying)) &&
                !streamError && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-xs">
                      <LoaderCircle className="h-8 w-8 animate-spin text-red-500" />
                    </div>
                    {isBuffering && isPlaying && (
                      <span className="rounded-full bg-black/75 px-3 py-1 text-[11px] font-semibold text-amber-300 border border-amber-500/30">
                        ⚡ Optimizing stream for mobile network...
                      </span>
                    )}
                  </div>
                )}

              {/* Center Play/Seek Overlay (ONLY for Custom Player mode) */}
              {playerSourceMode === 'direct' &&
                !streamError &&
                !isResolvingStream &&
                (!isPlaying || showControls) && (
                  <div
                    className={`pointer-events-none absolute inset-0 z-20 items-center justify-center gap-6 sm:gap-10 ${
                      !isPlaying ? 'flex' : 'flex sm:hidden'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        skipSeconds(-10);
                        wakeControls();
                      }}
                      aria-label="Rewind 10 seconds"
                      className="yt-control-element pointer-events-auto flex sm:hidden flex-col items-center justify-center h-11 w-11 rounded-full bg-black/65 hover:bg-black/85 text-white border border-white/20 active:scale-95 transition-all backdrop-blur-xs"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="text-[9px] font-mono font-bold">-10s</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        togglePlay();
                        wakeControls();
                      }}
                      aria-label={isPlaying ? 'Pause video' : 'Play video'}
                      className="yt-control-element pointer-events-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-red-600/90 hover:bg-red-600 text-white border-2 border-white/25 shadow-xl active:scale-95 transition-all"
                    >
                      {isPlaying ? (
                        <Pause className="h-7 w-7 fill-current" />
                      ) : (
                        <Play className="h-7 w-7 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.currentTarget.blur();
                        skipSeconds(10);
                        wakeControls();
                      }}
                      aria-label="Forward 10 seconds"
                      className="yt-control-element pointer-events-auto flex sm:hidden flex-col items-center justify-center h-11 w-11 rounded-full bg-black/65 hover:bg-black/85 text-white border border-white/20 active:scale-95 transition-all backdrop-blur-xs"
                    >
                      <RotateCw className="h-4 w-4" />
                      <span className="text-[9px] font-mono font-bold">+10s</span>
                    </button>
                  </div>
                )}

              {/* Subtle Top-Center HUD Feedback Pill */}
              {hudFeedback && (
                <div className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 z-40 rounded-full bg-black/85 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white backdrop-blur-md border border-white/15 shadow-2xl transition-all whitespace-nowrap">
                  {hudFeedback}
                </div>
              )}

              {/* Double-Click Ripple Waves (+10s / -10s) (ONLY for Custom Player mode) */}
              {playerSourceMode === 'direct' && doubleClickRipple && (
                <div
                  className={`pointer-events-none absolute top-0 bottom-0 z-30 w-2/5 flex items-center justify-center ${
                    doubleClickRipple === 'left'
                      ? 'left-0 rounded-r-full'
                      : 'right-0 rounded-l-full'
                  } bg-white/15 backdrop-blur-[1px] transition-opacity`}
                >
                  <div className="flex flex-col items-center justify-center text-white text-center">
                    {doubleClickRipple === 'left' ? (
                      <>
                        <RotateCcw className="h-8 w-8 animate-bounce mb-1" />
                        <span className="text-xs font-bold tracking-wider uppercase">
                          -10 seconds
                        </span>
                      </>
                    ) : (
                      <>
                        <RotateCw className="h-8 w-8 animate-bounce mb-1" />
                        <span className="text-xs font-bold tracking-wider uppercase">
                          +10 seconds
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Error Overlay */}
              {streamError && (
                <div className="yt-control-element absolute inset-0 z-30 flex flex-col items-center justify-center bg-neutral-950/95 p-6 text-center text-white">
                  <AlertCircle className="h-10 w-10 text-red-500 mb-2" />
                  <p className="text-sm font-semibold max-w-md">{streamError}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    {cleanPdfUrl ? (
                      <button
                        type="button"
                        onClick={() => onOpenPdfModal({ ...lecture, Title: displayLectureTitle })}
                        className="min-h-[42px] rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        Open Fullscreen PDF Notes
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={loadLectureStreams}
                          className="min-h-[42px] rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-700"
                        >
                          Retry Stream
                        </button>
                        {resolvedYoutubeId && playerSourceMode !== 'youtube-inapp' && (
                          <button
                            type="button"
                            onClick={() => handleSwitchPlayerSource('youtube-inapp')}
                            className="min-h-[42px] rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700"
                          >
                            Switch to Original YouTube Player
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setUseDirectStream((prev) => !prev)}
                          className="min-h-[42px] rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-2 text-xs font-bold text-neutral-200 hover:bg-neutral-700"
                        >
                          Switch Stream Route
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Settings Popover Floating Menu (ONLY for Custom Player mode) */}
              {playerSourceMode === 'direct' && settingsOpen && (
                <div
                  className="yt-control-element absolute bottom-14 right-3 z-40 w-72 rounded-xl bg-[#18181bf5] text-white backdrop-blur-lg border border-white/15 shadow-2xl p-1.5 text-xs select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  {settingsSubmenu === null && (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold text-neutral-400 uppercase tracking-wider border-b border-white/10">
                        <span>Player Settings</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsOpen(false);
                            startAutoHideTimer();
                          }}
                          className="text-neutral-400 hover:text-white p-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {hasDualSources && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSwitchPlayerSource(
                              playerSourceMode === 'direct' ? 'youtube-inapp' : 'direct'
                            )
                          }
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                        >
                          <span className="font-medium flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-blue-400" />
                            <span>Stream Server</span>
                          </span>
                          <span className="text-blue-300 font-mono text-[11px]">
                            Custom Player (Direct MP4)
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSettingsSubmenu('network')}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      >
                        <span className="font-medium flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-amber-400 fill-current" />
                          <span>Low-Net / Hotspot Mode</span>
                        </span>
                        <div className="flex items-center gap-1 text-amber-300 font-mono text-[11px]">
                          <span>
                            {networkMode === 'ultra-saver'
                              ? 'Ultra 240p'
                              : networkMode === 'hotspot-smart'
                              ? 'Smart Shield'
                              : 'HD Mode'}
                          </span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsSubmenu('speed')}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      >
                        <span className="font-medium">Playback speed</span>
                        <div className="flex items-center gap-1 text-neutral-300 font-mono">
                          <span>{playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSettingsSubmenu('quality')}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      >
                        <span className="font-medium">Quality</span>
                        <div className="flex items-center gap-1 text-neutral-300 font-mono">
                          <span>{effectiveQualityBadge}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsLooping((prev) => !prev)}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      >
                        <span className="font-medium">Loop video</span>
                        <div
                          className={`w-8 h-4 rounded-full transition-colors relative ${
                            isLooping ? 'bg-red-600' : 'bg-neutral-600'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                              isLooping ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsAutoplay((prev) => !prev)}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      >
                        <span className="font-medium">Autoplay next</span>
                        <div
                          className={`w-8 h-4 rounded-full transition-colors relative ${
                            isAutoplay ? 'bg-red-600' : 'bg-neutral-600'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                              isAutoplay ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        </div>
                      </button>
                    </div>
                  )}

                  {settingsSubmenu === 'network' && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setSettingsSubmenu(null)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-neutral-200 border-b border-white/10 hover:bg-white/10 rounded-t-lg"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Mobile Hotspot / Low-Net Shield</span>
                      </button>
                      <div className="py-1 space-y-1">
                        <button
                          type="button"
                          onClick={() => handleSelectNetworkMode('hotspot-smart')}
                          className="w-full flex items-start justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left"
                        >
                          <div>
                            <div className="font-bold text-amber-300">
                              ⚡ Smart Hotspot Shield (Recommended)
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              Starts in 360p, pre-buffers 5 mins ahead, auto-adjusts if net drops
                            </div>
                          </div>
                          {networkMode === 'hotspot-smart' && (
                            <Check className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectNetworkMode('ultra-saver')}
                          className="w-full flex items-start justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left"
                        >
                          <div>
                            <div className="font-bold text-emerald-300">
                              🛡️ Ultra Low-Net 240p Lock (Zero Stall)
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              Uses 70% less mobile data (~110MB/hr) + 10 min RAM buffer
                            </div>
                          </div>
                          {networkMode === 'ultra-saver' && (
                            <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectNetworkMode('high-hd')}
                          className="w-full flex items-start justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left"
                        >
                          <div>
                            <div className="font-bold text-white">High-Speed HD (720p/1080p)</div>
                            <div className="text-[10px] text-neutral-400">
                              Best for strong 5G or Wi-Fi connections
                            </div>
                          </div>
                          {networkMode === 'high-hd' && (
                            <Check className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {settingsSubmenu === 'speed' && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setSettingsSubmenu(null)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-neutral-200 border-b border-white/10 hover:bg-white/10 rounded-t-lg"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Playback speed</span>
                      </button>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {SPEED_OPTIONS.map((spd) => {
                          const isCur = playbackSpeed === spd;
                          return (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => {
                                changeSpeed(spd);
                                setSettingsSubmenu(null);
                                setSettingsOpen(false);
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 text-left font-mono"
                            >
                              <span>{spd === 1 ? 'Normal (1x)' : `${spd}x`}</span>
                              {isCur && <Check className="h-4 w-4 text-red-500" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {settingsSubmenu === 'quality' && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setSettingsSubmenu(null)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-neutral-200 border-b border-white/10 hover:bg-white/10 rounded-t-lg"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span>Quality & Stream Engine</span>
                      </button>
                      <div className="max-h-56 overflow-y-auto py-1">
                        <button
                          type="button"
                          onClick={() => handleQualitySelect('Auto', 'direct')}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 text-left"
                        >
                          <span>Auto (Smart Low-Net — {activeStreamHeight}p)</span>
                          {selectedQualityLabel === 'Auto' && (
                            <Check className="h-4 w-4 text-red-500" />
                          )}
                        </button>
                        {qualities.map((q) => {
                          const isCur = selectedQualityLabel === q.label;
                          return (
                            <button
                              key={q.label}
                              type="button"
                              onClick={() => handleQualitySelect(q.label, 'direct')}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 text-left font-mono"
                            >
                              <span>
                                {q.label}
                                {q.label === '240p'
                                  ? ' (Ultra Low Data)'
                                  : q.label === '360p'
                                  ? ' (Best for Hotspot)'
                                  : ''}
                              </span>
                              {isCur && <Check className="h-4 w-4 text-red-500" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Controls Bar (ONLY for Custom Player mode on normal videos) */}
              {playerSourceMode === 'direct' && (
                <div
                  className={`yt-control-element absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 sm:px-4 pt-6 pb-2.5 transition-opacity duration-200 ${
                    !shouldHideControlsAndCursor
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Red Scrubber Timeline */}
                  <div
                    ref={progressBarRef}
                    onMouseMove={handleScrubberMouseMove}
                    onMouseEnter={() => setIsHoveringScrubber(true)}
                    onMouseLeave={() => {
                      if (!isDraggingScrubber) setIsHoveringScrubber(false);
                    }}
                    onMouseDown={handleScrubberMouseDown}
                    onTouchStart={handleScrubberTouchStart}
                    role="slider"
                    aria-label="Seek timeline"
                    aria-valuemin={0}
                    aria-valuemax={Math.floor(effectiveDuration || 100)}
                    aria-valuenow={Math.floor(currentTime)}
                    tabIndex={0}
                    className="group/scrubber relative flex items-center h-5 w-full cursor-pointer mb-1.5 touch-none"
                  >
                    {(isHoveringScrubber || isDraggingScrubber) && effectiveDuration > 0 && (
                      <div
                        className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/90 px-2 py-0.5 text-[11px] font-mono font-bold text-white shadow-lg border border-white/15 whitespace-nowrap"
                        style={{ left: `${clampedTooltipLeft}%` }}
                      >
                        {formatPlayerTime(hoverTime)}
                      </div>
                    )}

                    <div
                      className={`relative w-full bg-white/25 rounded-full overflow-hidden transition-all duration-150 ${
                        isHoveringScrubber || isDraggingScrubber
                          ? 'h-1.5'
                          : 'h-1 group-hover/scrubber:h-1.5'
                      }`}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-400/55 transition-all duration-200"
                        style={{ width: `${bufferedPercent}%` }}
                      />
                      {(isHoveringScrubber || isDraggingScrubber) && (
                        <div
                          className="absolute inset-y-0 left-0 bg-white/30"
                          style={{ width: `${hoverPositionRatio * 100}%` }}
                        />
                      )}
                      <div
                        className="absolute inset-y-0 left-0 bg-[#ff0000]"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div
                      className={`absolute rounded-full bg-[#ff0000] border border-white/80 -translate-x-1/2 pointer-events-none transition-transform ${
                        isHoveringScrubber || isDraggingScrubber
                          ? 'h-4 w-4 scale-110'
                          : 'h-3 w-3 group-hover/scrubber:h-4 group-hover/scrubber:w-4'
                      }`}
                      style={{ left: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Controls Row */}
                  <div className="flex items-center justify-between text-white select-none">
                    {/* Left Side: Playback, Prev/Next, Volume & Time */}
                    <div className="flex items-center gap-1 sm:gap-2">
                      {prevLecture && (
                        <button
                          type="button"
                          onClick={() => onSelectLecture(prevLecture)}
                          title="Previous video (Shift+P)"
                          className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          togglePlay();
                          wakeControls();
                        }}
                        title={isPlaying ? 'Pause (k / Space)' : 'Play (k / Space)'}
                        className="p-1.5 rounded-lg hover:bg-white/15 text-white transition-colors"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 sm:h-6 sm:w-6 fill-current" />
                        ) : (
                          <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-current" />
                        )}
                      </button>

                      {nextLecture && (
                        <button
                          type="button"
                          onClick={() => onSelectLecture(nextLecture)}
                          title="Next video (Shift+N)"
                          className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      )}

                      {/* Volume Slider */}
                      <div className="group/vol flex items-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.currentTarget.blur();
                            toggleMute();
                            wakeControls();
                          }}
                          title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
                          className="p-1.5 rounded-lg hover:bg-white/15 text-white transition-colors"
                        >
                          {isMuted || volume === 0 ? (
                            <VolumeX className="h-5 w-5 text-red-500" />
                          ) : volume < 0.5 ? (
                            <Volume1 className="h-5 w-5" />
                          ) : (
                            <Volume2 className="h-5 w-5" />
                          )}
                        </button>

                        <div className="hidden sm:flex w-0 group-hover/vol:w-16 focus-within:w-16 overflow-hidden transition-all duration-200 items-center">
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={isMuted ? 0 : volume}
                            onChange={(e) => {
                              handleVolumeSliderChange(e);
                              wakeControls();
                            }}
                            aria-label="Volume slider"
                            className="w-14 accent-[#ff0000] cursor-pointer h-1"
                          />
                        </div>
                      </div>

                      {/* Time Readout */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowRemainingTime((prev) => !prev);
                          wakeControls();
                        }}
                        title="Click to toggle remaining time"
                        className="text-[11px] sm:text-xs font-mono font-medium tracking-tight text-neutral-200 hover:text-white px-1 py-0.5 rounded transition-colors whitespace-nowrap"
                      >
                        <span>{formatPlayerTime(currentTime)}</span>
                        <span className="mx-1 text-neutral-500">/</span>
                        <span>
                          {showRemainingTime
                            ? `-${formatPlayerTime(
                                Math.max(0, effectiveDuration - currentTime)
                              )}`
                            : formatPlayerTime(effectiveDuration)}
                        </span>
                      </button>
                    </div>

                    {/* Right Side: Low-Net Pill, Instant Screenshot (S), Speed Pill, Settings, Miniplayer, Theater, Fullscreen */}
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      <button
                        type="button"
                        onClick={cycleNetworkModeShortcut}
                        title="Switch Low-Net / Hotspot Mode (Press D)"
                        className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-bold transition-colors ${
                          networkMode === 'ultra-saver'
                            ? 'bg-emerald-600/90 text-white'
                            : networkMode === 'hotspot-smart'
                            ? 'bg-amber-500/25 text-amber-300 border border-amber-400/30'
                            : 'bg-white/10 text-neutral-200'
                        }`}
                      >
                        <Zap className="h-3 w-3 fill-current" />
                        <span>
                          {networkMode === 'ultra-saver'
                            ? '240p Saver'
                            : networkMode === 'hotspot-smart'
                            ? 'Low-Net ON'
                            : 'HD'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={captureInstantScreenshot}
                        title="Capture Screenshot (Press S)"
                        aria-label="Capture Screenshot"
                        className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                      >
                        <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(true);
                          setSettingsSubmenu('speed');
                        }}
                        title="Playback Speed (Shift + > / <)"
                        className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-mono font-bold text-white transition-colors"
                      >
                        {playbackSpeed}x
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsOpen((prev) => !prev);
                            setSettingsSubmenu(null);
                          }}
                          title="Settings (Quality, Speed & Low-Net Mode)"
                          className={`relative p-1.5 rounded-lg hover:bg-white/15 transition-transform duration-200 ${
                            settingsOpen
                              ? 'text-white rotate-45'
                              : 'text-neutral-300 hover:text-white'
                          }`}
                        >
                          <Settings className="h-5 w-5" />
                          {activeStreamHeight >= 720 ? (
                            <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold bg-red-600 px-1 rounded-xs text-white leading-tight">
                              HD
                            </span>
                          ) : null}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={toggleMiniplayer}
                        title="Miniplayer (i)"
                        className="hidden sm:inline-flex p-1.5 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                      >
                        <Tv className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        onClick={toggleTheaterMode}
                        title="Theater mode (t)"
                        className="hidden sm:inline-flex p-1.5 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                      >
                        <div
                          className={`border-2 rounded-xs w-4 h-3 ${
                            isTheaterMode
                              ? 'border-red-500 bg-red-500/20'
                              : 'border-neutral-300'
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        title="Full screen (f)"
                        className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-300 hover:text-white transition-colors"
                      >
                        {isTheaterFullscreen ? (
                          <Minimize className="h-5 w-5" />
                        ) : (
                          <Maximize className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* MOBILE HOTSPOT / LOW-NET ANTI-BUFFERING CONTROL BAR */}
          <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-emerald-50/70 p-3 sm:p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 shrink-0">
                <Wifi className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">
                    In-App Smart Player & Anti-Buffering Engine
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-800">
                    <ShieldCheck className="h-3 w-3" />
                    <span>
                      {bufferedAheadSeconds > 0
                        ? `Buffered Ahead: ${formattedBufferAhead}`
                        : '100% In-App Stream Active'}
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 truncate">
                  All classes play directly inside this portal with speed controls, timestamp notes, and side-by-side PDFs.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectNetworkMode('hotspot-smart')}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  networkMode === 'hotspot-smart'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                ⚡ Smart 360p
              </button>
              <button
                type="button"
                onClick={() => handleSelectNetworkMode('ultra-saver')}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  networkMode === 'ultra-saver'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                🛡️ Ultra 240p
              </button>
              <button
                type="button"
                onClick={() => handleSelectNetworkMode('high-hd')}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  networkMode === 'high-hd'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                HD 720p
              </button>
            </div>
          </div>

          {/* LARGE TOUCH-FRIENDLY ACTION BUTTONS BAR DIRECTLY BELOW VIDEO */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
            >
              <Maximize className="h-4 w-4 text-red-500 shrink-0" />
              <span>Full Screen (f)</span>
            </button>

            <button
              type="button"
              onClick={() => enterFullScreenMobileSafe(true)}
              className="flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
            >
              <Smartphone className="h-4 w-4 text-red-600 rotate-90 shrink-0" />
              <span>Landscape 90°</span>
            </button>

            <button
              type="button"
              onClick={captureInstantScreenshot}
              title="Press S key anytime to capture & download screenshot"
              className="flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
            >
              <Camera className="h-4 w-4 text-red-600 shrink-0" />
              <span>Screenshot (s)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDownloadSheet(true)}
              className="flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
            >
              {currentDownloadRecord?.status === 'downloading' ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin shrink-0" />
                  <span>Downloading {currentDownloadRecord.progressPercent}%</span>
                </>
              ) : currentDownloadRecord?.status === 'completed' ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  <span>Downloaded ({currentDownloadRecord.quality})</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 shrink-0" />
                  <span>Download Video</span>
                </>
              )}
            </button>

            {cleanPdfUrl ? (
              <button
                type="button"
                onClick={() => handleExtractPdfFromIframe()}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 rounded-2xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
              >
                <FileText className="h-4 w-4 text-red-600 shrink-0" />
                <span>Download PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  setSettingsSubmenu('quality');
                }}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shadow-xs"
              >
                <Settings className="h-4 w-4 text-red-600 shrink-0" />
                <span>Quality ({activeStreamHeight}p)</span>
              </button>
            )}
          </div>

          {/* Download Progress Banner */}
          {currentDownloadRecord && currentDownloadRecord.status === 'downloading' && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-red-900 mb-1.5">
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin text-red-600" />
                  <span>
                    Downloading Lecture Video ({currentDownloadRecord.quality}) —{' '}
                    {formatBytes(currentDownloadRecord.downloadedBytes)}
                  </span>
                </span>
                <span className="font-mono tabular-nums">
                  {currentDownloadRecord.progressPercent}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-red-200 overflow-hidden">
                <div
                  className="h-full bg-red-600 rounded-full transition-all"
                  style={{ width: `${currentDownloadRecord.progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Lecture Info & Speed/Quality Pills */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-red-600">Now Playing In-App</span>
                {lecture.date_and_time && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{lecture.date_and_time}</span>
                  </>
                )}
                {offlineBlobUrl && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 font-semibold">
                      Offline Copy Ready
                    </span>
                  </>
                )}
              </div>

              {offlineBlobUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayerSourceMode('direct');
                    if (videoRef.current) {
                      const savedNow = videoRef.current.currentTime || currentTime;
                      if (hlsRef.current) {
                        hlsRef.current.destroy();
                        hlsRef.current = null;
                      }
                      videoRef.current.src = offlineBlobUrl;
                      videoRef.current.currentTime = savedNow;
                      videoRef.current.playbackRate = playbackSpeed;
                      videoRef.current.play().catch(() => {});
                      showHud('Playing from Offline Storage');
                    }
                  }}
                  className="text-xs font-bold text-emerald-700 underline"
                >
                  Play Offline Copy
                </button>
              )}
            </div>

            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              {displayLectureTitle}
            </h1>

            {/* Quick Touch Resolution & Speed Pills */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 mr-1 shrink-0">
                  Stream:
                </span>
                {playerSourceMode === 'direct' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQualitySelect('Auto', 'direct')}
                      className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                        selectedQualityLabel === 'Auto'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Auto ({activeStreamHeight}p)
                    </button>
                    {qualities.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => handleQualitySelect(q.label, 'direct')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                          selectedQualityLabel === q.label
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {['Auto', '240p', '360p', '480p', '720p'].map((lbl) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => handleQualitySelect(lbl, 'youtube-inapp')}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                          selectedQualityLabel === lbl
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {lbl === 'Auto' ? `Auto (${activeStreamHeight}p)` : lbl}
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 mr-1 shrink-0">
                  Speed:
                </span>
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => changeSpeed(spd)}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                      playbackSpeed === spd
                        ? 'bg-neutral-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Keyboard Shortcuts Hint Bar */}
            <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-bold text-red-600">
                  S
                </kbd>{' '}
                Screenshot
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-bold text-amber-700">
                  D
                </kbd>{' '}
                Low-Net Mode
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">
                  Shift + &gt;
                </kbd>{' '}
                Speed Up
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">
                  Shift + &lt;
                </kbd>{' '}
                Speed Down
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">
                  k / Space
                </kbd>{' '}
                Play/Pause
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">
                  j / l
                </kbd>{' '}
                Seek 10s
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">
                  f
                </kbd>{' '}
                Fullscreen
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px]">
                  t
                </kbd>{' '}
                Theater
              </span>
            </div>
          </div>
        </div>

        {/* Right Zone / Bottom Zone in Theater Mode: Study Deck */}
        <div
          className={
            isTheaterMode
              ? 'w-full rounded-2xl border border-slate-200 bg-white p-4 flex flex-col min-h-[460px] shadow-xs'
              : 'lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col min-h-[500px] shadow-xs'
          }
        >
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 mb-4">
            <button
              type="button"
              onClick={() => setActiveDeckTab('playlist')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeDeckTab === 'playlist'
                  ? 'bg-white text-red-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListVideo className="h-4 w-4" />
              <span>Classes ({enrichedPlaylist.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDeckTab('pdf')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeDeckTab === 'pdf'
                  ? 'bg-white text-red-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>PDF Notes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDeckTab('notes')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] px-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeDeckTab === 'notes'
                  ? 'bg-white text-red-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bookmark className="h-4 w-4" />
              <span>Notes ({notes.length})</span>
            </button>
          </div>

          {/* Tab 1: Chapter Playlist */}
          {activeDeckTab === 'playlist' && (
            <div className="flex-1 flex flex-col">
              <div className="text-xs font-semibold text-slate-600 mb-3">
                All Lectures in Subject/Chapter ({enrichedPlaylist.length})
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[440px]">
                {enrichedPlaylist.map((item, idx) => {
                  const isCurrent = item.id === lecture.id;
                  return (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => !isCurrent && onSelectLecture(item)}
                      className={`w-full flex items-center justify-between min-h-[54px] p-3 rounded-xl border text-left text-xs sm:text-sm transition-colors ${
                        isCurrent
                          ? 'bg-red-50 border-red-300 text-red-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-mono tabular-nums shrink-0 ${
                            isCurrent
                              ? 'bg-red-600 text-white font-bold'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="line-clamp-2">{item.Title}</span>
                      </div>
                      {isCurrent ? (
                        <span className="text-xs text-red-600 font-bold shrink-0">
                          Playing
                        </span>
                      ) : (
                        <Play className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Embedded PDF Handout */}
          {activeDeckTab === 'pdf' && (
            <div className="flex-1 flex flex-col">
              {cleanPdfUrl ? (
                <div className="flex-1 flex flex-col h-[460px]">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPdfModal({ ...lecture, Title: displayLectureTitle })
                      }
                      className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors shadow-xs"
                    >
                      <Maximize className="h-3.5 w-3.5 text-red-600" />
                      <span>Fullscreen PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtractPdfFromIframe(cleanPdfUrl)}
                      className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download PDF</span>
                    </button>
                  </div>

                  {cleanPdfUrl2 && (
                    <div className="mb-2">
                      <button
                        type="button"
                        onClick={() => handleExtractPdfFromIframe(cleanPdfUrl2, 'Part2')}
                        className="text-xs font-bold text-red-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        <span>Download Part 2 PDF Handout</span>
                      </button>
                    </div>
                  )}

                  <div className="flex-1 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <iframe
                      ref={pdfIframeRef}
                      src={buildPdfViewerUrl(cleanPdfUrl)}
                      title="Lecture PDF Handout"
                      className="pdf-viewer-frame w-full h-full border-0"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <FileText className="h-10 w-10 text-slate-400 mb-2" />
                  <h2 className="text-sm font-semibold text-slate-800">No PDF Attached</h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    This lecture does not include a supplementary PDF handout.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Timed Notes */}
          {activeDeckTab === 'notes' && (
            <div className="flex-1 flex flex-col">
              <form
                onSubmit={handleAddNote}
                className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-mono tabular-nums text-red-600">
                  <span>Timestamp: {formatPlayerTime(currentTime)}</span>
                </div>
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Write an important point at this timestamp..."
                  rows={2}
                  className="w-full resize-none bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-600"
                />
                <button
                  type="submit"
                  disabled={!noteInput.trim()}
                  className="w-full min-h-[42px] rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40 transition-colors shadow-xs"
                >
                  Save Note
                </button>
              </form>

              <div className="flex-1 space-y-2 overflow-y-auto max-h-[320px]">
                {notes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    <Bookmark className="mx-auto h-6 w-6 text-slate-400 mb-2" />
                    <p className="text-xs font-medium text-slate-700">
                      No notes saved for this lecture yet.
                    </p>
                  </div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <button
                          type="button"
                          onClick={() => handleSeekTo(n.timeSeconds)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-mono font-bold tabular-nums text-red-700"
                        >
                          <Clock className="h-3 w-3" />
                          <span>{n.formattedTime}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(n.id)}
                          aria-label={`Delete note at ${n.formattedTime}`}
                          className="text-slate-400 hover:text-red-600 p-1.5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-800 whitespace-pre-wrap">{n.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Download Options Bottom Sheet */}
      {showDownloadSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Download Lecture Options"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowDownloadSheet(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Download Lecture & Notes
                </h2>
                <p className="text-xs text-slate-500 line-clamp-1">
                  {displayLectureTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadSheet(false)}
                aria-label="Close download options"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              {qualities.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-slate-600">
                    Select Video Resolution (Offline Playback = Zero Internet Needed):
                  </p>
                  {qualities.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => handleStartVideoDownload(q.label)}
                      className="w-full flex items-center justify-between min-h-[50px] px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-red-50 hover:border-red-300 text-sm font-bold text-slate-800 transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Download className="h-4 w-4 text-red-600" />
                        <span>
                          Download Video ({q.label})
                          {q.label === '240p' || q.label === '360p'
                            ? ' — Fast on Hotspot'
                            : ''}
                        </span>
                      </span>
                      <span className="text-xs font-mono text-red-600">Save Offline</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  This lecture streams via the In-App Adaptive Player. Use the PDF button below to save the class notes offline.
                </div>
              )}

              {cleanPdfUrl && (
                <button
                  type="button"
                  onClick={() => {
                    handleExtractPdfFromIframe();
                    setShowDownloadSheet(false);
                  }}
                  className="w-full flex items-center justify-between min-h-[50px] px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-sm font-bold text-emerald-900 transition-colors mt-2"
                >
                  <span className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <span>Download Class PDF Notes</span>
                  </span>
                  <span className="text-xs font-mono text-emerald-700">.PDF File</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowDownloadSheet(false);
                  onOpenDownloadsTab();
                }}
                className="w-full min-h-[46px] mt-2 rounded-xl bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
              >
                Open My Downloads Library ({downloadedItems.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
