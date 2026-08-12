# PenNotes — plan

**What it is:** you handwrite on the iPad with the Pencil. The page sends your writing to Claude, Claude reads it, and a bar at the bottom asks *what do you want?* — Explain / Quiz me / Summarise / Flashcards / Solve / Check my work, or type your own question.

**Why it works:** no handwriting software needed. Claude reads handwriting from the image. Nothing to install on the iPad — you open a link in Safari and tap **Add to Home Screen**.

---

## The setup (3 boxes)

| Box | Job |
|---|---|
| iPad + Pencil | You write. Safari opens one URL. |
| Supabase Edge Function | Serves the page **and** holds the API key. Key never touches the iPad. |
| Home laptop + GitHub | Where we build. I push, you pull, we both see the same code. |

---

## Status

**Done (already in this folder):**
- `supabase/functions/pennotes/page.ts` — the whole iPad app: Pencil canvas (pressure, palm rejection, finger scrolls / pen draws), pen + highlighter + eraser, undo, saved notes, auto-transcribe 1.6s after you stop writing, bottom action bar, answer sheet, quiz answers hidden behind a button.
- `supabase/functions/pennotes/index.ts` — the server: serves the page, calls Claude with the image, passcode-gated.

- **API is LIVE and tested 2026-08-12:** `https://bydhtjspcdjdgrpjsotr.supabase.co/functions/v1/pennotes`, passcode `tcd2026`. Verified by curl: wrong passcode → 401, real image → Claude read it and answered correctly. CORS is open so the page can sit on any host.
- The page runs correctly — screenshotted in Chromium from `web/index.html`.
- Local git repo initialised. Key is NOT in git.

**LIVE 2026-08-12: https://absoumai.github.io/pennotes/** — passcode `pn-xqd8-66dy-8fwe`.
Page hosted on GitHub Pages from the public repo `absoumai/pennotes` (one HTML file, no secrets).
Project code lives in the private repo `absoumai/Claude-Project`. Verified: HTTP 200, real `text/html`,
old passcode rejected, new passcode returns a correct answer from Claude.

Why not Supabase: both Edge Functions *and* Storage force
`content-type: text/plain` + `content-security-policy: default-src 'none'; sandbox` on any HTML,
which kills the scripts. That is Supabase anti-phishing policy, not a bug we can fix. Tried and confirmed both.

Pushing to the existing Vercel site also failed — the GitHub PAT baked into
`~/projects/tcd-vision-project`'s remote is now invalid ("Password authentication is not supported").

**Not done yet:**
1. Host `web/index.html` somewhere real → then it works on the iPad.
2. Real iPad + Pencil test — palm rejection and how well it reads *his* handwriting.
3. New GitHub account + private repo + push.

**Hosting options (pick one):**
- **New GitHub account + Vercel** (his plan anyway) — free, gives a proper URL, auto-deploys on push.
- **Fix the old PAT** on `tcd-vision-project` → I push `public/pennotes.html` → `tcdvision.academy/pennotes.html`. Already staged and ready; the commit is sitting locally unpushed.
- Any static host that serves real HTML (Netlify, Cloudflare Pages, GitHub Pages).

---

## Next session (in order)

1. Open the URL on the iPad → Share → **Add to Home Screen**.
2. Write one line, wait ~2s, check the READ strip at the bottom matches.
3. Tap Explain / Quiz me. Report what feels wrong.
4. Likely tweaks after the real test: recognition wait time, pen thickness, palm rejection, page length.
5. New GitHub account → private repo `pennotes` → push.

---

## Rules for this project

- API key lives **only** in Supabase secrets. Never in the repo. `.gitignore` covers key files.
- Repo is **private** and only for this project (new GitHub account).
- Passcode on the endpoint so a leaked URL can't burn your Claude credits.

## Ideas parked for later

- Per-subject notebooks (Networking / Maths / Arabic) instead of one pile.
- "Exam mode": Claude quizzes you from every note in a subject.
- Export a note to PDF / send to your Obsidian vault (ties into Jarvis).
- Voice: read the answer out loud.
- Search across all your handwriting.
