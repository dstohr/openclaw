# OpenClaw Observability Dashboard (Local)

This dashboard is a lightweight, local-only viewer for OpenClaw runs. It stitches
full transcript snapshots (including system messages + attachments) with model
usage events (tokens, duration, cost) so you can inspect each run end-to-end.

## Data sources

- **Cache trace** (`cache-trace.jsonl`)
  - Full message snapshots (system, prompt, messages, attachments).
- **Diagnostics event log** (`diagnostics-events.jsonl`)
  - Model usage, duration, cost, queue, and session metadata.

## Enable the data pipeline

1. Enable cache trace snapshots:

```json
{
  "diagnostics": {
    "enabled": true,
    "cacheTrace": {
      "enabled": true,
      "includeMessages": true,
      "includePrompt": true,
      "includeSystem": true
    }
  }
}
```

2. Enable diagnostics JSONL export:

```json
{
  "plugins": {
    "allow": ["diagnostics-jsonl"],
    "entries": {
      "diagnostics-jsonl": { "enabled": true }
    }
  },
  "diagnostics": {
    "enabled": true,
    "eventLog": {
      "enabled": true,
      "filePath": "~/.openclaw/logs/diagnostics-events.jsonl"
    }
  }
}
```

## Run the dashboard

```bash
node apps/openclaw-obs/server.mjs
```

Defaults:

- URL: `http://localhost:18911`
- Cache trace: `~/.openclaw/logs/cache-trace.jsonl`
- Diagnostics log: `~/.openclaw/logs/diagnostics-events.jsonl`

## Environment overrides

- `OPENCLAW_OBS_PORT` (default `18911`)
- `OPENCLAW_OBS_HOST` (default binds to `127.0.0.1` + `::1`)
- `OPENCLAW_STATE_DIR` (default `~/.openclaw`, used to resolve logs)
- `OPENCLAW_CACHE_TRACE_FILE` (explicit cache-trace JSONL path)
- `OPENCLAW_DIAGNOSTICS_EVENTLOG_FILE` (explicit diagnostics JSONL path)

## What you get

- Full run transcripts (system + user + assistant + tool results)
- Attachment previews for image blocks
- Token usage + duration per run (joined by session/time)
- Session/run metadata (provider, model, channel, session ids)
