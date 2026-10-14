const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const token = localStorage.getItem("applyflow-token");
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    });
  } catch {
    throw new Error("Cannot connect to ApplyFlow API. Start it with: npm run server:dev");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 502 || response.status === 504) throw new Error("ApplyFlow API is not running. Start both services with: npm run dev:full");
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export const api = {
  url: API_URL,
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  googleLogin: (credential) => request("/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  applications: (query = "") => request(`/applications${query}`),
  createApplication: (body) => request("/applications", { method: "POST", body: JSON.stringify(body) }),
  updateApplication: (id, body) => request(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteApplication: (id) => request(`/applications/${id}`, { method: "DELETE" }),
  reminders: () => request("/reminders"),
  createReminder: (body) => request("/reminders", { method: "POST", body: JSON.stringify(body) }),
  completeReminder: (id, completed) => request(`/reminders/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }),
  analytics: () => request("/analytics"),
  resumes: () => request("/resumes"),
  createResume: (body) => request("/resumes", { method: "POST", body: JSON.stringify(body) }),
  matchResume: (body) => request("/match", { method: "POST", body: JSON.stringify(body) }),
};
