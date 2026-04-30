---
name: start
description: Start the Late Night Radio dev server and a Cloudflare tunnel for public access
---

Start both the local dev server and a Cloudflare tunnel in parallel. Follow these steps exactly:

## 1. Start the dev server in the background

Run the Next.js server:

```
node server.js
```

Run this in the background. Wait for the "Ready on http://localhost:3000" message to confirm it's up.

## 2. Start the Cloudflare tunnel in the background

Once the dev server is confirmed running, start the tunnel:

```
cloudflared tunnel --url http://localhost:3000
```

Run this in the background. Watch for the line containing `.trycloudflare.com` in the output — that's the public URL.

## 3. Report both URLs

Once both are running, report to the user:

- **Local:** `http://localhost:3000`
- **Public:** the `https://_____.trycloudflare.com` URL from cloudflared output

Format the output clearly so the user can copy-paste and share the public link.

## Notes

- Both processes run in the background — the user can keep working in Claude Code.
- If port 3000 is already in use, report the error instead of retrying.
- The cloudflared tunnel generates a random subdomain each time.
