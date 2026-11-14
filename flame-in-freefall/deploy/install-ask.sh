#!/usr/bin/env bash
# Add the loopback QUENCH service to its existing TLS vhost. Run from a full release.
set -euo pipefail
umask 077
here=$(cd "$(dirname "$0")" && pwd)
src=$(dirname "$here")/server
unit=/etc/systemd/system/quench-ask.service
snippet=/etc/nginx/snippets/quench-ask.conf
host=/etc/nginx/sites-available/nasa.cartify.ink
base=/opt/quench
[[ $(id -u) = 0 && $(realpath "$host") = "$host" && $(realpath "$base") = "$base" ]]
[[ -s "$src/ask.py" && -s "$src/corpus.json" && -s /etc/quench/ask.env ]]
[[ $(stat -c '%U:%a' /etc/quench/ask.env) = root:600 ]]
grep -qF '# managed by the QUENCH installer' "$host"
grep -qF 'server_name nasa.cartify.ink;' "$host"
[[ $(realpath /etc/nginx/sites-enabled/nasa.cartify.ink) = "$host" ]]
backup=$(mktemp -d /opt/.quench-ask-rollback.XXXXXX)
tmp=$(mktemp -d "$base/.ask-new.XXXXXX")
chmod 755 "$tmp"
install -m 644 "$src/ask.py" "$src/corpus.json" "$tmp/"
for path in "$unit" "$snippet"; do
    [[ ! -e "$path" ]] || cp -a -- "$path" "$backup/"
done
cp -a -- "$host" "$backup/vhost"
old_active=0; systemctl is-active --quiet quench-ask.service && old_active=1
old_enabled=0; systemctl is-enabled --quiet quench-ask.service && old_enabled=1
rollback() {
    set +e
    systemctl stop quench-ask.service >/dev/null 2>&1
    [[ $old_enabled = 1 ]] || systemctl disable quench-ask.service >/dev/null 2>&1
    for path in "$unit" "$snippet"; do
        if [[ -e "$backup/$(basename "$path")" ]]; then cp -a -- "$backup/$(basename "$path")" "$path"; else rm -f -- "$path"; fi
    done
    cp -a -- "$backup/vhost" "$host"
    if [[ -d "$base/server" ]]; then mv -- "$base/server" "$backup/failed-server"; fi
    [[ ! -d "$backup/server" ]] || mv -- "$backup/server" "$base/server"
    systemctl daemon-reload
    [[ $old_active != 1 ]] || systemctl start quench-ask.service
    nginx -t && systemctl reload nginx
    echo "QUENCH service configuration restored." >&2
}
if [[ -d "$base/server" ]]; then mv -- "$base/server" "$backup/server"; fi
trap 's=$?; rollback; exit $s' ERR
mv -- "$tmp" "$base/server"
install -m 644 "$here/quench-ask.service" "$unit"
install -m 644 "$here/ask.nginx.conf" "$snippet"
python3 - "$host" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text()
inc='    include /etc/nginx/snippets/quench-ask.conf;'
if inc not in s.splitlines():
    needle='    location / { try_files $uri $uri/ =404; }'
    assert s.count(needle)==1 and s.index(needle)>s.index('listen 443 ssl;')
    p.write_text(s.replace(needle,inc+'\n'+needle))
PY
nginx -t
systemctl daemon-reload
systemctl enable quench-ask.service
systemctl restart quench-ask.service
ready=0
for _ in {1..24}; do
    if curl --noproxy '*' -fsS --max-time 2 -H 'Content-Type: application/json' --data '{"question":"weather on Saturn?"}' http://127.0.0.1:8765/api/ask > "$backup/smoke.json" && python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r.get("supported") is False and not r["sources"]' "$backup/smoke.json"; then ready=1; break; fi
    sleep 0.4
done
[[ $ready = 1 ]]
systemctl reload nginx
public_ready=0
# nginx signals its master asynchronously; old workers can briefly serve the prior vhost.
for _ in {1..20}; do
    if curl --noproxy '*' -fsS --max-time 3 --resolve nasa.cartify.ink:443:127.0.0.1 -H 'Content-Type: application/json' --data '{"question":"weather on Saturn?"}' https://nasa.cartify.ink/api/ask > "$backup/https-smoke.json" && python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r["supported"] is False and not r["sources"]' "$backup/https-smoke.json"; then public_ready=1; break; fi
    sleep 0.5
done
[[ $public_ready = 1 ]]
trap - ERR
echo "Verified QUENCH Ask at its HTTPS origin. Prior configuration: $backup"
