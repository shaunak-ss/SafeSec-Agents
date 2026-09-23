# SafeSec Agents

Frontend for SafeSec Agents — a live jailbreak scanner UI.

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000` (matches backend CORS). Mock mode is on by default (`VITE_USE_MOCK=true` in `.env.local`). Point `VITE_API_BASE_URL` at the FastAPI server and set `VITE_USE_MOCK=false` when the backend is ready.
