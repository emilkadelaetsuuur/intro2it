#!/usr/bin/env bash
# SI notice: written with SI (AI) assistance (Claude, Anthropic) and reviewed by the team.
# QUENCH site installer. Run as root on the server:
#
#     bash install.sh nasa.cartify.ink            # install or update
#     bash install.sh nasa.cartify.ink --tls you@example.com   # also get a Let's Encrypt certificate (nginx + certbot)
#     bash install.sh nasa.cartify.ink --remove   # take the site down again
#
# What it does, and nothing else:
#   1. copies the static site to /var/www/<domain>         (its own folder; a previous copy is kept as a backup)
#   2. adds ONE web-server config file for <domain>        (nginx or apache; never edits an existing file)
#   3. tests the web-server config; if the test fails it removes its own file again and reloads nothing
#   4. reloads (never restarts) the web server
# Other sites, ports, containers and configs are not touched. If the domain is already configured by
# someone else's file, or the server uses Caddy or a container proxy, it stops and prints what to add by hand.
set -euo pipefail

DOMAIN="${1:-}"
MODE="install"; EMAIL=""
case "${2:-}" in
  --remove) MODE="remove" ;;
  --tls) MODE="tls"; EMAIL="${3:-}" ;;
  "") ;;
  *) echo "Unknown option: $2"; exit 2 ;;
esac
if ! printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'; then echo "Usage: bash install.sh <domain> [--tls email | --remove]"; exit 2; fi
[ "$(id -u)" = "0" ] || { echo "Run this as root."; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/web"; [ -f "$SRC/index.html" ] || SRC="$(dirname "$HERE")/web"
ROOT="/var/www/$DOMAIN"
MARK="# managed by the QUENCH installer"
say() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------- web server
SERVER="none"; CONF=""; LINK=""
if command -v nginx >/dev/null 2>&1 && pgrep -x nginx >/dev/null 2>&1; then
  SERVER="nginx"
  if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then CONF="/etc/nginx/sites-available/$DOMAIN"; LINK="/etc/nginx/sites-enabled/$DOMAIN"; else CONF="/etc/nginx/conf.d/$DOMAIN.conf"; fi
elif command -v apache2ctl >/dev/null 2>&1 && pgrep -x apache2 >/dev/null 2>&1; then
  SERVER="apache"; CONF="/etc/apache2/sites-available/$DOMAIN.conf"
elif command -v caddy >/dev/null 2>&1 && pgrep -x caddy >/dev/null 2>&1; then
  SERVER="caddy"
fi
reload_server() {
  case "$SERVER" in
    nginx) nginx -t >/dev/null 2>&1 && { systemctl reload nginx 2>/dev/null || nginx -s reload; } ;;
    apache) apache2ctl configtest >/dev/null 2>&1 && { systemctl reload apache2 2>/dev/null || apache2ctl graceful; } ;;
  esac
}

# -------------------------------------------------------------------- remove
if [ "$MODE" = "remove" ]; then
  say "Removing $DOMAIN"
  if [ -n "$CONF" ] && [ -f "$CONF" ] && grep -q "$MARK" "$CONF"; then
    [ "$SERVER" = "apache" ] && a2dissite -q "$DOMAIN" >/dev/null 2>&1 || true
    [ -n "$LINK" ] && rm -f "${LINK:?}"; rm -f "${CONF:?}"; reload_server && echo "config removed, $SERVER reloaded"
  else echo "no config file of ours found; web server left as it is"; fi
  [ -d "$ROOT" ] && mv "$ROOT" "/var/www/.$DOMAIN.removed.$(date +%Y%m%d%H%M%S)" && echo "site folder moved aside (not deleted) under /var/www"
  exit 0
fi

[ -f "$SRC/index.html" ] || { echo "Cannot find the site files (web/index.html) next to this script."; exit 1; }

# --------------------------------------------------------------------- files
say "Copying the site to $ROOT"
mkdir -p /var/www
TMP="$(mktemp -d "/var/www/.$DOMAIN.new.XXXXXX")"
cp -a "$SRC/." "$TMP/"
find "$TMP" -type d -exec chmod 755 {} +; find "$TMP" -type f -exec chmod 644 {} +
if [ -d "$ROOT" ]; then BK="/var/www/.$DOMAIN.bak.$(date +%Y%m%d%H%M%S)"; mv "$ROOT" "$BK"; echo "previous copy kept at $BK"; fi
mv "$TMP" "$ROOT"
ls -dt /var/www/."${DOMAIN:?}".bak.* 2>/dev/null | tail -n +3 | xargs -r rm -rf   # keep the two newest backups of this site only
echo "$(find "$ROOT" -type f | wc -l) files in place"

# ------------------------------------------------------------- server config
write_conf() {
  local V6=""; [ -e /proc/net/if_inet6 ] && V6="    listen [::]:80;"   # only where the machine has IPv6
  if [ "$SERVER" = "nginx" ]; then cat > "$CONF" <<EOF
$MARK
server {
    listen 80;
$V6
    server_name $DOMAIN;
    root $ROOT;
    index index.html;
    location / { try_files \$uri \$uri/ =404; }
    location ~* \.(js|jpg|png|svg|css)\$ { expires 1h; }
    add_header X-Content-Type-Options nosniff;
}
EOF
  else cat > "$CONF" <<EOF
$MARK
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot $ROOT
    <Directory $ROOT>
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>
</VirtualHost>
EOF
  fi
}

case "$SERVER" in
  nginx|apache)
    say "Configuring $SERVER for $DOMAIN"
    if [ -f "$CONF" ] && ! grep -q "$MARK" "$CONF"; then
      echo "A config file for this domain already exists and is not ours: $CONF"
      echo "It was left untouched. Point its document root at $ROOT, or remove it and run this script again."
      exit 3
    fi
    if [ "$SERVER" = "nginx" ]; then OTHER="$(grep -RIl --include='*' -E "server_name[^;]*[[:space:]]$DOMAIN[[:space:];]" /etc/nginx 2>/dev/null | grep -v -x -e "$CONF" -e "${LINK:-/nonexistent}" || true)"
    else OTHER="$(grep -RIl -E "Server(Name|Alias)[[:space:]]+.*$DOMAIN" /etc/apache2/sites-enabled 2>/dev/null | grep -v "$DOMAIN.conf" || true)"; fi
    if [ -n "$OTHER" ]; then
      echo "This domain is already served by another config:"; echo "$OTHER"
      echo "Nothing was changed in the web server. The site files are in $ROOT; point that config's root there."
      exit 3
    fi
    HAD=""; [ -f "$CONF" ] && { HAD="$(mktemp)"; cp -a "$CONF" "$HAD"; }
    if [ -n "$HAD" ] && grep -q "listen 443\|SSLEngine" "$CONF"; then
      echo "Existing config for this site already has TLS (certbot); keeping it as it is."
    else
      write_conf
      [ -n "$LINK" ] && ln -sfn "$CONF" "$LINK"
      [ "$SERVER" = "apache" ] && a2ensite -q "$DOMAIN" >/dev/null
    fi
    if { [ "$SERVER" = "nginx" ] && nginx -t 2>/tmp/quench-conftest.log; } || { [ "$SERVER" = "apache" ] && apache2ctl configtest 2>/tmp/quench-conftest.log; }; then
      reload_server; echo "$SERVER config test passed and $SERVER was reloaded"
    else
      echo "The $SERVER config test FAILED. Undoing our change; nothing was reloaded."; cat /tmp/quench-conftest.log || true
      if [ -n "$HAD" ]; then cp -a "$HAD" "$CONF"; else [ "$SERVER" = "apache" ] && a2dissite -q "$DOMAIN" >/dev/null 2>&1 || true; [ -n "$LINK" ] && rm -f "${LINK:?}"; rm -f "${CONF:?}"; fi
      exit 4
    fi
    [ -n "$HAD" ] && rm -f "$HAD"
    ;;
  caddy)
    say "Caddy is running here. The site files are in place; add this block to your Caddyfile and run 'caddy reload':"
    printf '\n%s {\n    root * %s\n    file_server\n}\n' "$DOMAIN" "$ROOT"; exit 0 ;;
  *)
    say "No running nginx, apache or caddy was found (the web server may be in a container)."
    echo "The site files are in $ROOT. Serve that folder for $DOMAIN from your existing proxy. Nothing else was changed."; exit 0 ;;
esac

# ----------------------------------------------------------------------- tls
if [ "$MODE" = "tls" ]; then
  say "Requesting a certificate for $DOMAIN"
  if [ "$SERVER" != "nginx" ] || ! command -v certbot >/dev/null 2>&1; then echo "This needs nginx and certbot (apt install certbot python3-certbot-nginx). Skipped."
  elif [ -z "$EMAIL" ]; then echo "Give an e-mail address: bash install.sh $DOMAIN --tls you@example.com. Skipped."
  else certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "certbot did not finish; the site still works over http."; fi
fi

# --------------------------------------------------------------------- check
say "Checking"
SEEN=""
for _ in 1 2 3 4 5 6 7 8; do   # a reload takes a moment to reach the workers
  if curl -s --noproxy '*' --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/ 2>/dev/null | grep -q "<title>QUENCH</title>"; then SEEN=1; break; fi
  sleep 1
done
if [ -n "$SEEN" ]; then echo "OK: this server now answers for $DOMAIN with the QUENCH page."
else echo "This server does not show the QUENCH page for $DOMAIN on port 80 yet. If the domain redirects to https or sits behind a proxy, open it in a browser to check."; fi
echo "Open http://$DOMAIN/ (or https:// if a certificate or Cloudflare is in front)."
echo "To take it down again: bash $0 $DOMAIN --remove"
