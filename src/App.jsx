import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { api } from "./api";

const starterApplications = [
  { id: 1, company: "Google", role: "Frontend Developer Intern", location: "Bengaluru", date: "2026-10-12", status: "Interview", color: "#4285f4" },
  { id: 2, company: "Microsoft", role: "Software Engineer Intern", location: "Hyderabad", date: "2026-10-10", status: "Applied", color: "#00a4ef" },
  { id: 3, company: "Amazon", role: "Full Stack Intern", location: "Remote", date: "2026-10-08", status: "Assessment", color: "#ff9900" },
  { id: 4, company: "Atlassian", role: "Frontend Intern", location: "Remote", date: "2026-10-05", status: "Rejected", color: "#1868db" },
  { id: 5, company: "Razorpay", role: "Full Stack Developer Intern", location: "Bengaluru", date: "2026-10-03", status: "Offer", color: "#3395ff" },
];

const statuses = ["Applied", "Assessment", "Interview", "Offer", "Rejected"];
const navItems = [
  ["dashboard", "Dashboard", "⌂"],
  ["applications", "Applications", "▤"],
  ["interviews", "Interviews", "◷"],
  ["reminders", "Reminders", "♧"],
  ["analytics", "Analytics", "◒"],
  ["resumes", "Resume match", "✦"],
];

function Icon({ name }) {
  const paths = {
    search: "M11 19a8 8 0 1 1 5.657-2.343L21 21",
    plus: "M12 5v14M5 12h14",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3",
    close: "M6 6l12 12M18 6 6 18",
    arrow: "M5 12h14M13 6l6 6-6 6",
  };
  return paths[name] ? <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg> : null;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function App() {
  const [user, setUser] = useState(() => {
    try { return localStorage.getItem("applyflow-token") ? JSON.parse(localStorage.getItem("applyflow-user")) : null; } catch { return null; }
  });
  const [applications, setApplications] = useState(() => {
    try { return JSON.parse(localStorage.getItem("applyflow-applications")) || starterApplications; } catch { return starterApplications; }
  });
  const [activeView, setActiveView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [reminders, setReminders] = useState(() => JSON.parse(localStorage.getItem("applyflow-reminders") || "[]"));
  const [analytics, setAnalytics] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (user) return undefined;
    let attempts = 0;
    const renderGoogleButton = () => {
      if (!window.google) {
        attempts += 1;
        if (attempts < 20) window.setTimeout(renderGoogleButton, 250);
        return;
      }
      window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || "472659323160-mtp7hf2f9mvn3t55h2c4uplri53qsjua.apps.googleusercontent.com",
      callback: async (response) => {
        try {
          const result = await api.googleLogin(response.credential);
          localStorage.setItem("applyflow-token", result.token);
          localStorage.setItem("applyflow-user", JSON.stringify(result.user));
          setUser(result.user);
          setAuthError("");
        } catch (error) { setAuthError(error.message); }
      },
      });
      const target = document.getElementById("google-signin");
      if (target) window.google.accounts.id.renderButton(target, { theme: "outline", size: "large", width: 330, text: "continue_with" });
    };
    renderGoogleButton();
    return () => { attempts = 20; };
  }, [user]);

  useEffect(() => { localStorage.setItem("applyflow-applications", JSON.stringify(applications)); }, [applications]);
  useEffect(() => { localStorage.setItem("applyflow-reminders", JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => {
    if (!localStorage.getItem("applyflow-token")) return undefined;
    Promise.all([api.applications().then((result) => setApplications(result.items)), api.reminders().then(setReminders), api.analytics().then(setAnalytics)]).catch(() => setToast("API unavailable — using local workspace"));
    return undefined;
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredApplications = useMemo(() => applications
    .filter((app) => filter === "All" || app.status === filter)
    .filter((app) => `${app.company} ${app.role} ${app.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date)), [applications, filter, search]);

  const counts = statuses.reduce((result, status) => ({ ...result, [status]: applications.filter((app) => app.status === status).length }), {});
  const updateStatus = (id, status) => {
    setApplications((current) => current.map((app) => app.id === id ? { ...app, status } : app));
    if (localStorage.getItem("applyflow-token")) api.updateApplication(id, { status }).catch(() => setToast("Could not sync status"));
    setToast("Application status updated");
  };
  const removeApplication = (id) => {
    setApplications((current) => current.filter((app) => app.id !== id));
    if (localStorage.getItem("applyflow-token")) api.deleteApplication(id).catch(() => setToast("Could not sync removal"));
    setToast("Application removed");
  };
  const openView = (view) => {
    setActiveView(view);
    setMobileMenu(false);
    if (view !== "dashboard") setFilter(view === "interviews" ? "Interview" : "All");
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = authMode === "login" ? await api.login({ email: authForm.email, password: authForm.password }) : await api.register(authForm);
      localStorage.setItem("applyflow-token", result.token);
      localStorage.setItem("applyflow-user", JSON.stringify(result.user));
      setUser(result.user);
    } catch (error) { setAuthError(error.message); } finally { setAuthLoading(false); }
  };
  const continueDemo = () => {
    const demoUser = { id: "demo", name: "Demo User", email: "demo@applyflow.local" };
    localStorage.setItem("applyflow-user", JSON.stringify(demoUser));
    setUser(demoUser);
    setToast("Demo workspace opened");
  };
  const signOut = () => {
    localStorage.removeItem("applyflow-token");
    localStorage.removeItem("applyflow-user");
    setUser(null);
  };

  if (!user) return <AuthScreen mode={authMode} form={authForm} error={authError} loading={authLoading} onModeChange={(mode) => { setAuthMode(mode); setAuthError(""); }} onChange={(event) => setAuthForm({ ...authForm, [event.target.name]: event.target.value })} onSubmit={submitAuth} onDemo={continueDemo} />;

  return (
    <div className="app">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark">A</span><span>Apply<span>Flow</span></span></div>
        <p className="menu-heading">WORKSPACE</p>
        <nav>{navItems.map(([id, label, icon]) => <button key={id} className={`nav-item ${activeView === id ? "active" : ""}`} onClick={() => openView(id)}><span className="nav-icon">{icon}</span>{label}{id === "applications" && <span className="nav-count">{applications.length}</span>}</button>)}</nav>
        <div className="sidebar-tip"><span>✦</span><strong>Stay consistent</strong><p>Small progress every day adds up.</p></div>
        <div className="sidebar-bottom"><div className="avatar">{(user.name || "U").slice(0, 2).toUpperCase()}</div><div><strong>{user.name || "My Workspace"}</strong><p>{user.email === "demo@applyflow.local" ? "Demo plan" : "Free plan"}</p></div><button className="signout-button" onClick={signOut}>↪</button></div>
      </aside>
      {mobileMenu && <button className="backdrop" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
      <main className="main">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu">☰</button>
          <div><p className="breadcrumb">Workspace <span>/</span> {activeView[0].toUpperCase() + activeView.slice(1)}</p><h1>{activeView === "dashboard" ? "Dashboard" : activeView[0].toUpperCase() + activeView.slice(1)}</h1></div>
          <div className="topbar-actions"><button className="notification" aria-label="Notifications"><Icon name="bell" /><i /></button><button className="primary-button" onClick={() => setShowModal(true)}><Icon name="plus" /> Add application</button></div>
        </header>

        {activeView === "dashboard" && <section className="welcome"><div><p className="eyebrow">GOOD MORNING, ESHAN <span>✦</span></p><h2>Your career, organized.</h2><p>Track your applications and stay on top of every opportunity.</p></div><div className="welcome-orbit"><span>✦</span></div></section>}

        <section className="stats">
          <StatCard title="Total Applications" value={applications.length} icon="▤" detail="All tracked applications" />
          <StatCard title="Interviews" value={counts.Interview} icon="◷" detail="Interview stage" />
          <StatCard title="Assessments" value={counts.Assessment} icon="✓" detail="Tests and assignments" />
          <StatCard title="Offers" value={counts.Offer} icon="★" detail="Offers received" />
        </section>

        {activeView === "applications" && <KanbanBoard applications={applications} onStatusChange={updateStatus} />}
        {activeView === "reminders" && <Reminders reminders={reminders} applications={applications} onAdd={(reminder) => setReminders((current) => [...current, reminder])} onToggle={(id) => setReminders((current) => current.map((reminder) => reminder.id === id ? { ...reminder, completed: !reminder.completed } : reminder))} />}
        {activeView === "analytics" && <AnalyticsView applications={applications} analytics={analytics} />}
        {activeView === "resumes" && <ResumeMatcher applications={applications} />}
        <section className={`applications-panel ${["applications", "reminders", "analytics", "resumes"].includes(activeView) ? "hidden-panel" : ""}`}>
          <div className="panel-heading"><div><div className="heading-line"><h2>{activeView === "interviews" ? "Upcoming interviews" : "Recent applications"}</h2><span className="live-dot" /></div><p>{activeView === "interviews" ? "Your next steps toward landing the role." : "Keep track of your job search progress."}</p></div><span className="count">{filteredApplications.length} {filteredApplications.length === 1 ? "application" : "applications"}</span></div>
          <div className="toolbar"><label className="search-box"><Icon name="search" /><input aria-label="Search applications" placeholder="Search company, role or location..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filter by status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="All">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
          <div className="table-wrapper"><table><thead><tr><th>COMPANY</th><th>ROLE</th><th>LOCATION</th><th>DATE APPLIED</th><th>STATUS</th><th aria-label="Actions" /></tr></thead><tbody>{filteredApplications.map((app) => <tr key={app.id}><td><div className="company-cell"><span className="company-logo" style={{ backgroundColor: app.color }}>{app.company[0]}</span><strong>{app.company}</strong></div></td><td>{app.role}</td><td><span className="location"><span>⌖</span>{app.location}</span></td><td>{formatDate(app.date)}</td><td><select className={`status status-${app.status.toLowerCase()}`} value={app.status} onChange={(event) => updateStatus(app.id, event.target.value)} aria-label={`Update ${app.company} status`}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td><td><button className="delete-button" onClick={() => removeApplication(app.id)} aria-label={`Remove ${app.company}`}><Icon name="trash" /></button></td></tr>)}{filteredApplications.length === 0 && <tr><td colSpan="6" className="empty"><span>⌕</span><strong>No applications found</strong><p>Try a different search or add a new application.</p></td></tr>}</tbody></table></div>
        </section>
        <footer>ApplyFlow <span>·</span> Your internship journey, one step at a time.</footer>
      </main>
      {showModal && <AddApplicationModal onClose={() => setShowModal(false)} onAdd={(application) => { setApplications((current) => [application, ...current]); if (localStorage.getItem("applyflow-token")) api.createApplication(application).catch(() => setToast("Saved locally; API sync failed")); setShowModal(false); setToast("Application added successfully"); }} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

function KanbanBoard({ applications, onStatusChange }) {
  return <div className="kanban">{statuses.map((status) => <section className="kanban-column" key={status}><div className="kanban-heading"><h2>{status}</h2><span>{applications.filter((app) => app.status === status).length}</span></div>{applications.filter((app) => app.status === status).map((app) => <article className="kanban-card" key={app.id}><div className="company-cell"><span className="company-logo" style={{ backgroundColor: app.color }}>{app.company[0]}</span><strong>{app.company}</strong></div><p>{app.role}</p><small>{app.location} · {formatDate(app.date)}</small><select className={`status status-${status.toLowerCase()}`} value={status} onChange={(event) => onStatusChange(app.id, event.target.value)} aria-label={`Move ${app.company}`}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></article>)}</section>)}</div>;
}

function Reminders({ reminders, applications, onAdd, onToggle }) {
  const [form, setForm] = useState({ title: "", dueAt: "", type: "Follow-up", applicationId: applications[0]?.id || "" });
  const submit = (event) => { event.preventDefault(); if (!form.title || !form.dueAt) return; onAdd({ ...form, id: Date.now(), completed: false, application: applications.find((app) => String(app.id) === String(form.applicationId)) }); setForm({ ...form, title: "", dueAt: "" }); };
  return <section className="feature-panel"><div className="feature-heading"><div><p className="eyebrow">STAY ON TRACK</p><h2>Smart follow-up reminders</h2><p>Never miss a deadline, interview, or recruiter follow-up.</p></div></div><form className="reminder-form" onSubmit={submit}><input required placeholder="Reminder title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><input required type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>Follow-up</option><option>Deadline</option><option>Interview</option></select><select value={form.applicationId} onChange={(event) => setForm({ ...form, applicationId: event.target.value })}>{applications.map((app) => <option key={app.id} value={app.id}>{app.company} · {app.role}</option>)}</select><button className="primary-button" type="submit"><Icon name="plus" /> Add reminder</button></form><div className="reminder-list">{reminders.length === 0 && <p className="empty">No reminders yet. Add your next follow-up above.</p>}{reminders.sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).map((reminder) => <label className={`reminder-item ${reminder.completed ? "completed" : ""}`} key={reminder.id}><input type="checkbox" checked={reminder.completed} onChange={() => onToggle(reminder.id)} /><span><strong>{reminder.title}</strong><small>{reminder.type} · {new Date(reminder.dueAt).toLocaleString()}</small></span></label>)}</div></section>;
}

function AnalyticsView({ applications, analytics }) {
  const total = applications.length;
  const responseRate = analytics?.responseRate ?? (total ? Math.round((applications.filter((app) => app.status !== "Applied").length / total) * 100) : 0);
  const interviewRate = analytics?.interviewConversion ?? (total ? Math.round((applications.filter((app) => ["Interview", "Offer"].includes(app.status)).length / total) * 100) : 0);
  return <section className="feature-panel"><div className="feature-heading"><div><p className="eyebrow">SEARCH PERFORMANCE</p><h2>Application analytics</h2><p>Understand what is working across your internship search.</p></div></div><div className="analytics-grid"><Metric title="Response rate" value={`${responseRate}%`} detail="Applications that moved beyond Applied" /><Metric title="Interview conversion" value={`${interviewRate}%`} detail="Applications reaching Interview or Offer" /><Metric title="Applications per week" value={Math.round(total / Math.max(1, Math.ceil(total / 3)))} detail="Based on your tracked applications" /></div><div className="funnel"><h3>Pipeline performance</h3>{statuses.map((status) => <div className="funnel-row" key={status}><span>{status}</span><div><i style={{ width: `${total ? Math.max(3, ((applications.filter((app) => app.status === status).length / total) * 100)) : 0}%` }} /></div><strong>{applications.filter((app) => app.status === status).length}</strong></div>)}</div></section>;
}

function Metric({ title, value, detail }) { return <div className="metric"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>; }

function ResumeMatcher() {
  const [resume, setResume] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState(null);
  const match = () => {
    const skillMap = {
      javascript: ["javascript", "js", "ecmascript"],
      typescript: ["typescript", "ts"],
      react: ["react", "react.js", "reactjs"],
      "node.js": ["node.js", "nodejs", "node js"],
      python: ["python"],
      java: ["java"],
      sql: ["sql", "postgresql", "mysql"],
      mongodb: ["mongodb", "mongo db"],
      aws: ["aws", "amazon web services"],
      figma: ["figma"],
      git: ["git", "github", "gitlab"],
      docker: ["docker", "containerization"],
      graphql: ["graphql"],
      "next.js": ["next.js", "nextjs", "next js"],
      communication: ["communication", "collaboration", "cross-functional"],
    };
    const findSkills = (text) => Object.entries(skillMap)
      .filter(([, aliases]) => aliases.some((alias) => new RegExp(`(^|[^a-z])${alias.replace(".", "\\.")}([^a-z]|$)`, "i").test(text)))
      .map(([skill]) => skill);
    const resumeSkills = findSkills(resume);
    const jobSkills = findSkills(description);
    const matched = jobSkills.filter((skill) => resumeSkills.includes(skill));
    const missing = jobSkills.filter((skill) => !resumeSkills.includes(skill));
    setResult({ resumeSkills, jobSkills, matched, missing, coverage: jobSkills.length ? Math.round((matched.length / jobSkills.length) * 100) : null });
  };
  return <section className="feature-panel"><div className="feature-heading"><div><p className="eyebrow">EVIDENCE-BASED MATCHING</p><h2>Resume and job description match</h2><p>Compare skills explicitly and see exactly what is missing.</p></div></div><div className="match-grid"><label>Your resume<textarea value={resume} onChange={(event) => setResume(event.target.value)} placeholder="Paste your resume text or skills..." /></label><label>Job description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Paste the job description..." /></label></div><button className="primary-button" onClick={match}>Analyze skill evidence <Icon name="arrow" /></button>{result && <div className="match-result"><div className="coverage"><strong>{result.coverage === null ? "—" : `${result.coverage}%`}</strong><span>{result.coverage === null ? "add job skills" : "skill coverage"}</span></div><div>{result.coverage === null ? <><h3>No recognizable skills detected</h3><p>Add technical skills or requirements to the job description, such as React, SQL, Python, or AWS.</p></> : <><h3>Skills found in job description</h3><p>{result.jobSkills.join(" · ")}</p><h3>Matched skills</h3><p>{result.matched.length ? result.matched.join(" · ") : "No required skills were found in the resume."}</p><h3>Skills to strengthen</h3><p>{result.missing.length ? result.missing.join(" · ") : "All detected job skills are supported by the resume."}</p></>}</div></div>}</section>;
}

function AuthScreen({ mode, form, error, loading, onModeChange, onChange, onSubmit, onDemo }) {
  return <main className="auth-page"><div className="auth-card"><div className="auth-brand"><span className="brand-mark">A</span><span>Apply<span>Flow</span></span></div><div className="auth-copy"><p className="eyebrow">YOUR INTERNSHIP COMMAND CENTER</p><h1>{mode === "login" ? "Welcome back." : "Start your next chapter."}</h1><p>{mode === "login" ? "Sign in to continue organizing your applications." : "Create a workspace for every opportunity ahead."}</p></div><div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => onModeChange("register")}>Create account</button></div><form className="auth-form" onSubmit={onSubmit}>{mode === "register" && <label>Your name<input required name="name" value={form.name} onChange={onChange} placeholder="Eshan Arjun" /></label>}<label>Email address<input required type="email" name="email" value={form.email} onChange={onChange} placeholder="you@example.com" /></label><label>Password<input required minLength="8" type="password" name="password" value={form.password} onChange={onChange} placeholder="At least 8 characters" /></label>{error && <p className="auth-error">{error}</p>}<button className="primary-button auth-submit" disabled={loading}>{loading ? "Signing in..." : mode === "login" ? "Sign in" : "Create account"} <Icon name="arrow" /></button></form><div className="auth-divider"><span>or continue with</span></div><div id="google-signin" className="google-button" /><button className="demo-button" onClick={onDemo}>Continue with demo workspace</button><p className="auth-note">Your applications are private to your account.</p></div></main>;
}

function StatCard({ title, value, icon, detail }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><h2>{value}</h2><p>{detail}</p></div>;
}

function AddApplicationModal({ onClose, onAdd }) {
  const [form, setForm] = useState(() => ({ company: "", role: "", location: "", date: new Date().toISOString().slice(0, 10), status: "Applied" }));
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = (event) => {
    event.preventDefault();
    if (!form.company.trim() || !form.role.trim()) return;
    const colors = ["#6258e8", "#0d9488", "#f97316", "#db2777", "#2563eb"];
    onAdd({ ...form, id: Date.now(), company: form.company.trim(), role: form.role.trim(), location: form.location.trim() || "Remote", color: colors[Math.floor(Math.random() * colors.length)] });
  };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal"><div className="modal-heading"><div><p className="eyebrow">NEW OPPORTUNITY</p><h2 id="modal-title">Add application</h2><p>Keep your job search moving forward.</p></div><button className="close-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div><form onSubmit={submit}><label>Company name<input required name="company" value={form.company} onChange={update} placeholder="e.g. Notion" autoFocus /></label><label>Role<input required name="role" value={form.role} onChange={update} placeholder="e.g. Product Design Intern" /></label><div className="form-row"><label>Location<input name="location" value={form.location} onChange={update} placeholder="Remote" /></label><label>Date applied<input required type="date" name="date" value={form.date} onChange={update} /></label></div><label>Status<select name="status" value={form.status} onChange={update}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Add application <Icon name="arrow" /></button></div></form></div></div>;
}

export default App;
