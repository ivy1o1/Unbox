from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="Unbox API")

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


@app.post("/brain-dumps/audio")
async def upload_audio(file: UploadFile = File(...)):
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

    file_path = UPLOAD_DIR / file.filename

    file_path.write_bytes(contents)

    return {
        "message": "Audio uploaded successfully",
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents),
    }