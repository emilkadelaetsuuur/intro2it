"""Check the Ask evidence boundary and the meaning of missing observations."""

import json
import unittest

from scripts import build_ask_corpus as corpus


class AskCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = corpus.build()
        cls.records = {entry["id"]: entry for entry in cls.entries}

    def test_both_published_indexes_match_the_offline_build(self):
        for path in corpus.OUTPUTS:
            with self.subTest(path=path):
                self.assertEqual(json.loads(path.read_bytes()), self.entries)
        self.assertEqual(corpus.OUTPUTS[0].read_bytes(), corpus.OUTPUTS[1].read_bytes())

    def test_only_the_named_sources_and_their_psi_records_are_cited(self):
        urls = corpus.SOURCE_URLS | {corpus.PSI_URL + f"PSI-{n}" for n in corpus.HITS}
        self.assertEqual({entry["url"] for entry in self.entries}, urls)
        self.assertEqual(len(self.entries), len(self.records))
        for entry in self.entries:
            self.assertEqual(set(entry), {"id", "title", "url", "text"})
            self.assertIsNone(corpus.LINK.search(entry["text"]))
            self.assertLessEqual(len(entry["text"]), corpus.MAX_TEXT)

    def test_blank_fields_and_negative_observations_remain_distinct(self):
        normal = self.records["psi159-normal-r1"]["text"]
        self.assertIn("Cool flame?: [blank in source]", normal)
        self.assertIn("Hot ignition: Yes", normal)
        self.assertIn("Hot ignition: No", self.records["psi159-inverse-r1"]["text"])
        self.assertIn("Material: [blank in source]", self.records["psi99-r6"]["text"])
        self.assertIn("Nomex was not ignited", self.records["psi99-r7"]["text"])
        self.assertNotIn("Ambient pressure; mmHg: 0", self.records["psi69-r114"]["text"])

    def test_table_and_incident_qualifiers_survive_indexing(self):
        self.assertIn("25%, 50%, 80%, 100%", self.records["psi22-r29"]["text"])
        self.assertIn("13.6% to 22.2%", self.records["psi25-oxygen"]["text"])
        self.assertIn("27 Completion, 61 Disruption, 186 Extinction",
                      self.records["psi69-test-ends"]["text"])
        self.assertIn("the most likely culprit", self.records["mir-cause"]["text"])
        self.assertIn("couldn’t determine a specific source", self.records["a1-cause"]["text"])


if __name__ == "__main__":
    unittest.main()
