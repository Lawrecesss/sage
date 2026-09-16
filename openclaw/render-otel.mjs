// Renders /opt/sage/otel.json — the `diagnostics.otel` block that openclaw.json
// $includes. Generated rather than written by hand because the Langfuse auth
// header is base64(publicKey:secretKey), and openclaw.json's ${VAR} interpolation
// only substitutes into strings (so it can't derive a value, or fill a boolean).
//
// Langfuse ingests the traces signal only, over OTLP http/protobuf, at
// $LANGFUSE_BASE_URL/api/public/otel/v1/traces — metrics and logs stay off.
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "/opt/sage/otel.json";
const env = (name) => (process.env[name] ?? "").trim();

const baseUrl = env("LANGFUSE_BASE_URL").replace(/\/+$/, "");
const publicKey = env("LANGFUSE_PUBLIC_KEY");
const secretKey = env("LANGFUSE_SECRET_KEY");

const write = (otel) => writeFileSync(OUT, JSON.stringify(otel, null, 2), { mode: 0o600 });

if (!baseUrl || !publicKey || !secretKey) {
  write({ enabled: false });
  console.warn("[sage] LANGFUSE_BASE_URL/_PUBLIC_KEY/_SECRET_KEY not all set — tracing disabled.");
  process.exit(0);
}

const captureContent = env("LANGFUSE_CAPTURE_CONTENT") !== "false";
const sampleRate = Number(env("LANGFUSE_SAMPLE_RATE") || "1");

write({
  enabled: true,
  tracesEndpoint: `${baseUrl}/api/public/otel/v1/traces`,
  protocol: "http/protobuf",
  headers: {
    Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
    // Opts into Langfuse's real-time ingestion path.
    "x-langfuse-ingestion-version": "4",
  },
  serviceName: env("LANGFUSE_SERVICE_NAME") || "sage-openclaw",
  traces: true,
  metrics: false,
  logs: false,
  sampleRate,
  // Prompts, completions and tool payloads ride along as span attributes.
  captureContent,
});

console.log(
  `[sage] tracing -> ${baseUrl} as ${publicKey} ` +
    `(sampleRate ${sampleRate}, content capture ${captureContent ? "on" : "off"})`,
);
