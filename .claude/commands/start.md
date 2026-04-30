Start both the Late Night Radio dev server and a Cloudflare tunnel for public access.

## Steps

1. **Start the dev server in the background:**
   Run `node server.js` in the background. Wait for the "Ready on http://localhost:3000" message to confirm it's up.

2. **Start the Cloudflare tunnel in the background:**
   Run `cloudflared tunnel --url http://localhost:3000` in the background. Watch the output for the line containing `.trycloudflare.com` — that's the public URL.

3. **Report both URLs to the user:**
   - **Local:** `http://localhost:3000`
   - **Public:** the `https://_____.trycloudflare.com` URL from cloudflared output

Format the output clearly so the user can copy-paste and share the public link.

## Notes
- Both processes run in the background so the user can keep working.
- If port 3000 is already in use, report the error.
- The cloudflared tunnel generates a random subdomain each time.
