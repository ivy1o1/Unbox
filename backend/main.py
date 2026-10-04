from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models.brain_dump import (
    BrainDump,
    BrainDumpCreate,
    BrainDumpTranscript,
)
from services.speech import transcribe_audio


app = FastAPI(title="Unbox API")


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


@app.get("/")
def root():
    return {"message": "Unbox API is running"}


@app.post("/brain-dumps")
def create_brain_dump(
    data: BrainDumpCreate,
    db: Session = Depends(get_db),
):
    brain_dump = BrainDump(
        title=data.title,
    )

    db.add(brain_dump)
    db.commit()
    db.refresh(brain_dump)

    return {
        "id": brain_dump.id,
        "title": brain_dump.title,
        "message": "Brain dump created successfully",
    }


@app.get("/brain-dumps/{brain_dump_id}")
def get_brain_dump(
    brain_dump_id: str,
    db: Session = Depends(get_db),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    return {
        "id": brain_dump.id,
        "title": brain_dump.title,
        "audio_path": brain_dump.audio_path,
        "transcript": brain_dump.transcript,
        "created_at": brain_dump.created_at,
    }


@app.post("/brain-dumps/{brain_dump_id}/audio")
async def upload_audio(
    brain_dump_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
        raise HTTPException(
            status_code=404,
            detail="Brain dump not found",
        )

    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {file.content_type}",
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
):
    brain_dump = db.get(BrainDump, brain_dump_id)

    if brain_dump is None:
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