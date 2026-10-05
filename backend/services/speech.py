import os

import whisper

FFMPEG_BIN = r"C:\Users\swast\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin"

os.environ["PATH"] = FFMPEG_BIN + os.pathsep + os.environ.get("PATH", "")

model = whisper.load_model("base")


def transcribe_audio(file_path: str) -> str:
    result = model.transcribe(file_path)
    return result["text"].strip()