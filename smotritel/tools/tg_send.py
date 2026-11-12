#!/usr/bin/env python3
"""Отправка готовой серии в Telegram — только владельцу, по его числовому ID.

Бот ничего не рассылает и никому не отвечает: скрипт умеет ровно одно —
отправить файл в один заранее привязанный личный чат.

  python tools/tg_send.py out/ep01.mp4                 файл как есть, без пережатия
  python tools/tg_send.py out/ep01.mp4 --video         как видео (играет прямо в чате)
  python tools/tg_send.py out/ep01.mp4 --caption "…"   со своей подписью
  python tools/tg_send.py --check                      проверить настройки, ничего не отправляя
  python tools/tg_send.py --bind СЛОВО                 один раз привязать свой ID (см. ниже)

Настройки:
  TG_BOT_TOKEN  токен бота от @BotFather — только из переменной окружения,
                в файлы проекта и в репозиторий он не попадает;
  TG_CHAT_ID    твой числовой Telegram ID — из переменной окружения
                или из файла .tg.json рядом с README (он в .gitignore).

Привязка ID (--bind): напиши боту в личку кодовое слово — скрипт запомнит
ID этого чата в .tg.json. После привязки входящие сообщения больше не читаются.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONF = ROOT / ".tg.json"
API = "https://api.telegram.org"


def token():
    t = os.environ.get("TG_BOT_TOKEN", "").strip()
    if not t:
        sys.exit("Нет токена: задай переменную окружения TG_BOT_TOKEN (токен от @BotFather).")
    return t


def mask(s):
    t = os.environ.get("TG_BOT_TOKEN", "").strip()
    return str(s).replace(t, "<token>") if t else str(s)


def chat_id():
    raw = os.environ.get("TG_CHAT_ID", "").strip()
    if not raw and CONF.exists():
        raw = str(json.loads(CONF.read_text(encoding="utf-8")).get("chat_id", ""))
    if not raw:
        sys.exit("ID не привязан: задай TG_CHAT_ID или один раз запусти  tools/tg_send.py --bind СЛОВО")
    try:
        return int(raw)
    except ValueError:
        sys.exit("TG_CHAT_ID должен быть числом (это ID, а не @имя).")


def call(method, _t=30, **params):
    req = urllib.request.Request(f"{API}/bot{token()}/{method}", data=json.dumps(params).encode(),
                                 headers={"Content-Type": "application/json"})
    return _open(req, _t)


def upload(method, fields, field, path, _t=900):
    b = "----tg" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{field}"; filename="{path.name}"\r\n'
                 f"Content-Type: application/octet-stream\r\n\r\n".encode())
    parts.append(path.read_bytes())
    parts.append(f"\r\n--{b}--\r\n".encode())
    req = urllib.request.Request(f"{API}/bot{token()}/{method}", data=b"".join(parts),
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return _open(req, _t)


def _open(req, _t):
    try:
        return json.load(urllib.request.urlopen(req, timeout=_t))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"ok": False, "description": f"HTTP {e.code}"}
    except Exception as e:
        return {"ok": False, "description": mask(e)[:200]}


def owner():
    """ID владельца; чат обязан быть личным — в группы и каналы скрипт не шлёт."""
    cid = chat_id()
    r = call("getChat", chat_id=cid)
    if not r.get("ok"):
        sys.exit(f"Бот не может написать на этот ID ({mask(r.get('description'))}). "
                 "Открой бота и нажми Start, затем повтори.")
    if r["result"].get("type") != "private":
        sys.exit("Привязанный ID — не личный чат. Отправка отменена.")
    return cid


def bind(code, wait_min):
    """Ждёт кодовое слово в личке бота и запоминает ID этого чата."""
    code = code.strip().lower()
    deadline, offset = time.time() + wait_min * 60, None
    print(f"Жду слово «{code}» в личке бота (до {wait_min:g} мин)…", flush=True)
    while time.time() < deadline:
        p = {"timeout": 50, "allowed_updates": ["message"]}
        if offset:
            p["offset"] = offset
        r = call("getUpdates", _t=75, **p)
        if not r.get("ok"):
            print("getUpdates:", mask(r.get("description")), flush=True)
            time.sleep(5)
            continue
        for u in r["result"]:
            offset = u["update_id"] + 1
            m = u.get("message") or {}
            chat = m.get("chat") or {}
            if chat.get("type") == "private" and (m.get("text") or "").strip().lower() == code:
                call("getUpdates", offset=offset, timeout=0)        # отметить прочитанным
                CONF.write_text(json.dumps({"chat_id": chat["id"]}) + "\n", encoding="utf-8")
                call("sendMessage", chat_id=chat["id"],
                     text="Готово: ваш ID привязан. Серии будут приходить только в этот чат.")
                print("BOUND ok ->", CONF.name, flush=True)
                return
    sys.exit("Кодовое слово не пришло — привязка не выполнена.")


def main():
    ap = argparse.ArgumentParser(description="Отправить файл владельцу в Telegram")
    ap.add_argument("file", nargs="?")
    ap.add_argument("--caption", default=None)
    ap.add_argument("--video", action="store_true", help="отправить как видео, а не как файл")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--bind", metavar="СЛОВО")
    ap.add_argument("--wait", type=float, default=60, help="сколько минут ждать слово при --bind")
    a = ap.parse_args()

    if a.bind:
        return bind(a.bind, a.wait)
    cid = owner()
    if a.check:
        me = call("getMe")
        print(f"OK: бот @{(me.get('result') or {}).get('username')}, отправка только в привязанный личный чат.")
        return
    if not a.file:
        ap.error("укажи файл")
    path = Path(a.file)
    if not path.is_file():
        sys.exit(f"Нет файла: {path}")
    size = path.stat().st_size
    if size > 50 * 1024 * 1024:
        sys.exit(f"Файл {size / 1e6:.0f} МБ — боты Telegram принимают до 50 МБ. Собери с большим CRF: CRF=23 tools/build.sh …")
    fields = {"chat_id": cid, "caption": a.caption or path.name}
    if a.video:
        fields.update(supports_streaming="true", width=1080, height=1920)
        r = upload("sendVideo", fields, "video", path)
    else:
        r = upload("sendDocument", fields, "document", path)
    if not r.get("ok"):
        sys.exit(f"Не отправлено: {mask(r.get('description'))}")
    print(f"Отправлено в Telegram: {path.name} ({size / 1e6:.1f} МБ)")


if __name__ == "__main__":
    main()
