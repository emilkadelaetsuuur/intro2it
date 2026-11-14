# Deploying Ask

The web interface and archived evidence require no API key. Live selection uses the loopback Python service in `server/ask.py`; nginx exposes only `POST /api/ask` on the site's existing HTTPS vhost. The GitHub Pages mirror may call this same endpoint. If it cannot reach it, it can search its local copy of the organizers' evidence.

1. Run `python scripts/build_ask_corpus.py` on the full checkout, or use the two committed snapshots. The browser and server snapshots contain the same source excerpts. Do not serve the server directory as static files.
2. Install the static site and its valid TLS certificate before installing the API. The following installer is for the managed nginx vhost of `nasa.cartify.ink` on this server. Supply the full `server/` and `deploy/` directories together.
3. On the server only, create `/etc/quench/ask.env` as root, mode 0600, inside a directory owned by root, mode 0700. Set `CLAUDE_PROVIDER=oneaiapikey`, `CLAUDE_MODEL=claude-sonnet-5-5:free`, `CLAUDE_API_KEY` and `CLAUDE_BACKUP_API_KEY`. For direct Anthropic keys use `CLAUDE_PROVIDER=anthropic` with a compatible Anthropic model. Do not commit the file or place a copy in a document root.
4. Run `bash deploy/install-ask.sh` as root. It verifies the site ownership marker and file paths, backs up its own configuration, starts an unprivileged systemd service, tests nginx, and checks a real HTTPS query. Unrelated site configurations are not modified. On failure the installer restores the previous version.
5. To rotate keys, edit the server env file and restart just `quench-ask.service`. No web rebuild is needed. A healthy end-to-end Claude probe must return `mode: "claude"` and organizer citations. `mode: "archive"` is a valid no-model answer, not proof that the provider supplied Claude.

The server sends the question and candidate organizer-source passages to the selected provider. Claude may choose only passage IDs. URLs and displayed evidence come from the fixed local corpus; neither arbitrary URLs nor arbitrary text from the model are rendered. Shared daily quotas at a gateway may affect both credentials. OneAIAPIKey can route a named free Claude lane to another model family; the service rejects such results and uses its documented fallback. See the provider's [Messages API](https://oneaiapikey.com/docs/anthropic-messages) and [model routing](https://oneaiapikey.com/docs/models).

Each upstream attempt counts toward a persistent daily budget (`CLAUDE_DAILY_ATTEMPTS`); client requests are additionally rate limited. No questions or credentials are stored in the usage database. The proxy trusts Cloudflare's client-address header only when the peer is in [Cloudflare's published address ranges](https://www.cloudflare.com/ips/).

## Waiting time and compression

A provider attempt waits at most 8 seconds (`ATTEMPT_SECONDS` in `server/ask.py`). After two questions in a row for which every key failed, the service skips the provider for ten minutes and answers from the archive at once; the next question after that probes the provider again, and one success closes the breaker. Questions that match a stored analyst answer never reach this service: the browser answers them from `web/data.js`.

The nginx snippet also turns on gzip for scripts, styles, JSON, CSV and SVG on this vhost. nginx compresses only HTML by default, which left the first load at about 1.1 MB. Re-run `bash deploy/install-ask.sh` to apply both changes; it tests the nginx configuration and restores the previous version on failure.
