# SI notice: written with SI (AI) assistance (Claude, Anthropic).
"""Static security checks for the site and its server snippet.

    python3 -m unittest discover -s tests -v

The browser side has its own test, tests/browser/xss_taint.js: it appends an HTML payload to every
text value in the data and to a server reply, opens every view and reports any payload that became
a real element.

    cd web && python3 -m http.server 8765 &
    node tests/browser/xss_taint.js http://127.0.0.1:8765/ web
"""
import glob
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return fh.read()


PAGE = read("web", "index.html")
SCRIPTS = {os.path.basename(p): read("web", os.path.basename(p))
           for p in glob.glob(os.path.join(ROOT, "web", "*.js"))}
NGINX = read("deploy", "ask.nginx.conf")


def policy(text):
    return {d.split()[0]: d.split()[1:] for d in text.split(";") if d.strip()}


class Page(unittest.TestCase):
    def test_policy_allows_only_own_scripts(self):
        meta = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">', PAGE)
        self.assertIsNotNone(meta, "the page has no content security policy")
        rules = policy(meta.group(1))
        self.assertEqual(rules["default-src"], ["'none'"])
        self.assertEqual(rules["script-src"], ["'self'"])
        self.assertEqual(rules["object-src"], ["'none'"])
        self.assertEqual(rules["base-uri"], ["'none'"])
        # The policy must come before the first script or style it is meant to govern.
        self.assertLess(meta.start(), min(PAGE.index("<script"), PAGE.index("<link")))

    def test_no_inline_script_or_event_handler(self):
        for tag in re.findall(r"<script\b[^>]*>", PAGE):
            self.assertRegex(tag, r'\bsrc="[\w./-]+\.js\?v=[0-9a-f]{10}"', f"inline or foreign script: {tag}")
        self.assertEqual(re.findall(r"<[^>]+\son\w+\s*=", PAGE), [])
        self.assertNotIn("javascript:", PAGE.lower())

    def test_new_window_links_cannot_reach_the_page(self):
        for tag in re.findall(r'<a\b[^>]*target="_blank"[^>]*>', PAGE):
            self.assertIn("noopener", tag, tag)


class Scripts(unittest.TestCase):
    def test_no_code_built_from_strings(self):
        for name, text in SCRIPTS.items():
            if name == "data.js":
                continue
            for banned in (r"\beval\s*\(", r"\bnew\s+Function\b", r"document\.write", r"\.outerHTML\s*=",
                           r"set(?:Timeout|Interval)\s*\(\s*[\"'`]"):
                self.assertIsNone(re.search(banned, text), f"{name}: {banned}")

    def test_unknown_view_names_fall_back_to_the_briefing(self):
        # "#constructor" used to pass a truthiness test on the view table and leave a blank page.
        self.assertIn('if (!Object.prototype.hasOwnProperty.call(DRAW, name)) name = "brief";', SCRIPTS["tools.js"])

    def test_question_words_are_not_looked_up_on_object_prototype(self):
        for name in ("synonyms", "frequency"):
            self.assertIn(f"const {name} = Object.create(null);", SCRIPTS["ask.js"])


class Server(unittest.TestCase):
    def test_site_headers(self):
        site = NGINX.split("location = /api/ask", 1)[0]
        for header in ("Strict-Transport-Security", "Content-Security-Policy", "X-Frame-Options",
                       "Referrer-Policy", "Permissions-Policy"):
            self.assertRegex(site, rf'add_header {header} "[^"]+" always;')
        rules = policy(re.search(r'add_header Content-Security-Policy "([^"]+)"', site).group(1))
        self.assertEqual(rules["script-src"], ["'self'"])
        self.assertEqual(rules["frame-ancestors"], ["'none'"])

    def test_hsts_stays_on_this_host(self):
        # Other subdomains of the same domain belong to other projects.
        self.assertNotIn("includeSubDomains", NGINX)
        self.assertNotIn("preload", NGINX)

    def test_api_location_repeats_its_headers(self):
        # nginx drops inherited add_header lines in a location that declares its own.
        api = NGINX.split("location = /api/ask", 1)[1]
        for header in ("Strict-Transport-Security", "Content-Security-Policy", "X-Content-Type-Options"):
            self.assertIn(f"add_header {header} ", api)


if __name__ == "__main__":
    unittest.main()
