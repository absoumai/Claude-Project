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

**Not done yet:**
1. Deploy it (needs the 2 secrets set) → get the live URL.
2. Test on the real iPad with the real Pencil — palm rejection + recognition accuracy are the two things I can't fake from here.
3. New GitHub account + private repo, push, wire it up.

---

## Next session (home laptop, in order)

1. New GitHub account → create **private** repo `pennotes`.
2. `git init` here, push.
3. Set the 2 Supabase secrets: `ANTHROPIC_API_KEY`, `PENNOTES_PASSCODE`.
4. I deploy the function → you get one URL.
5. Open on iPad, Add to Home Screen, write a line, see if it reads it.
6. Tune from there.

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
