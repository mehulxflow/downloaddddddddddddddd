import os
import re
import uuid
import logging
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
from fastapi import FastAPI, BackgroundTasks, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import yt_dlp
import static_ffmpeg
static_ffmpeg.add_paths()
from pyrogram import Client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Credentials (defaulting to environment variables)
BOT_TOKEN = os.getenv("BOT_TOKEN", "9127297870:AAG0zn3vHfBbBXIL51Az7sOYR9AW4EuaiW4")
API_ID = int(os.getenv("API_ID", "34221469"))
API_HASH = os.getenv("API_HASH", "328b82637cec59c6386a2cbe2f6cb648")
CHAT_ID = int(os.getenv("CHAT_ID", "-1004425704095"))

TMP_DIR = Path("/tmp")
TMP_DIR.mkdir(parents=True, exist_ok=True)

# Pre-populated Forum Topic Cache mapping subject_name -> message_thread_id
TOPIC_CACHE: Dict[str, int] = {
    "CDP": 3,
}

# Strict 1-by-1 background concurrency lock for Render Free Tier (512MB RAM limit)
upload_semaphore = asyncio.Semaphore(1)

# In-memory single-job tracking (for /upload and /status/{job_id})
UPLOAD_PROGRESS: Dict[str, Dict[str, Any]] = {}

# In-memory batch queue state (for POST /upload-batch and GET /batch-status)
BATCH_STATE: Dict[str, Any] = {
    "is_running": False,
    "stop_requested": False,
    "batch_name": "",
    "total": 0,
    "completed": 0,
    "failed": 0,
    "current_index": 0,
    "current_job_id": None,
    "current_lecture": "",
    "current_subject": "",
    "current_thread_id": None,
    "status": "Idle",
    "progress": 0,
    "completed_ids": [],
    "failed_ids": {},
    "items": [],
}

app = FastAPI(title="24/7 Bulk Telegram Forum Auto-Uploader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LectureUploadItem(BaseModel):
    id: Optional[str] = Field(default=None, description="Optional unique lecture ID")
    url: str = Field(..., description="The .m3u8 or .mp4 lecture stream URL")
    batch_name: str = Field(..., description="Batch name for caption")
    subject_name: str = Field(default="General", description="Subject name for Forum Topic")
    lecture_name: str = Field(..., description="Lecture title for caption")


class BatchUploadEnvelope(BaseModel):
    courseId: Optional[str] = None
    batchName: Optional[str] = None
    subjectFilter: Optional[str] = None
    items: List[LectureUploadItem]


def download_hls_with_progress(job_id: str, url: str, output_path: str) -> str:
    """Downloads .m3u8 or .mp4 to local .mp4 using yt-dlp in highest available quality."""

    def progress_hook(d: Dict[str, Any]):
        if d.get("status") == "downloading":
            pct_num = 0.0
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            if total and total > 0:
                pct_num = (downloaded / total) * 100.0
            elif d.get("fragment_index") and d.get("fragment_count"):
                pct_num = (d["fragment_index"] / d["fragment_count"]) * 100.0
            else:
                pct_str = d.get("_percent_str", "0%")
                clean_str = re.sub(r"\x1b\[[0-9;]*m", "", str(pct_str)).replace("%", "").strip()
                try:
                    pct_num = float(clean_str)
                except ValueError:
                    pct_num = float(UPLOAD_PROGRESS.get(job_id, {}).get("progress", 0))

            clamped = max(1, min(99, int(pct_num)))
            if job_id in UPLOAD_PROGRESS:
                UPLOAD_PROGRESS[job_id]["status"] = "Downloading"
                UPLOAD_PROGRESS[job_id]["progress"] = clamped
            if BATCH_STATE.get("current_job_id") == job_id:
                BATCH_STATE["status"] = "Downloading"
                BATCH_STATE["progress"] = clamped

        elif d.get("status") == "finished":
            if job_id in UPLOAD_PROGRESS:
                UPLOAD_PROGRESS[job_id]["status"] = "Downloading"
                UPLOAD_PROGRESS[job_id]["progress"] = 100
            if BATCH_STATE.get("current_job_id") == job_id:
                BATCH_STATE["status"] = "Downloading"
                BATCH_STATE["progress"] = 100

    ydl_opts = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": output_path,
        "merge_output_format": "mp4",
        "concurrent_fragment_downloads": 4,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "retries": 5,
        "fragment_retries": 5,
        "progress_hooks": [progress_hook],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    if not os.path.exists(output_path):
        raise FileNotFoundError(f"Output video file was not created at {output_path}")

    return output_path


async def resolve_or_create_forum_topic(tg_client: Client, subject_name: str) -> Optional[int]:
    """Checks TOPIC_CACHE for subject_name; if missing, creates a new Forum Topic in CHAT_ID."""
    clean_subject = (subject_name or "General").strip() or "General"

    if clean_subject in TOPIC_CACHE:
        return TOPIC_CACHE[clean_subject]

    # Case-insensitive lookup in TOPIC_CACHE before creating a duplicate topic
    for existing_title, tid in TOPIC_CACHE.items():
        if existing_title.lower() == clean_subject.lower():
            TOPIC_CACHE[clean_subject] = tid
            return tid

    try:
        logger.info(f"Creating new Forum Topic '{clean_subject}' in chat {CHAT_ID}...")
        topic = await tg_client.create_forum_topic(
            chat_id=CHAT_ID,
            title=clean_subject[:128],
        )
        thread_id = int(topic.id)
        TOPIC_CACHE[clean_subject] = thread_id
        logger.info(f"Created Forum Topic '{clean_subject}' with message_thread_id={thread_id}")
        return thread_id
    except Exception as topic_err:
        logger.warning(
            f"Could not create Forum Topic '{clean_subject}' in {CHAT_ID} "
            f"(ensure Bot has 'Manage Topics' admin permission enabled): {topic_err}"
        )
        if "cdp" in clean_subject.lower() and "CDP" in TOPIC_CACHE:
            return TOPIC_CACHE["CDP"]
        return None


async def process_single_lecture(
    job_id: str,
    url: str,
    batch_name: str,
    subject_name: str,
    lecture_name: str,
) -> bool:
    """Downloads 1 lecture to /tmp, resolves/creates its Forum Topic, uploads to Telegram, and deletes local file."""
    temp_video_path = str(TMP_DIR / f"lecture_{job_id}.mp4")
    session_name = str(TMP_DIR / f"pyro_session_{job_id}")
    loop = asyncio.get_running_loop()
    clean_subject = (subject_name or "General").strip() or "General"

    async with upload_semaphore:
        try:
            UPLOAD_PROGRESS[job_id] = {
                "job_id": job_id,
                "status": "Downloading",
                "progress": 1,
                "batch_name": batch_name,
                "subject_name": clean_subject,
                "lecture_name": lecture_name,
                "thread_id": TOPIC_CACHE.get(clean_subject),
                "error": None,
            }
            if BATCH_STATE.get("current_job_id") == job_id:
                BATCH_STATE["status"] = "Downloading"
                BATCH_STATE["progress"] = 1
                BATCH_STATE["current_subject"] = clean_subject
                BATCH_STATE["current_lecture"] = lecture_name

            logger.info(
                f"[{job_id}] Downloading '{lecture_name}' (Subject: '{clean_subject}') from {url}"
            )

            # 1. Download highest quality video to /tmp using yt-dlp + static_ffmpeg
            await asyncio.to_thread(download_hls_with_progress, job_id, url, temp_video_path)

            # 2. Connect Pyrogram, resolve/create Forum Topic, and upload video
            UPLOAD_PROGRESS[job_id]["status"] = "Uploading"
            UPLOAD_PROGRESS[job_id]["progress"] = 1
            if BATCH_STATE.get("current_job_id") == job_id:
                BATCH_STATE["status"] = "Uploading"
                BATCH_STATE["progress"] = 1

            def pyrogram_progress(current: int, total: int):
                if total > 0:
                    pct = max(1, min(99, int((current / total) * 100)))
                    loop.call_soon_threadsafe(
                        UPLOAD_PROGRESS[job_id].update,
                        {"status": "Uploading", "progress": pct},
                    )
                    if BATCH_STATE.get("current_job_id") == job_id:
                        loop.call_soon_threadsafe(
                            BATCH_STATE.update,
                            {"status": "Uploading", "progress": pct},
                        )

            async with Client(
                name=session_name,
                api_id=API_ID,
                api_hash=API_HASH,
                bot_token=BOT_TOKEN,
                in_memory=True,
                max_concurrent_transmissions=4,
            ) as tg_client:
                thread_id = await resolve_or_create_forum_topic(tg_client, clean_subject)
                UPLOAD_PROGRESS[job_id]["thread_id"] = thread_id
                if BATCH_STATE.get("current_job_id") == job_id:
                    BATCH_STATE["current_thread_id"] = thread_id

                caption = (
                    f"📁 **Batch:** {batch_name}\n"
                    f"📚 **Subject:** {clean_subject}\n"
                    f"🎬 **Lecture:** {lecture_name}"
                )

                send_kwargs: Dict[str, Any] = {
                    "chat_id": CHAT_ID,
                    "video": temp_video_path,
                    "caption": caption,
                    "supports_streaming": True,
                    "progress": pyrogram_progress,
                }
                if thread_id is not None:
                    send_kwargs["message_thread_id"] = thread_id

                await tg_client.send_video(**send_kwargs)

            UPLOAD_PROGRESS[job_id]["status"] = "Completed"
            UPLOAD_PROGRESS[job_id]["progress"] = 100
            if BATCH_STATE.get("current_job_id") == job_id:
                BATCH_STATE["status"] = "Completed"
                BATCH_STATE["progress"] = 100

            logger.info(
                f"[{job_id}] Uploaded '{lecture_name}' to Topic '{clean_subject}' (thread_id={thread_id})"
            )
            return True

        except Exception as exc:
            logger.error(f"[{job_id}] Failed job for '{lecture_name}': {exc}", exc_info=True)
            if job_id in UPLOAD_PROGRESS:
                UPLOAD_PROGRESS[job_id]["status"] = "Failed"
                UPLOAD_PROGRESS[job_id]["error"] = str(exc)
            if BATCH_STATE.get("current_job_id") == job_id:
                BATCH_STATE["status"] = "Failed"
            return False

        finally:
            # Immediately delete local temporary files to keep Render 512MB environment clean
            for fpath in (temp_video_path, f"{temp_video_path}.part", f"{temp_video_path}.ytdl"):
                try:
                    if os.path.exists(fpath):
                        os.remove(fpath)
                        logger.info(f"[{job_id}] Deleted local temp file: {fpath}")
                except OSError as cleanup_err:
                    logger.warning(f"[{job_id}] Could not delete {fpath}: {cleanup_err}")


async def process_batch_queue_worker(items: List[Dict[str, Any]]):
    """Processes the queued batch strictly ONE BY ONE in the background."""
    try:
        for idx, item in enumerate(items):
            if BATCH_STATE.get("stop_requested"):
                BATCH_STATE["is_running"] = False
                BATCH_STATE["status"] = "Stopped"
                logger.info("Batch upload worker stopped by admin request.")
                return

            item_id = str(item.get("id") or f"lec_{idx + 1}")
            url = str(item.get("url") or "").strip()
            batch_name = str(item.get("batch_name") or BATCH_STATE.get("batch_name") or "Batch").strip()
            subject_name = str(item.get("subject_name") or "General").strip()
            lecture_name = str(item.get("lecture_name") or f"Lecture {idx + 1}").strip()

            job_id = uuid.uuid4().hex[:12]
            BATCH_STATE["current_index"] = idx
            BATCH_STATE["current_job_id"] = job_id
            BATCH_STATE["current_lecture"] = lecture_name
            BATCH_STATE["current_subject"] = subject_name
            BATCH_STATE["current_thread_id"] = TOPIC_CACHE.get(subject_name)
            BATCH_STATE["status"] = "Downloading"
            BATCH_STATE["progress"] = 1
            BATCH_STATE["items"][idx]["status"] = "Downloading"

            ok = await process_single_lecture(
                job_id=job_id,
                url=url,
                batch_name=batch_name,
                subject_name=subject_name,
                lecture_name=lecture_name,
            )

            if ok:
                BATCH_STATE["completed"] += 1
                BATCH_STATE["completed_ids"].append(item_id)
                BATCH_STATE["items"][idx]["status"] = "Completed"
                BATCH_STATE["failed_ids"].pop(item_id, None)
            else:
                BATCH_STATE["failed"] += 1
                err_msg = UPLOAD_PROGRESS.get(job_id, {}).get("error") or "Upload failed"
                BATCH_STATE["failed_ids"][item_id] = err_msg
                BATCH_STATE["items"][idx]["status"] = "Failed"
                BATCH_STATE["items"][idx]["error"] = err_msg

        BATCH_STATE["is_running"] = False
        BATCH_STATE["status"] = "Completed"
        BATCH_STATE["progress"] = 100
        logger.info("Batch queue finished processing all lectures.")

    except Exception as exc:
        logger.error(f"Batch worker fatal error: {exc}", exc_info=True)
        BATCH_STATE["is_running"] = False
        BATCH_STATE["status"] = "Failed"


@app.get("/ping")
async def ping():
    """Keep-alive endpoint for UptimeRobot (every 5 minutes)."""
    return {
        "status": "alive",
        "is_running": BATCH_STATE["is_running"],
        "topic_cache": TOPIC_CACHE,
        "active_jobs": len(UPLOAD_PROGRESS),
    }


@app.post("/upload-batch", status_code=200)
async def upload_batch(
    background_tasks: BackgroundTasks,
    payload: Union[List[LectureUploadItem], BatchUploadEnvelope] = Body(...),
):
    """Enqueues an entire batch of lectures to be downloaded and uploaded ONE BY ONE into their Subject Forum Topics."""
    if BATCH_STATE["is_running"]:
        return {
            "status": "Batch upload already running in background",
            "batch_status": BATCH_STATE,
        }

    raw_items = payload if isinstance(payload, list) else payload.items
    if not raw_items:
        raise HTTPException(status_code=400, detail="Batch lecture list cannot be empty.")

    normalized_items: List[Dict[str, Any]] = []
    for idx, entry in enumerate(raw_items):
        clean_url = entry.url.strip()
        if not clean_url:
            continue
        normalized_items.append(
            {
                "id": entry.id or f"lec_{idx + 1}",
                "url": clean_url,
                "batch_name": entry.batch_name.strip(),
                "subject_name": (entry.subject_name or "General").strip() or "General",
                "lecture_name": entry.lecture_name.strip(),
                "status": "Queued",
                "error": None,
            }
        )

    if not normalized_items:
        raise HTTPException(status_code=400, detail="No valid lecture URLs found in payload.")

    first_batch_name = normalized_items[0]["batch_name"]
    BATCH_STATE.update(
        {
            "is_running": True,
            "stop_requested": False,
            "batch_name": first_batch_name,
            "total": len(normalized_items),
            "completed": 0,
            "failed": 0,
            "current_index": 0,
            "current_job_id": None,
            "current_lecture": normalized_items[0]["lecture_name"],
            "current_subject": normalized_items[0]["subject_name"],
            "current_thread_id": TOPIC_CACHE.get(normalized_items[0]["subject_name"]),
            "status": "Downloading",
            "progress": 1,
            "completed_ids": [],
            "failed_ids": {},
            "items": normalized_items,
        }
    )

    background_tasks.add_task(process_batch_queue_worker, normalized_items)

    return {
        "status": "Batch upload started in background",
        "total_queued": len(normalized_items),
        "topic_cache": TOPIC_CACHE,
        "batch_status": BATCH_STATE,
    }


@app.get("/batch-status", status_code=200)
async def get_batch_status():
    """Returns real-time progress for the active batch upload and Forum Topic cache."""
    return {
        **BATCH_STATE,
        "topic_cache": TOPIC_CACHE,
        # CamelCase aliases for seamless frontend compatibility
        "isRunning": BATCH_STATE["is_running"],
        "batchName": BATCH_STATE["batch_name"],
        "currentIndex": BATCH_STATE["current_index"],
        "currentJobId": BATCH_STATE["current_job_id"],
        "currentLecture": BATCH_STATE["current_lecture"],
        "currentSubject": BATCH_STATE["current_subject"],
        "currentThreadId": BATCH_STATE["current_thread_id"],
        "currentStatus": BATCH_STATE["status"],
        "currentProgress": BATCH_STATE["progress"],
        "completedIds": BATCH_STATE["completed_ids"],
        "failedIds": BATCH_STATE["failed_ids"],
        "topicCache": TOPIC_CACHE,
    }


@app.post("/batch-stop", status_code=200)
async def stop_batch_upload():
    """Stops the background batch queue after the current file finishes."""
    BATCH_STATE["stop_requested"] = True
    BATCH_STATE["is_running"] = False
    BATCH_STATE["status"] = "Stopped"
    return {"status": "Batch stop requested", "batch_status": BATCH_STATE}


@app.post("/upload", status_code=200)
async def start_single_upload(payload: LectureUploadItem, background_tasks: BackgroundTasks):
    """Starts a single lecture download + Forum Topic upload in the background."""
    if not payload.url or not payload.url.strip().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Valid HTTP/HTTPS video URL is required.")

    job_id = uuid.uuid4().hex[:12]
    clean_subject = (payload.subject_name or "General").strip() or "General"
    UPLOAD_PROGRESS[job_id] = {
        "job_id": job_id,
        "status": "Downloading",
        "progress": 0,
        "batch_name": payload.batch_name.strip(),
        "subject_name": clean_subject,
        "lecture_name": payload.lecture_name.strip(),
        "thread_id": TOPIC_CACHE.get(clean_subject),
        "error": None,
    }

    background_tasks.add_task(
        process_single_lecture,
        job_id=job_id,
        url=payload.url.strip(),
        batch_name=payload.batch_name.strip(),
        subject_name=clean_subject,
        lecture_name=payload.lecture_name.strip(),
    )

    return {
        "status": "Upload started in background",
        "job_id": job_id,
        "subject_name": clean_subject,
        "thread_id": TOPIC_CACHE.get(clean_subject),
    }


@app.get("/status/{job_id}", status_code=200)
async def get_upload_status(job_id: str):
    """Returns real-time status and percentage (0-100) for a single job_id."""
    job = UPLOAD_PROGRESS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job ID not found")
    return job


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 10000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, workers=1)
