// Thin client for the FastAPI backend. The base URL is injected at build time
// via NEXT_PUBLIC_API_URL (set in .env.local for dev, Vercel settings in prod).

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:7860";

export type Demo = { id: string; name: string };

export type JobStatus = {
  status: "running" | "done" | "error";
  logs: string[];
  clips: string[];
  error: string | null;
};

export async function listDemos(): Promise<Demo[]> {
  const res = await fetch(`${API_BASE}/demos`);
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

  const res = await fetch(`${API_BASE}/detect`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Detection request failed (${res.status}) ${detail}`);
  }
  const data = await res.json();
  return data.job_id as string;
}

export async function getStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/status/${jobId}`);
  if (!res.ok) throw new Error(`Failed to fetch status (${res.status})`);
  return res.json();
}

export function clipUrl(jobId: string, filename: string): string {
  return `${API_BASE}/clips/${jobId}/${filename}`;
}
