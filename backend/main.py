from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import Base, engine, get_db

from models.user import User, UserCreate

from models.brain_dump import (
    BrainDump,
    BrainDumpCreate,
    BrainDumpTranscript,
)

from services.auth import get_current_user
from services.speech import transcribe_audio
from services.gemma import extract_brain_dump
from services.normalize import normalize_extraction
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI(title="Unbox API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create database tables
Base.metadata.create_all(bind=engine)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
}


MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


# ---------------------------------------------------------
# ROOT
# ---------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Unbox API is running"}


# ---------------------------------------------------------
# USERS
# ---------------------------------------------------------

@app.post("/users")
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
):
    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty",
        )

    if len(name) > 100:
        raise HTTPException(
            status_code=400,
            detail="Name cannot exceed 100 characters",
        )

    user = User(name=name)

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "name": user.name,
        "created_at": user.created_at,
    }


@app.get("/users/me")
def get_me(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "created_at": current_user.created_at,
    }


# ---------------------------------------------------------
# BRAIN DUMPS
# ---------------------------------------------------------
@app.get("/brain-dumps")
def list_brain_dumps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dumps = (
        db.query(BrainDump)
        .filter(BrainDump.user_id == current_user.id)
        .order_by(BrainDump.created_at.desc())
        .all()
    )

    return [
        {
            "id": brain_dump.id,
            "title": brain_dump.title,
            "transcript": brain_dump.transcript,
            "extraction": brain_dump.extraction,
            "created_at": brain_dump.created_at,
        }
        for brain_dump in brain_dumps
    ]

@app.post("/brain-dumps")
def create_brain_dump(
    data: BrainDumpCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dump = BrainDump(
        user_id=current_user.id,
        title=data.title,
    )

    db.add(brain_dump)
    db.commit()
    db.refresh(brain_dump)

    return {
        "id": brain_dump.id,
        "user_id": brain_dump.user_id,
        "title": brain_dump.title,
        "message": "Brain dump created successfully",
    }


@app.get("/brain-dumps/{brain_dump_id}")
def get_brain_dump(
    brain_dump_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    if brain_dump.user_id != current_user.id:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    return {
        "id": brain_dump.id,
        "user_id": brain_dump.user_id,
        "title": brain_dump.title,
        "audio_path": brain_dump.audio_path,
        "transcript": brain_dump.transcript,
        "created_at": brain_dump.created_at,
        "extraction": brain_dump.extraction,
    }


@app.post("/brain-dumps/{brain_dump_id}/audio")
async def upload_audio(
    brain_dump_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    if brain_dump.user_id != current_user.id:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    content_type = file.content_type or ""

    if not any(
        content_type.startswith(allowed_type)
        for allowed_type in ALLOWED_AUDIO_TYPES
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {content_type}",
        )

    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Audio file is too large. Maximum size is 25 MB.",
        )

    filename = file.filename or "recording"

    file_path = UPLOAD_DIR / f"{brain_dump_id}_{filename}"

    file_path.write_bytes(contents)

    transcript = transcribe_audio(str(file_path))

    brain_dump.audio_path = str(file_path)
    brain_dump.transcript = transcript

    db.commit()
    db.refresh(brain_dump)

    return {
        "message": "Audio uploaded and transcribed successfully",
        "brain_dump_id": brain_dump.id,
        "filename": filename,
        "transcript": transcript,
    }


@app.put("/brain-dumps/{brain_dump_id}/transcript")
def update_transcript(
    brain_dump_id: str,
    data: BrainDumpTranscript,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    if brain_dump.user_id != current_user.id:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    brain_dump.transcript = data.transcript

    db.commit()
    db.refresh(brain_dump)

    return {
        "message": "Transcript updated successfully",
        "brain_dump_id": brain_dump.id,
        "transcript": brain_dump.transcript,
    }


@app.post("/brain-dumps/{brain_dump_id}/analyze")
def analyze_brain_dump(
    brain_dump_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    if brain_dump.user_id != current_user.id:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    if not brain_dump.transcript:
        raise HTTPException(
            status_code=400,
            detail="Brain dump does not have a transcript",
        )

    raw_result = extract_brain_dump(brain_dump.transcript)

    result = normalize_extraction(raw_result)

    brain_dump.extraction = result

    db.commit()
    db.refresh(brain_dump)

    return {
        "brain_dump_id": brain_dump.id,
        "extraction": result,
    }

@app.delete("/brain-dumps/{brain_dump_id}/reminders/{reminder_index}")
def delete_reminder(
    brain_dump_id: str,
    reminder_index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None or brain_dump.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Brain dump not found")

    if not brain_dump.extraction:
        raise HTTPException(status_code=404, detail="No extraction found")

    reminders = brain_dump.extraction.get("reminders", [])

    if reminder_index < 0 or reminder_index >= len(reminders):
        raise HTTPException(status_code=404, detail="Reminder not found")

    reminders.pop(reminder_index)

    extraction = dict(brain_dump.extraction)
    extraction["reminders"] = reminders
    brain_dump.extraction = extraction

    db.commit()
    db.refresh(brain_dump)

    return {
        "message": "Reminder deleted successfully",
        "brain_dump_id": brain_dump.id,
        "reminders": reminders,
    }