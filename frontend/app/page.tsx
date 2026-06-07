"use client";

import { useEffect, useRef, useState } from "react";
import {
  listDemos,
  submitJob,
  getStatus,
  clipUrl,
  type Demo,
  type JobStatus,
} from "@/lib/api";

type Phase = "idle" | "submitting" | "running" | "done" | "error";

export default function Home() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [source, setSource] = useState<"demo" | "upload">("demo");
  const [selectedDemo, setSelectedDemo] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [warming, setWarming] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load demo list on mount.
  useEffect(() => {
    listDemos()
      .then((d) => {
        setDemos(d);
        if (d.length) setSelectedDemo(d[0].id);
      })
      .catch(() => setDemos([]));
  }, []);

  // Poll status whenever we have an active job.
  useEffect(() => {
    if (!jobId) return;
    const tick = async () => {
      try {
        const s = await getStatus(jobId);
        setWarming(false); // got a response → backend is awake
        setStatus(s);
        if (s.status === "done") {
          setPhase("done");
          stopPolling();
        } else if (s.status === "error") {
          setPhase("error");
          setError(s.error || "Detection failed");
          stopPolling();
        } else {
          setPhase("running");
        }
      } catch {
        // transient error while waking/processing — keep polling
      }
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleRun() {
    setError(null);
    setStatus(null);
    setJobId(null);
    setPhase("submitting");
    // Cold-start: a sleeping Space can take 30-90s to wake on the first call.
    setWarming(true);
    try {
      const id = await submitJob(
        source === "demo" ? { demo: selectedDemo } : { file: file! }
      );
      setJobId(id); // triggers polling effect
    } catch (e: any) {
      setWarming(false);
      setPhase("error");
      setError(e?.message || "Could not start detection");
    }
  }

  const busy = phase === "submitting" || phase === "running";
  const canRun =
    !busy && (source === "demo" ? !!selectedDemo : !!file);

  return (
    <main className="container">
      <h1>🎾 Tennis Backhand Detector</h1>
      <p className="subtitle">
        Upload a match video or pick a demo — the backend extracts each backhand
        as a downloadable clip using a pose-based ML pipeline.
      </p>

      {/* 1. Choose a video */}
      <section className="card">
        <h2>1 · Choose a video</h2>
        <div className="row" style={{ marginBottom: 16 }}>
          <label className={`choice ${source === "demo" ? "selected" : ""}`}>
            <input
              type="radio"
              name="source"
              checked={source === "demo"}
              onChange={() => setSource("demo")}
              disabled={busy}
            />
            Demo video
          </label>
          <label className={`choice ${source === "upload" ? "selected" : ""}`}>
            <input
              type="radio"
              name="source"
              checked={source === "upload"}
              onChange={() => setSource("upload")}
              disabled={busy}
            />
            Upload your own
          </label>
        </div>

        {source === "demo" ? (
          <div className="row">
            {demos.length === 0 && (
              <span className="muted">
                No demos available (is the backend running?).
              </span>
            )}
            {demos.map((d) => (
              <label
                key={d.id}
                className={`choice ${selectedDemo === d.id ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="demo"
                  checked={selectedDemo === d.id}
                  onChange={() => setSelectedDemo(d.id)}
                  disabled={busy}
                />
                {d.name}
              </label>
            ))}
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept="video/mp4"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <p className="muted" style={{ marginTop: 8 }}>
              MP4 only · max 60 MB · keep clips short for faster processing.
            </p>
          </div>
        )}
      </section>

      {/* 2. Run */}
      <section className="card">
        <h2>2 · Run detection</h2>
        <button className="btn" onClick={handleRun} disabled={!canRun}>
          {busy ? "Processing…" : "▶ Run Backhand Detection"}
        </button>

        {warming && (
          <div className="warming" style={{ marginTop: 16 }}>
            ⏳ Warming up the model… the first run can take up to a minute while
            the server wakes and loads the models.
          </div>
        )}

        {(phase === "running" || phase === "done") && status && (
          <div style={{ marginTop: 16 }}>
            <div className="status-line">
              {phase === "running" && <span className="spinner" />}
              <span>
                {phase === "running"
                  ? "Processing video…"
                  : `Done — ${status.clips.length} backhand${
                      status.clips.length === 1 ? "" : "s"
                    } detected`}
              </span>
            </div>
            {status.logs.length > 0 && (
              <div className="logs">{status.logs.slice(-15).join("\n")}</div>
            )}
          </div>
        )}

        {phase === "error" && (
          <div className="error" style={{ marginTop: 16 }}>
            ⚠ {error}
          </div>
        )}
      </section>

      {/* 3. Results */}
      {phase === "done" && status && status.clips.length > 0 && jobId && (
        <section className="card">
          <h2>✅ Detected backhands</h2>
          <div className="clip-grid">
            {status.clips.map((name, i) => (
              <div className="clip" key={name}>
                <h3>Backhand {i + 1}</h3>
                <video src={clipUrl(jobId, name)} controls preload="metadata" />
                <a
                  className="download"
                  href={clipUrl(jobId, name)}
                  download={name}
                >
                  ⬇ Download clip
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {phase === "done" && status && status.clips.length === 0 && (
        <section className="card">
          <p className="muted">No backhands detected in this video.</p>
        </section>
      )}
    </main>
  );
}
