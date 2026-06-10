// Thin client for the FastAPI backend. The base URL is injected at build time
// via NEXT_PUBLIC_API_URL (set in .env.local for dev, Vercel settings in prod).

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:7860";

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
};

// Fetch with exponential backoff retry
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  attempt = 1
): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    // Use existing abort signal if provided, otherwise use our timeout signal
    const signal =
      options?.signal ||
      (() => {
        // If both signals exist, create a composite that aborts on either
        if (options?.signal) {
          const composite = new AbortController();
          options.signal.addEventListener("abort", () => composite.abort());
          return composite.signal;
        }
        return controller.signal;
      })();

    const response = await fetch(url, {
      ...options,
      signal,
    });

    clearTimeout(timeoutId);

    // Don't retry 4xx errors (client errors) — they won't succeed on retry
    if (response.status >= 400 && response.status < 500) {
      return response;
    }

    // Retry on 5xx (server errors) and network timeouts
    if (!response.ok && attempt < RETRY_CONFIG.maxAttempts) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelayMs
      );
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }

    return response;
  } catch (error) {
    // Don't retry if the request was aborted (user cleanup)
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    // Retry on network errors (timeout, connection refused, etc)
    if (attempt < RETRY_CONFIG.maxAttempts) {
      const delay = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelayMs
      );
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw error;
  }
}

export type Demo = { id: string; name: string };

export type JobStatus = {
  status: "running" | "done" | "error";
  logs: string[];
  clips: string[];
  error: string | null;
};

export async function listDemos(): Promise<Demo[]> {
  const res = await fetchWithRetry(`${API_BASE}/demos`);
  if (!res.ok) throw new Error(`Failed to load demos (${res.status})`);
  return res.json();
}

// Submit a detection job from either a demo id or an uploaded file.
export async function submitJob(input: {
  demo?: string;
  file?: File;
}): Promise<string> {
  const form = new FormData();
  if (input.demo) form.append("demo", input.demo);
  if (input.file) form.append("file", input.file);

  const res = await fetchWithRetry(`${API_BASE}/detect`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Detection request failed (${res.status}) ${detail}`);
  }
  const data = await res.json();
  return data.job_id as string;
}

export async function getStatus(
  jobId: string,
  options?: RequestInit
): Promise<JobStatus> {
  const res = await fetchWithRetry(`${API_BASE}/status/${jobId}`, options);
  if (!res.ok) throw new Error(`Failed to fetch status (${res.status})`);
  return res.json();
}

export function clipUrl(jobId: string, filename: string): string {
  return `${API_BASE}/clips/${jobId}/${filename}`;
}
