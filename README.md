# ApplyFlow

ApplyFlow is a full-stack internship application tracker with a responsive React frontend and an Express/MongoDB API.

## Features

- Kanban pipeline for Applied, Assessment, Interview, Offer, and Rejected
- Search, filtering, pagination-ready API, and ownership-scoped application CRUD
- Follow-up, interview, and deadline reminders
- Response-rate, interview-conversion, funnel, and weekly analytics
- Evidence-based resume/job-description skill matching
- JWT authentication, password hashing, Zod validation, CORS, and MongoDB indexes
- LocalStorage fallback keeps the UI usable before signing in to the API

## Run locally

1. Start MongoDB on `mongodb://127.0.0.1:27017`.
2. Copy `.env.example` to `.env` and set a long random `JWT_SECRET`.
3. Install dependencies with `npm install`.
4. Run both apps with `npm run dev:full`.

The frontend runs on `http://localhost:5173`; the API runs on `http://localhost:4000`.

The repository includes an ignored `.env` with a development JWT secret so `npm run server:dev` does not crash on a fresh checkout. Replace it with your own secret before sharing or deploying.

Register or sign in through the API:

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Eshan","email":"eshan@example.com","password":"change-me-123"}'
```

The frontend stores the returned token securely in the browser session. The frontend API base URL can be changed with `VITE_API_URL`.

## API surface

- `POST /api/auth/register`, `POST /api/auth/login`
- `POST /api/auth/google` (Google Identity Services ID-token exchange; requires `GOOGLE_CLIENT_ID`)
- `GET/POST /api/applications`, `PATCH/DELETE /api/applications/:id`
- `GET/POST /api/reminders`, `PATCH /api/reminders/:id`
- `GET /api/analytics`
- `GET/POST /api/resumes`, `POST /api/match`
- `GET /api/health`

Every resource endpoint requires a Bearer token and filters records by the authenticated user's ID.
