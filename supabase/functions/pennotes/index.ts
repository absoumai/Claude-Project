// PenNotes API. The page is hosted on GitHub Pages (absoumai/pennotes) because
// Supabase sandboxes ALL HTML on its domain: functions and storage both force
// text/plain + "content-security-policy: default-src 'none'; sandbox".
// GET  -> tiny status JSON
// POST -> {mode, image(base64 png), question, text, extra, pasted, selected}
//         -> Claude -> {text, sources?}
// Secrets: Supabase env vars ANTHROPIC_API_KEY / PENNOTES_PASSCODE win if set,
// otherwise ./secrets.ts is used. secrets.ts is gitignored — see secrets.example.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { API_KEY, PASSCODE } from "./secrets.ts";

const MODEL = "claude-sonnet-5";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-pass, apikey, authorization",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-max-age": "86400",
};

// The pen colour IS the question — Claude can see the colours in the image.
const COLOURS =
  "\n\nCOLOUR MEANINGS in the image. Black is the student's ordinary notes. " +
  "BLUE means 'what is this? define it'. RED means 'I do not understand this — explain it very simply'. " +
  "A YELLOW HIGHLIGHT means 'this is the important part, focus here'. " +
  "If you see blue, red, or yellow, deal with those parts first and say which one you are answering. " +
  "If the note is all black, say NOTHING about colour at all — never mention that colours are absent.";

const PROMPTS: Record<string, string> = {
  read:
    "You are reading a photo of handwritten notes. Transcribe the handwriting EXACTLY as written, " +
    "keeping line breaks. Fix nothing. If a word is unreadable write [?]. " +
    "Output ONLY the transcription, no preamble.",
  explain:
    "Read the handwritten note. Explain it to a student who hates reading. " +
    "Max 3 short lines per idea: what it is (plain English + an analogy), why it matters, one example. " +
    "No walls of text.",
  again:
    "The student read your previous explanation and still did not get it. Explain the SAME material " +
    "a COMPLETELY different way: a different angle, different words, a different analogy, and more " +
    "detail wherever the last one was thin. Never reuse the previous analogy, opening line, or " +
    "structure. If this is attempt 3 or later, slow right down and build it up from the simplest " +
    "possible starting point. Still short: max 3 lines per idea.",
  real:
    "Explain the material in the note using ONE real-life example the student can picture from " +
    "everyday life — a house, a door and keys, a phone, a shop queue, a football match, post and " +
    "letters. Structure: tell the story of the example first (3-4 short lines, no jargon), then a " +
    "line starting 'So in the note:' that maps each part of the story onto the real thing. " +
    "One example only — do not list several.",
  know:
    "Identify the main tool, term, or concept in the note. Answer with these markdown headings, in order:\n" +
    "## What it is\n## Why it matters\n" +
    "THEN, only if it is a hacking / security / networking tool or technique, also add:\n" +
    "## When to use it\n## How to defend against it\n" +
    "If it is NOT security related, stop after 'Why it matters' — do not invent a defence section. " +
    "2 to 4 short lines under each heading. Plain English.",
  terminal:
    "Identify the software or command-line tool in the note. Use the web_search tool to confirm the " +
    "CURRENT package name and whether it ships with Kali Linux. Then answer with these headings:\n" +
    "## In Kali already?\nyes or no, one line.\n" +
    "## Start it\n## Install it\n## First useful command\n" +
    "Put every command alone on its own line wrapped in single backticks, like `sudo apt install nmap`. " +
    "One short line of plain English per command, never more. If it is not a piece of software, say so in one line. " +
    "Begin your answer directly with the first heading — no preamble, no summary of your search.",
  summary:
    "Read the handwritten note. Give the 5 key points as short bullets, then one line starting 'The exam answer is:'.",
  quiz:
    "Read the handwritten note. Write 5 exam-style questions on it, numbered 1. to 5., no answers yet. " +
    "Then on its own line write exactly: --ANSWERS-- " +
    "then the numbered answers, each with a one-line reason.",
  mcq:
    "Read the handwritten note. Write 5 multiple choice questions about it.\n" +
    "Format EXACTLY like this, nothing else:\n" +
    "1. question text\n" +
    "A) option\nB) option\nC) option\nD) option\n" +
    "(repeat for 2 to 5, numbered)\n" +
    "then a line containing exactly: --ANSWERS--\n" +
    "then one line per question: 1) B - short reason\n" +
    "Keep every option under 8 words. Exactly one option is correct.",
  mark:
    "You are marking a student's handwritten answers. The image is their note: it contains the " +
    "material AND their answers, which may be written anywhere, in any order, in short forms like " +
    "'1-5', 'Q2 H', '3. plural', or just '4 B'. Match each answer to its question number.\n" +
    "Output ONE line per question, in number order, in EXACTLY this pipe format:\n" +
    "number | RIGHT or WRONG or BLANK | what the student wrote | short comment\n" +
    "Use BLANK when you cannot find an answer for that question. Keep the comment under 12 words; " +
    "for a WRONG answer the comment must give the correct answer.\n" +
    "Then a final line exactly like: SCORE: 3/5\n" +
    "Output nothing else — no preamble, no markdown.",
  cards:
    "Read the handwritten note. Make flashcards. Format each as 'Q: ...' on one line and 'A: ...' on the next. " +
    "8 cards max, shortest possible wording.",
  solve:
    "Read the handwritten problem. Solve it step by step, numbered, one short line per step, " +
    "final answer in bold at the end. If the note already has an attempt, follow the same method.",
  fix:
    "Read the handwritten work. Mark it: list what is correct (short), then each mistake as " +
    "'Line X: what is wrong -> the fix'. End with a mark out of 10 and one thing to practise.",
  ask:
    "Read the handwritten note, then answer the student's question about it. Short, plain English, " +
    "3 lines unless they asked for detail.",
};

// Modes that get live web search (real, citable sources).
const SEARCHES: Record<string, boolean> = { terminal: true };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

type Block = { type: string; text?: string; content?: unknown };

function collectSources(blocks: Block[], into: { url: string; title: string }[]) {
  for (const b of blocks) {
    if (b.type !== "web_search_tool_result") continue;
    // On success `content` is a list of web_search_result; on failure it is an error object.
    if (!Array.isArray(b.content)) continue;
    for (const r of b.content as { type?: string; url?: string; title?: string }[]) {
      if (r?.url && !into.some((s) => s.url === r.url)) {
        into.push({ url: r.url, title: r.title || r.url });
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return json({ ok: true, service: "pennotes-api" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const passcode = Deno.env.get("PENNOTES_PASSCODE") || PASSCODE;
  if (passcode && req.headers.get("x-pass") !== passcode) {
    return json({ error: "Wrong passcode." }, 401);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY") || API_KEY;
  if (!key) return json({ error: "Server missing ANTHROPIC_API_KEY." }, 500);

  let body: {
    mode?: string;
    image?: string;
    question?: string;
    text?: string;
    extra?: string;
    pasted?: string;
    selected?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body." }, 400);
  }

  const mode = body.mode && PROMPTS[body.mode] ? body.mode : "read";

  let ask = PROMPTS[mode];
  if (mode !== "read") ask += COLOURS;
  if (body.selected) {
    ask +=
      "\n\nThe student circled ONE part of their page with the pen and this image is only that part. " +
      "Answer about exactly this, nothing wider.";
  }
  if (mode === "ask" && body.question) ask += "\n\nStudent's question: " + body.question;
  if (mode === "mark" && body.extra) ask += "\n\nThe questions and the correct answers:\n" + body.extra;
  if ((mode === "again" || mode === "real") && body.extra) ask += "\n\n" + body.extra;
  if (body.pasted) {
    ask +=
      "\n\nThe student also pasted this text from somewhere else — treat it as part of the material:\n" +
      body.pasted.slice(0, 6000);
  }
  if (!body.image && body.text) ask += "\n\nThe note (typed): " + body.text;

  const content: unknown[] = [];
  if (body.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: body.image },
    });
  }
  content.push({ type: "text", text: ask });

  const messages: { role: string; content: unknown }[] = [{ role: "user", content }];
  const tools = SEARCHES[mode]
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }]
    : undefined;

  const sources: { url: string; title: string }[] = [];

  try {
    // Server-tool turns can come back as stop_reason "pause_turn" — resume until done.
    for (let i = 0; i < 4; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: mode === "read" ? 1000 : 2000,
          messages,
          ...(tools ? { tools } : {}),
        }),
      });

      const data = await r.json();
      if (!r.ok) {
        return json(
          { error: (data?.error?.message as string) || ("Claude API error " + r.status) },
          502,
        );
      }

      const blocks: Block[] = data?.content || [];
      collectSources(blocks, sources);

      if (data?.stop_reason === "pause_turn") {
        // Hand the paused turn back so the server resumes where it left off.
        messages.push({ role: "assistant", content: blocks });
        continue;
      }

      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("\n")
        .trim();

      return json({ ok: true, mode, text, sources });
    }
    return json({ error: "Search took too long. Try again." }, 504);
  } catch (e) {
    return json({ error: "Upstream failed: " + (e as Error).message }, 502);
  }
});
