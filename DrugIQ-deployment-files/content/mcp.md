# DrugIQ MCP integration

DrugIQ provides its own read-only Model Context Protocol endpoint at https://drugiq.vercel.app/.well-known/mcp. This is the DrugIQ discovery interface, not Vercel's MCP adapter or a third-party server inferred from the hosting provider. The endpoint uses Streamable HTTP with JSON responses. The supported protocol revision is 2025-11-25, with 2025-06-18 and 2025-03-26 compatibility. It does not claim implementation of the later 2026-07-28 protocol revision.

## Supported capabilities

- drugiq_list_tools: List the public research catalog, optionally by research stage.
- drugiq_get_tool: Read a catalog entry by exact tool ID, including input-field metadata, limitations and browser URL.
- drugiq_read_document: Read an allowlisted public Markdown document by document ID.

These tools are read-only, idempotent and closed to arbitrary network access. They return catalog data or documentation, not generated scientific findings. The server also supports resources/list and resources/read for its public Markdown documents. No sessions, persistent conversations, subscriptions, model sampling, scientific execution or long-running tasks are offered.

## Initialize

```sh
curl -i https://drugiq.vercel.app/.well-known/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"drugiq-check","version":"1.0.0"}}}'
```

After a successful initialize response, send notifications/initialized without an id. The server acknowledges valid notifications with HTTP 202 and no body. Subsequent requests should send MCP-Protocol-Version: 2025-11-25. Unsupported protocol-version headers receive HTTP 400; initialization can negotiate a supported revision when the requested version is not supported.

## List callable tools

```sh
curl -sS https://drugiq.vercel.app/.well-known/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Each JSON-RPC message uses its own POST request. Both application/json and text/event-stream must be acceptable to the client; this server chooses the JSON response option permitted by the supported transport. GET returns HTTP 405 because an independent SSE listening stream is not offered. That response is intentional, not a failed handshake. The endpoint is the handshake location itself, not a fabricated universal MCP discovery manifest.

## Safety and deployment

Origin validation, request-size limits and strict tool-argument validation protect this limited interface. The server does not expose backend secrets or accept arbitrary URLs. Read the [authentication guide](/docs/authentication) before extending it to scientific execution. Public-host verification must include actual POST initialization, notifications and a tool call, not just an HTTP GET to this path.
