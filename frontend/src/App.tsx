import { useEffect, useRef, useState } from "react";
import Dashboard from "./Dashboard";


const API_URL = "http://localhost:8000";

type RecordingState =
  | "idle"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribed"
  | "analyzed"
  | "error";

type ExtractionResult = {
  tasks: string[];
  events: string[];
  reminders: string[];
  people: string[];
  ideas: string[];
  uncertainties: string[];
};

function getUserId() {
  return localStorage.getItem("unbox_user_id");
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function App() {
  const [view, setView] = useState<"capture" | "dashboard">("capture");
  const [state, setState] = useState<RecordingState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [extraction, setExtraction] =
    useState<ExtractionResult | null>(null);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const brainDumpIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();

      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  useEffect(() => {
    if (state === "recording") {
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => current + 1);
      }, 1000);
    } else {
      stopTimer();
    }

    return () => stopTimer();
  }, [state]);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    try {
      setError("");
      setTranscript("");
      setExtraction(null);
      setSeconds(0);
      chunksRef.current = [];
      brainDumpIdRef.current = null;

      const userId = getUserId();

      if (!userId) {
        throw new Error(
          "No Unbox user found. Please complete onboarding first."
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Your browser does not support microphone recording."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;

      const mimeType = getSupportedMimeType();

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("Something went wrong while recording.");
        setState("error");
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const blobType = recorder.mimeType || "audio/webm";

        const audioBlob = new Blob(chunksRef.current, {
          type: blobType,
        });

        await uploadRecording(audioBlob);
      };

      recorder.start();

      setState("recording");
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to access your microphone."
      );

      setState("error");
    }
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "recording") {
      return;
    }

    recorder.pause();
    setState("paused");
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "paused") {
      return;
    }

    recorder.resume();
    setState("recording");
  }

  function finishRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    setState("uploading");
    recorder.stop();
  }

  function restartRecording() {
    const recorder = mediaRecorderRef.current;

    /*
     * Important:
     * prevent the old recording from uploading when restarting.
     */
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    mediaRecorderRef.current = null;
    streamRef.current = null;

    chunksRef.current = [];
    brainDumpIdRef.current = null;

    setTranscript("");
    setExtraction(null);
    setSeconds(0);
    setError("");
    setState("idle");

    /*
     * Start a completely fresh recording.
     */
    setTimeout(() => {
      startRecording();
    }, 0);
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;

    /*
     * Prevent cancelled recording from uploading.
     */
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }

    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    mediaRecorderRef.current = null;
    streamRef.current = null;

    chunksRef.current = [];
    brainDumpIdRef.current = null;

    setTranscript("");
    setExtraction(null);
    setSeconds(0);
    setError("");
    setState("idle");
    setView("dashboard");
  }

  async function uploadRecording(audioBlob: Blob) {
    try {
      setState("uploading");

      const userId = getUserId();

      if (!userId) {
        throw new Error("No Unbox user found.");
      }

      /*
       * 1. Create the brain dump.
       */
      const createResponse = await fetch(
        `${API_URL}/brain-dumps`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": userId,
          },
          body: JSON.stringify({
            title: "Voice brain dump",
          }),
        }
      );

      if (!createResponse.ok) {
        const message = await createResponse.text();
        console.error(message);

        throw new Error("Failed to create brain dump.");
      }

      const brainDump = await createResponse.json();

      /*
       * Keep the ID so Gemma can analyze this exact dump later.
       */
      brainDumpIdRef.current = brainDump.id;

      /*
       * 2. Upload the audio.
       */
      const formData = new FormData();

      const isMp4 = audioBlob.type.includes("mp4");

      const extension = isMp4 ? "mp4" : "webm";

      /*
       * Send a backend-friendly MIME type.
       */
      const uploadMimeType = isMp4
        ? "audio/mp4"
        : "audio/webm";

      const audioFile = new File(
        [audioBlob],
        `brain-dump.${extension}`,
        {
          type: uploadMimeType,
        }
      );

      formData.append("file", audioFile);

      const uploadResponse = await fetch(
        `${API_URL}/brain-dumps/${brainDump.id}/audio`,
        {
          method: "POST",
          headers: {
            "X-User-ID": userId,
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const message = await uploadResponse.text();
        console.error(message);

        throw new Error(
          "Audio upload or transcription failed."
        );
      }

      const result = await uploadResponse.json();

      /*
       * 3. Whisper transcript.
       */
      setTranscript(result.transcript || "");
      setState("transcribed");
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while processing the recording."
      );

      setState("error");
    }
  }

  async function analyzeWithGemma() {
    try {
      const userId = getUserId();

      if (!userId) {
        throw new Error("No Unbox user found.");
      }

      const brainDumpId = brainDumpIdRef.current;

      if (!brainDumpId) {
        throw new Error(
          "No brain dump found for this recording."
        );
      }

      if (!transcript.trim()) {
        throw new Error("Transcript is empty.");
      }

      setError("");
      setState("uploading");

      /*
       * 1. Save any edits the user made to the transcript.
       */
      const transcriptResponse = await fetch(
        `${API_URL}/brain-dumps/${brainDumpId}/transcript`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": userId,
          },
          body: JSON.stringify({
            transcript: transcript,
          }),
        }
      );

      if (!transcriptResponse.ok) {
        const message = await transcriptResponse.text();
        console.error(message);

        throw new Error("Failed to save transcript.");
      }

      /*
       * 2. Send transcript to Gemma.
       */
      const analyzeResponse = await fetch(
        `${API_URL}/brain-dumps/${brainDumpId}/analyze`,
        {
          method: "POST",
          headers: {
            "X-User-ID": userId,
          },
        }
      );

      if (!analyzeResponse.ok) {
        const message = await analyzeResponse.text();
        console.error(message);

        throw new Error("Gemma analysis failed.");
      }

      const result = await analyzeResponse.json();

      /*
       * 3. Store structured AI result.
       */
      setExtraction(result.extraction);
      setState("analyzed");
      setView("dashboard");
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to analyze transcript."
      );

      setState("error");
    }
  }

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (event.code === "Escape") {
        cancelRecording();
      }

      if (
        event.code === "Space" &&
        state === "recording" &&
        event.target === document.body
      ) {
        event.preventDefault();
        finishRecording();
      }
    }

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [state]);

  const isRecording =
  state === "recording" || state === "paused";

  const isActuallyRecording = state === "recording";

  if (view === "dashboard") {
    return (
      <Dashboard
          onNewBrainDump={() => {
            setView("capture");
            setState("idle");
            setTranscript("");
            setExtraction(null);
            setSeconds(0);
            setError("");
            brainDumpIdRef.current = null;
        }}
      />
    );
  }


  return (
    <div className="app">
      <div className="ambient-background" />

      <header className="header">
        <div className="logo">Unbox</div>

        <div className="status-pill">
          <span
            className={`status-dot ${
              state === "recording" ? "active" : ""
            }`}
          />

          <span>
            {state === "recording"
              ? "RECORDING IN PROGRESS"
              : state === "paused"
              ? "RECORDING PAUSED"
              : state === "uploading"
              ? "PROCESSING"
              : state === "transcribed"
              ? "TRANSCRIPT READY"
              : state === "analyzed"
              ? "AI ANALYSIS READY"
              : "READY"}
          </span>

          <span className="separator">•</span>

          <span className="timer">
            {formatTime(seconds)}
          </span>
        </div>

        <button
          className="cancel-button"
          onClick={cancelRecording}
        >
          Cancel
          <kbd>Esc</kbd>
        </button>
      </header>

      <main className="main">
        <section className="recording-area">

          <div className="mic-wrapper">
            <div
              className={`pulse pulse-outer ${
                !isActuallyRecording ? "paused" : ""
              }`}
            />

            <div
              className={`pulse pulse-inner ${
                !isActuallyRecording ? "paused" : ""
              }`}
            />

            <button
              className="mic-button"
              onClick={
                state === "idle" || state === "error"
                  ? startRecording
                  : undefined
              }
              disabled={
                state !== "idle" && state !== "error"
              }
            >
              <span className="mic-icon">●</span>
            </button>
          </div>

          <div className="state-text">
            {state === "idle" && (
              <>
                <strong>Ready when you are.</strong>
                <span>
                  Click the microphone and speak naturally.
                </span>
              </>
            )}

            {state === "recording" && (
              <>
                <strong>
                  Listening... speak naturally.
                </strong>
                <span>
                  Don't organize, just say it.
                </span>
              </>
            )}

            {state === "paused" && (
              <>
                <strong>Recording paused.</strong>
                <span>
                  Resume when you're ready.
                </span>
              </>
            )}

            {state === "uploading" && (
              <>
                <strong>
                  Processing your brain dump...
                </strong>
                <span>
                  Whisper is transcribing your recording.
                </span>
              </>
            )}

            {state === "transcribed" && (
              <>
                <strong>Transcript ready.</strong>
                <span>
                  Review it before sending it to Gemma.
                </span>
              </>
            )}

            {state === "error" && (
              <>
                <strong>Something went wrong.</strong>
                <span>{error}</span>
              </>
            )}
          </div>

          <div
            className={`waveform ${
              isActuallyRecording ? "recording" : "paused"
            }`}
          >
            {Array.from({ length: 28 }).map((_, index) => (
              <span
                key={index}
                style={{
                  height: `${8 + ((index * 17) % 24)}px`,
                }}
              />
            ))}
          </div>
        </section>

        <section className="transcript-card">
          <div className="transcript-header">
            <div>
              <span className="live-dot" />

              <strong>
                {state === "transcribed" ||
                state === "analyzed"
                  ? "Transcript"
                  : "Live Transcription"}
              </strong>
            </div>

            <span className="streaming">
              ✦{" "}
              {state === "uploading"
                ? "WHISPER"
                : state === "transcribed"
                ? "READY FOR REVIEW"
                : state === "analyzed"
                ? "GEMMA ANALYZED"
                : "WAITING"}
            </span>
          </div>

          <div className="transcript">
            {transcript ? (
              <textarea
                value={transcript}
                onChange={(event) =>
                  setTranscript(event.target.value)
                }
                placeholder="Your transcript will appear here..."
              />
            ) : (
              <span className="placeholder">
                {state === "recording"
                  ? "Your transcript will appear here after you finish recording..."
                  : "Start speaking to create your brain dump."}
              </span>
            )}
          </div>
        </section>

        {state === "analyzed" && extraction && (
          <section className="transcript-card extraction-card">
            <div className="transcript-header">
              <div>
                <span className="live-dot" />
                <strong>AI Extraction</strong>
              </div>

              <span className="streaming">
                ✦ GEMMA
              </span>
            </div>

            <div className="extraction-content">
              {Object.entries(extraction).map(
                ([category, items]) => (
                  <div
                    className="extraction-section"
                    key={category}
                  >
                    <strong>{category}</strong>

                    {items.length > 0 ? (
                      <ul>
                        {items.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="empty-extraction">
                        Nothing detected
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="controls">

          {isRecording && (
            <button
              className="secondary-button"
              onClick={
                state === "recording"
                  ? pauseRecording
                  : resumeRecording
              }
            >
              {state === "recording"
                ? "Ⅱ Pause"
                : "▶ Resume"}
            </button>
          )}

          {isRecording && (
            <button
              className="secondary-button"
              onClick={restartRecording}
            >
              ↻ Restart dump
            </button>
          )}

          {state === "idle" && (
            <button
              className="primary-button"
              onClick={startRecording}
            >
              ● Start recording
            </button>
          )}

          {isRecording && (
            <button
              className="primary-button"
              onClick={finishRecording}
            >
              ■ Done recording & Analyze
              <kbd>Space</kbd>
              <span>or</span>
              <kbd>↵</kbd>
            </button>
          )}

          {state === "transcribed" && (
            <button
              className="primary-button"
              onClick={analyzeWithGemma}
            >
              ✦ Analyze with Gemma
            </button>
          )}

          {state === "analyzed" && (
            <button
              className="primary-button"
              onClick={cancelRecording}
            >
              Done
            </button>
          )}

          {state === "uploading" && (
            <button
              className="primary-button"
              disabled
            >
              Processing...
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;