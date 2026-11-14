#!/usr/bin/env python3
"""Serve FlameGap with the "Ask the archive" endpoint backed by Claude.

    pip install -r server/requirements.txt
    export ANTHROPIC_API_KEY=...        # or any credential the Anthropic SDK can find
    python3 server/serve.py             # http://localhost:8000

Without a credential the page still works: the question box falls back to its offline search.

How an answer is made
- The whole archive (24 combustion investigations, the computed findings, the video and model
  results, the history notes) goes into the system prompt as numbered records. It is the same
  for every question, so it is cached.
- Claude must answer in a fixed JSON shape: a short answer, a list of claims each with the
  record IDs that support it, and what the archive does not cover.
- server/verify.py then checks every claim: cited IDs must exist and every number must appear
  in a cited record. The page shows the verdict next to each claim.
"""
import collections
import http.server
import json
import os
import re
import sys
import threading
import time

import anthropic

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify import verify  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
MODEL = os.environ.get("FLAME_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("FLAME_EFFORT", "medium")
MAX_Q = 600
RATE = (20, 600)  # at most 20 questions per client in 10 minutes

SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "description": "Two to five plain sentences that answer the question."},
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "One factual statement."},
                    "sources": {"type": "array", "items": {"type": "string"}, "description": "IDs of the records that support it."},
                },
                "required": ["text", "sources"],
                "additionalProperties": False,
            },
        },
        "outside_archive": {"type": "string", "description": "What the question asks that these records do not answer. Empty if nothing."},
    },
    "required": ["answer", "claims", "outside_archive"],
    "additionalProperties": False,
}

INSTRUCTIONS = """You answer questions about spacecraft fire safety using only the records below, from NASA's \
Physical Sciences Informatics combustion archive and the FlameGap analysis built on it.

Rules:
- Use only these records. If they do not answer something, say so in outside_archive instead of filling the gap.
- Every claim cites the IDs of the records that support it, exactly as written (for example PSI-25 or F-solid-gap).
- Copy numbers exactly as they appear in the cited record. Do not convert units or round.
- Keep the answer short and plain. Name experiments by their acronym.
- This informs research. It is not a basis for real spacecraft design decisions; say so if asked for one."""


def load_js(name, var):
    with open(os.path.join(WEB, name), encoding="utf-8") as fh:
        text = fh.read()
    return json.loads(text.split(f"window.{var} = ", 1)[1].rstrip().rstrip(";"))


def build_corpus():
    d = load_js("data.js", "FLAME")
    docs = collections.OrderedDict()
    for i in d["investigations"]:
        if not i["combustion"]:
            continue
        parts = [f"{i['acr'] or i['acc']}: {i['title']}", f"Platform: {i['platform']}. Dates: {i['start']} to {i['end']}.",
                 f"Runs listed in the PSI table: {i['rows']}." + (f" Oxygen in the table: {i['o2'][0]:g} to {i['o2'][1]:g} %." if i['o2'] else "")
                 + (f" Pressure in the table: {i['p'][0]:g} to {i['p'][1]:g} atm." if i['p'] else ""),
                 f"Summary: {i.get('summary', '')}", f"Objective: {i['objective']}", f"Hypothesis: {i['hypothesis']}",
                 f"Research impacts: {i['impacts']}", f"Publications listed: {i['npub']}."]
        docs[i["acc"]] = "\n".join(p for p in parts if p.strip())
    for f in d["findings"]:
        txt = [f["title"], f["claim"], "Evidence: " + f["evidence"], "Limits: " + f["limits"], "What to do: " + f["action"]]
        if f.get("quote"):
            txt.append(f"Quote ({f['quote_src']}): {f['quote']}")
        txt.append("Based on: " + ", ".join(s["acc"] for s in f["sources"]))
        docs["F-" + f["id"]] = "\n".join(txt)
    for h in d.get("history", []):
        docs["H-" + h["id"]] = "\n".join([f"{h['name']} ({h['date']})", h["what"], "Afterwards: " + h["changed"], "Today: " + h["today"]]
                                         + [f"Quote: {q['text']}" for q in h["quotes"]])
    v = d.get("video")
    if v:
        docs["VIDEO"] = "Flame spread measured from BASS-II videos by FlameGap. " + v["method"] + "\n" + "\n".join(
            f"Test {t['test']}: {t.get('material')}, oxygen {t.get('o2')} %, spread {t.get('spread_mm_s')} mm/s, confidence {t['confidence']}."
            for t in v["tests"]) + "\n" + "\n".join(f"Check {c['check']}: expected {c['expected']}, measured {c['measured']}." for c in v["validation"]["checks"])
    try:
        m = load_js("model.js", "FLAME_MODEL")
        r = m["cv"]["results"]
        docs["MODEL"] = (f"FlameGap outcome model trained on {m['n']} FLEX droplet runs. Question: {m['question']} "
                         f"{m['cv']['method']}. Full model accuracy {r['Full model']['accuracy']['mean']:.2f}, "
                         f"area under the ROC curve {r['Full model']['auc']['mean']:.2f}; always guessing the most common outcome gives "
                         f"accuracy {r['Always the most common outcome']['accuracy']['mean']:.2f}.")
    except (OSError, KeyError, ValueError):
        pass
    return docs


CORPUS = build_corpus()
SYSTEM = INSTRUCTIONS + "\n\nRECORDS\n\n" + "\n\n".join(f"[{k}]\n{v}" for k, v in CORPUS.items())

def make_client():
    """A client only if a credential resolves and the API answers; otherwise the page runs offline."""
    try:
        client = anthropic.Anthropic()
        client.models.list(limit=1)
        return client, None
    except TypeError as e:  # the SDK found no credential
        return None, "no Anthropic credential found" if "authentication" in str(e) else str(e)
    except anthropic.AuthenticationError:
        return None, "the Anthropic credential was rejected"
    except anthropic.APIConnectionError:
        return None, "could not reach the Anthropic API"
    except anthropic.APIStatusError as e:
        return None, f"the Anthropic API returned {e.status_code}"


CLIENT, CLIENT_ERROR = make_client()

_hits = collections.defaultdict(list)
_lock = threading.Lock()


def allowed(ip):
    now = time.time()
    with _lock:
        q = [t for t in _hits[ip] if now - t < RATE[1]]
        if len(q) >= RATE[0]:
            _hits[ip] = q
            return False
        q.append(now)
        _hits[ip] = q
        return True


def ask(question):
    resp = CLIENT.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": question}],
    )
    if resp.stop_reason == "refusal":
        return {"error": "The model declined to answer this question."}, 200
    if resp.stop_reason == "max_tokens":
        return {"error": "The answer was too long and was cut off. Try a narrower question."}, 200
    text = next((b.text for b in resp.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except ValueError:
        return {"error": "The model returned an answer that could not be read."}, 502
    out = verify(data, CORPUS)
    out["model"] = resp.model
    return out, 200


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEB, **k)

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/api/health":
            return self._json({"ai": CLIENT is not None, "model": MODEL, "records": len(CORPUS)})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/ask":
            return self._json({"error": "Not found"}, 404)
        if CLIENT is None:
            return self._json({"error": "No Anthropic credential on the server."}, 503)
        if not allowed(self.client_address[0]):
            return self._json({"error": "Too many questions. Wait a few minutes and try again."}, 429)
        try:
            n = int(self.headers.get("content-length", "0"))
            q = json.loads(self.rfile.read(min(n, 10000)) or b"{}").get("question", "")
        except ValueError:
            return self._json({"error": "Send JSON like {\"question\": \"...\"}."}, 400)
        q = re.sub(r"\s+", " ", str(q)).strip()[:MAX_Q]
        if not q:
            return self._json({"error": "Type a question first."}, 400)
        try:
            out, code = ask(q)
        except anthropic.RateLimitError:
            out, code = {"error": "The model is busy. Try again in a minute."}, 429
        except anthropic.AuthenticationError:
            out, code = {"error": "The server's Anthropic credential was rejected."}, 503
        except anthropic.APIStatusError as e:
            out, code = {"error": f"The model service returned an error ({e.status_code})."}, 502
        except anthropic.APIConnectionError:
            out, code = {"error": "Could not reach the model service."}, 502
        except TypeError:
            out, code = {"error": "No Anthropic credential on the server."}, 503
        return self._json(out, code)


def main():
    port = int(os.environ.get("PORT", "8000"))
    print(f"FlameGap on http://localhost:{port}  model={MODEL} effort={EFFORT}  records={len(CORPUS)}  "
          f"AI={'on' if CLIENT else 'off (' + str(CLIENT_ERROR) + ')'}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
