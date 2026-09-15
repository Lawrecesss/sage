// Thin HTTP client for OpenClaw's OpenAI-compatible chat-completions endpoint.
// The only place in this app that talks to OpenClaw directly — nothing else
// should call an LLM endpoint directly, see
// docs/decisions/0003-openclaw-agent-runtime.md. Server-only — never import
// from a client component.
//
// TODO: implement
//   runBriefing(prompt): calls OpenClaw with the sage-briefing agent id,
//     non-streaming; used by app/api/brief/run. Maps an unreachable gateway
//     or non-2xx response to a 502-shaped error, and a response that fails
//     brief-JSON validation to a 500 (should be rare — save_brief validates
//     on the MCP side already, see agent/mcp).
//   streamAsk(prompt): calls OpenClaw with the sage-ask agent id,
//     stream: true, and re-yields SSE `data:` chunks for app/api/ask to
//     forward as-is.
// STUB — structure only, no implementation yet.

export {};
