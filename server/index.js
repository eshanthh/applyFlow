import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const app = express();
const port = Number(process.env.PORT || 4000);
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/applyflow";
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "applyflow-local-development-only-change-me");
if (!jwtSecret) throw new Error("JWT_SECRET is required in production. Copy .env.example to .env and set a long random secret.");
if (!process.env.JWT_SECRET) console.warn("JWT_SECRET is not set; using a development-only secret. Set JWT_SECRET before deploying.");
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const allowedOrigins = new Set([
  process.env.CLIENT_ORIGIN || "http://localhost:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "1mb" }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  googleId: { type: String, unique: true, sparse: true },
}, { timestamps: true });
const applicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  company: { type: String, required: true, trim: true, maxlength: 120 },
  role: { type: String, required: true, trim: true, maxlength: 160 },
  location: { type: String, default: "Remote", trim: true, maxlength: 100 },
  date: { type: String, required: true },
  status: { type: String, enum: ["Applied", "Assessment", "Interview", "Offer", "Rejected"], default: "Applied" },
  color: { type: String, default: "#6258e8" },
  jobDescription: { type: String, default: "", maxlength: 20000 },
  resumeVersion: { type: String, default: "" },
}, { timestamps: true });
const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  dueAt: { type: Date, required: true },
  type: { type: String, enum: ["Deadline", "Interview", "Follow-up"], default: "Follow-up" },
  completed: { type: Boolean, default: false },
}, { timestamps: true });
const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  content: { type: String, required: true, maxlength: 50000 },
  skills: [{ type: String, trim: true }],
}, { timestamps: true });
const User = mongoose.model("User", userSchema);
const Application = mongoose.model("Application", applicationSchema);
const Reminder = mongoose.model("Reminder", reminderSchema);
const Resume = mongoose.model("Resume", resumeSchema);

const applicationInput = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(160),
  location: z.string().trim().max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["Applied", "Assessment", "Interview", "Offer", "Rejected"]).optional(),
  color: z.string().regex(/^#[\da-f]{6}$/i).optional(),
  jobDescription: z.string().max(20000).optional(),
  resumeVersion: z.string().max(100).optional(),
});
const reminderInput = z.object({
  applicationId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  dueAt: z.coerce.date(),
  type: z.enum(["Deadline", "Interview", "Follow-up"]).optional(),
});
const resumeInput = z.object({ name: z.string().trim().min(1).max(100), content: z.string().min(1).max(50000) });

function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, jwtSecret, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  try {
    req.userId = jwt.verify(header.slice(7), jwtSecret).sub;
    if (!mongoose.isValidObjectId(req.userId)) return res.status(401).json({ error: "Invalid account token. Please sign in again." });
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
function handleValidation(schema, value, res) {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return null;
  }
  return result.data;
}
function errorHandler(error, _req, res, _next) {
  if (error.code === 11000) return res.status(409).json({ error: "That email is already registered" });
  if (error.name === "ValidationError") return res.status(400).json({ error: "Application data is invalid", details: error.message });
  if (error.name === "CastError") return res.status(400).json({ error: "One of the application values is invalid", details: error.message });
  console.error(error);
  return res.status(500).json({ error: "Unexpected server error" });
}
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.get("/api/health", (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = handleValidation(z.object({ name: z.string().trim().min(2).max(80), email: z.string().email(), password: z.string().min(8).max(128) }), req.body, res);
    if (!body) return;
    const user = await User.create({ ...body, passwordHash: await bcrypt.hash(body.password, 12) });
    return res.status(201).json({ user: { id: user._id, name: user.name, email: user.email }, token: tokenFor(user) });
  } catch (error) { return next(error); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = handleValidation(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body, res);
    if (!body) return;
    const user = await User.findOne({ email: body.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
    return res.json({ user: { id: user._id, name: user.name, email: user.email }, token: tokenFor(user) });
  } catch (error) { return next(error); }
});
app.post("/api/auth/google", async (req, res, next) => {
  try {
    if (!googleClient || !googleClientId) return res.status(503).json({ error: "Google login is not configured. Set GOOGLE_CLIENT_ID in .env." });
    const body = handleValidation(z.object({ credential: z.string().min(20) }), req.body, res);
    if (!body) return;
    const ticket = await googleClient.verifyIdToken({ idToken: body.credential, audience: googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) return res.status(401).json({ error: "Google account email could not be verified" });
    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email.toLowerCase() }] });
    if (!user) user = await User.create({ name: payload.name || payload.email.split("@")[0], email: payload.email, googleId: payload.sub });
    else if (!user.googleId) { user.googleId = payload.sub; await user.save(); }
    return res.json({ user: { id: user._id, name: user.name, email: user.email }, token: tokenFor(user) });
  } catch (error) { return next(error); }
});

app.get("/api/applications", auth, async (req, res, next) => {
  try {
    const { search = "", status, page = "1", limit = "20" } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const escapedSearch = escapeRegex(search);
    const query = { userId: req.userId, ...(status && { status }), ...(search && { $or: [{ company: new RegExp(escapedSearch, "i") }, { role: new RegExp(escapedSearch, "i") }, { location: new RegExp(escapedSearch, "i") }] }) };
    const [items, total] = await Promise.all([Application.find(query).sort({ date: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(), Application.countDocuments(query)]);
    return res.json({ items, page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) });
  } catch (error) { return next(error); }
});
app.post("/api/applications", auth, async (req, res, next) => {
  try { const body = handleValidation(applicationInput, req.body, res); if (!body) return; return res.status(201).json(await Application.create({ ...body, userId: req.userId })); } catch (error) { return next(error); }
});
app.patch("/api/applications/:id", auth, async (req, res, next) => {
  try { const body = handleValidation(applicationInput.partial(), req.body, res); if (!body) return; const item = await Application.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, body, { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: "Application not found" }); return res.json(item); } catch (error) { return next(error); }
});
app.delete("/api/applications/:id", auth, async (req, res, next) => {
  try { const item = await Application.findOneAndDelete({ _id: req.params.id, userId: req.userId }); if (!item) return res.status(404).json({ error: "Application not found" }); await Reminder.deleteMany({ applicationId: item._id, userId: req.userId }); return res.status(204).end(); } catch (error) { return next(error); }
});

app.get("/api/reminders", auth, async (req, res, next) => {
  try { return res.json(await Reminder.find({ userId: req.userId }).populate("applicationId", "company role").sort({ dueAt: 1 }).lean()); } catch (error) { return next(error); }
});
app.post("/api/reminders", auth, async (req, res, next) => {
  try { const body = handleValidation(reminderInput, req.body, res); if (!body) return; const application = await Application.exists({ _id: body.applicationId, userId: req.userId }); if (!application) return res.status(404).json({ error: "Application not found" }); return res.status(201).json(await Reminder.create({ ...body, userId: req.userId })); } catch (error) { return next(error); }
});
app.patch("/api/reminders/:id", auth, async (req, res, next) => {
  try { const body = handleValidation(z.object({ completed: z.boolean() }), req.body, res); if (!body) return; const reminder = await Reminder.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, body, { new: true }); if (!reminder) return res.status(404).json({ error: "Reminder not found" }); return res.json(reminder); } catch (error) { return next(error); }
});

app.get("/api/analytics", auth, async (req, res, next) => {
  try {
    const [total, grouped, weekly] = await Promise.all([
      Application.countDocuments({ userId: req.userId }),
      Application.aggregate([{ $match: { userId: new mongoose.Types.ObjectId(req.userId) } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Application.aggregate([{ $match: { userId: new mongoose.Types.ObjectId(req.userId) } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: { $dateFromString: { dateString: "$date" } } } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    const counts = Object.fromEntries(grouped.map((item) => [item._id, item.count]));
    return res.json({ total, counts, responseRate: total ? Math.round(((total - (counts.Applied || 0)) / total) * 100) : 0, interviewConversion: (counts.Interview || 0) + (counts.Offer || 0) ? Math.round(((counts.Interview || 0) + (counts.Offer || 0)) / total * 100) : 0, weekly });
  } catch (error) { return next(error); }
});

function extractSkills(text) {
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
  return Object.entries(skillMap)
    .filter(([, aliases]) => aliases.some((alias) => new RegExp(`(^|[^a-z])${alias.replace(".", "\\.")}([^a-z]|$)`, "i").test(text)))
    .map(([skill]) => skill);
}
app.get("/api/resumes", auth, async (req, res, next) => { try { return res.json(await Resume.find({ userId: req.userId }).select("-content").sort({ createdAt: -1 }).lean()); } catch (error) { return next(error); } });
app.post("/api/resumes", auth, async (req, res, next) => { try { const body = handleValidation(resumeInput, req.body, res); if (!body) return; return res.status(201).json(await Resume.create({ ...body, skills: extractSkills(body.content), userId: req.userId })); } catch (error) { return next(error); } });
app.post("/api/match", auth, async (req, res, next) => { try { const body = handleValidation(z.object({ resumeId: z.string(), jobDescription: z.string().min(30).max(20000) }), req.body, res); if (!body) return; const resume = await Resume.findOne({ _id: body.resumeId, userId: req.userId }); if (!resume) return res.status(404).json({ error: "Resume not found" }); const resumeSkills = resume.skills.length ? resume.skills : extractSkills(resume.content); const jobSkills = extractSkills(body.jobDescription); const matched = jobSkills.filter((skill) => resumeSkills.includes(skill)); const missing = jobSkills.filter((skill) => !resumeSkills.includes(skill)); return res.json({ matched, missing, evidence: matched.map((skill) => ({ skill, source: "resume", note: `Found "${skill}" in your saved resume.` })), coverage: jobSkills.length ? Math.round(matched.length / jobSkills.length * 100) : 0 }); } catch (error) { return next(error); } });

app.use(errorHandler);
mongoose.connect(mongoUri).then(() => app.listen(port, () => console.log(`ApplyFlow API listening on http://localhost:${port}`))).catch((error) => { console.error("MongoDB connection failed:", error.message); process.exit(1); });
