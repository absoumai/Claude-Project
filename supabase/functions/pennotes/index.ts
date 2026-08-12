// PenNotes — handwrite on iPad, Claude reads the page and helps.
// GET  -> serves the app HTML
// POST -> {mode, image(base64 png), question, text} -> Claude -> {text}
// Secrets: Supabase env vars ANTHROPIC_API_KEY / PENNOTES_PASSCODE win if set,
// otherwise ./secrets.ts is used. secrets.ts is gitignored — see secrets.example.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { HTML } from "./page.ts";
import { API_KEY, PASSCODE } from "./secrets.ts";

const MODEL = "claude-sonnet-5";

const PROMPTS: Record<string, string> = {
  read:
    "You are reading a photo of handwritten notes. Transcribe the handwriting EXACTLY as written, " +
    "keeping line breaks. Fix nothing. If a word is unreadable write [?]. " +
    "Output ONLY the transcription, no preamble.",
  explain:
    "Read the handwritten note. Explain it to a student who hates reading. " +
    "Max 3 short lines per idea: what it is (plain English + an analogy), why it matters, one example. " +
    "No walls of text.",
  summary:
    "Read the handwritten note. Give the 5 key points as short bullets, then one line: 'The exam answer is: ...'.",
  quiz:
    "Read the handwritten note. Write 5 exam-style questions on it, numbered, no answers yet. " +
    "Then on its own line write exactly: --ANSWERS-- " +
    "then the numbered answers, each with a one-line reason.",
  cards:
    "Read the handwritten note. Make flashcards. Format each as 'Q: ...' on one line and 'A: ...' on the next. " +
    "8 cards max, shortest possible wording.",
  solve:
    "Read the handwritten problem. Solve it step by step, numbered, one short line per step, " +
    "final answer in bold at the end. If the note already has an attempt, follow the same method.",
  fix:
    "Read the handwritten work. Mark it: list what is correct (short), then each mistake as " +
    "'Line/step X: what's wrong -> the fix'. End with a mark out of 10 and one thing to practise.",
  ask:
    "Read the handwritten note, then answer the student's question about it. Short, plain English, " +
    "3 lines unless they asked for detail.",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return new Response(HTML, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const passcode = Deno.env.get("PENNOTES_PASSCODE") || PASSCODE;
  if (passcode && req.headers.get("x-pass") !== passcode) {
    return json({ error: "Wrong passcode." }, 401);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY") || API_KEY;
  if (!key) return json({ error: "Server missing ANTHROPIC_API_KEY." }, 500);

  let body: { mode?: string; image?: string; question?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body." }, 400);
  }

  const mode = body.mode && PROMPTS[body.mode] ? body.mode : "read";
  const content: unknown[] = [];

  if (body.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: body.image },
    });
  }
  let ask = PROMPTS[mode];
  if (mode === "ask" && body.question) ask += "\n\nStudent's question: " + body.question;
  if (!body.image && body.text) ask += "\n\nThe note (typed): " + body.text;
  content.push({ type: "text", text: ask });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === "read" ? 1000 : 1600,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return json({ error: (data?.error?.message as string) || ("Claude API error " + r.status) }, 502);
    }
    const text = (data?.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();

    return json({ ok: true, mode, text });
  } catch (e) {
    return json({ error: "Upstream failed: " + (e as Error).message }, 502);
  }
});
