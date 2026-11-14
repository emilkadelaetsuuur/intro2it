#!/usr/bin/env python3
# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Refresh the cache-busting tags in web/index.html.

Every script and stylesheet is referenced as name?v=<first 10 hex digits of its SHA-256>, so a
browser fetches a file again only when its content changed. Run after any change under web/:

    python3 scripts/stamp_assets.py            # rewrite the tags
    python3 scripts/stamp_assets.py --check    # exit 1 if a tag is stale (used by the tests)
"""
import hashlib
import os
import re
import sys

WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
TAG = re.compile(r'((?:src|href)=")([\w./-]+\.(?:js|css))\?v=([0-9a-f]{10})(")')


def stamp(text):
    stale = []

    def fix(match):
        with open(os.path.join(WEB, match.group(2)), "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()[:10]
        if digest != match.group(3):
            stale.append(match.group(2))
        return f"{match.group(1)}{match.group(2)}?v={digest}{match.group(4)}"

    return TAG.sub(fix, text), stale


def main():
    path = os.path.join(WEB, "index.html")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    new, stale = stamp(text)
    if "--check" in sys.argv:
        if stale:
            print("stale cache tags:", ", ".join(stale))
            return 1
        return 0
    if new != text:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(new)
    print("cache tags refreshed:" if stale else "cache tags already current", ", ".join(stale))
    return 0


if __name__ == "__main__":
    sys.exit(main())
