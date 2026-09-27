// Build-time patch (see Dockerfile): makes the gateway's OpenAI-compatible HTTP API stream the
// agent's thinking and tool steps, which it otherwise drops.
//
// The agent loop already emits `thinking` events ({ text, delta }) and `tool` events
// ({ phase, name, args }) on the run's event bus — OpenClaw's own channels show them — but the
// /v1/chat/completions handler only forwards `assistant` text. This adds two branches next to
// its `lifecycle` one, writing extra SSE chunks in the same chat.completion.chunk shape:
//   delta.reasoning_content  — thinking text, incrementally (the field OpenAI-compatible
//                              clients commonly use for reasoning)
//   delta.sage_tool          — { name } when a tool call starts
// Clients that don't know these fields ignore them.
//
// Pinned to the image version in the Dockerfile. If an upgrade changes the handler, the
// anchor below won't match and the build fails here rather than silently losing the feature.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = "/app/dist";
const ANCHOR = '\t\tif (evt.stream === "lifecycle") {';
const INSERT = `\t\tif (evt.stream === "thinking") {
\t\t\tconst delta = typeof evt.data?.delta === "string" ? evt.data.delta : "";
\t\t\tif (delta) writeChatCompletionChunk(res, streamIdentity, { choices: [{ index: 0, delta: { reasoning_content: delta }, finish_reason: null }] });
\t\t\treturn;
\t\t}
\t\tif (evt.stream === "tool") {
\t\t\tif (evt.data?.phase === "start" && typeof evt.data?.name === "string") writeChatCompletionChunk(res, streamIdentity, { choices: [{ index: 0, delta: { sage_tool: { name: evt.data.name } }, finish_reason: null }] });
\t\t\treturn;
\t\t}
`;

const files = readdirSync(DIST).filter((f) => /^openai-http-.*\.mjs$/.test(f));
if (files.length !== 1) throw new Error(`expected one dist/openai-http-*.mjs, found ${files.length}`);
const file = join(DIST, files[0]);
const source = readFileSync(file, "utf8");

const hits = source.split(ANCHOR).length - 1;
if (hits !== 1) throw new Error(`stream-thinking patch: anchor found ${hits} times in ${file} (expected 1)`);
if (!source.includes("function writeChatCompletionChunk(") || !source.includes("const streamIdentity =")) {
  throw new Error(`stream-thinking patch: ${file} no longer has writeChatCompletionChunk/streamIdentity`);
}

writeFileSync(file, source.replace(ANCHOR, INSERT + ANCHOR));
console.log(`stream-thinking patch applied to ${file}`);
