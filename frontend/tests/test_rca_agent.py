"""RCA agent tests. Stdlib unittest; the LLM is faked unless LLM_API_KEY is set.

Run from the repo root:  python -m unittest discover -s frontend/tests -v
(needs fastapi + mangum installed, Python 3.10+)
"""
import importlib.util
import io
import json
import os
import re
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("dw_api", ROOT / "frontend" / "api" / "index.py")
api = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(api)

SAMPLE = api._process_csv((ROOT / "sample_data.csv").read_text(), "Test Store", "grow_repeat_rate", "sports")


def make_body(question="why is my repeat rate low?", with_orders=True, history=None):
    return api.AskRequest(store=SAMPLE["store"], customers=SAMPLE["customers"], metrics=SAMPLE["metrics"],
                          orders=SAMPLE["orders"] if with_orders else [], question=question,
                          history=history or [])


def tool_call(name, args, cid):
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": args}}


class ScriptedLLM:
    """Stands in for _llm_chat; returns scripted assistant messages and records calls."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.calls = []

    def __call__(self, messages, tools=None, tool_choice="auto", max_tokens=400, deadline=None):
        self.calls.append({"messages": [dict(m) for m in messages], "tool_choice": tool_choice})
        turn = self.turns.pop(0) if self.turns else self.turns_default()
        return turn(messages) if callable(turn) else turn

    def turns_default(self):
        return {"content": "", "tool_calls": [tool_call("get_metrics", "{}", "loop")]}


def answer_from_tool_results(messages):
    """Final turn that only uses numbers present in tool results, like a well-behaved model."""
    results = [json.loads(m["content"]) for m in messages if m["role"] == "tool"]
    bench = next(r for r in results if r.get("metric") == "repeat_rate")
    segs = next(r for r in results if "segments" in r)["segments"]
    return {"content": f"Repeat rate is {bench['current']}% vs the {bench['median']}% sports median; "
                       f"{segs['churned']['count']} customers have churned."}


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.ctx = api._agent_ctx(make_body())

    def test_tools_reuse_existing_numbers(self):
        m = api._tool_get_metrics(self.ctx)
        self.assertEqual(m["repeat_rate_pct"], SAMPLE["metrics"]["repeat_rate"])
        self.assertEqual(m["north_star"]["current"], SAMPLE["metrics"]["repeat_rate"])
        b = api._tool_check_benchmark(self.ctx, "repeat_rate")
        self.assertEqual(b["median"], api.BENCHMARKS["sports"]["repeat_rate"]["median"])
        self.assertEqual(b["status"], api._bench_status(SAMPLE["metrics"]["repeat_rate"], "repeat_rate", "sports"))

    def test_channel_breakdown_matches_metrics(self):
        ch = api._tool_get_channel_breakdown(self.ctx)["channels"]
        self.assertEqual({k: v["revenue"] for k, v in ch.items()}, SAMPLE["metrics"]["channel_revenue"])
        self.assertEqual(sum(v["orders"] for v in ch.values()), SAMPLE["metrics"]["total_orders"])

    def test_at_risk_is_compact_and_masked(self):
        r = api._tool_get_at_risk_customers(self.ctx, limit=3, include_churned=True)
        self.assertLessEqual(len(r["top"]), 3)
        self.assertTrue(all("***@" in c["customer"] for c in r["top"]))

    def test_compare_periods_only_with_dates(self):
        names = lambda ctx: {t["function"]["name"] for t in api._agent_tool_specs(ctx)}
        self.assertIn("compare_periods", names(self.ctx))
        no_orders = api._agent_ctx(make_body(with_orders=False))
        self.assertNotIn("compare_periods", names(no_orders))
        self.assertIn("error", api._run_tool("compare_periods", "{}", no_orders))
        r = api._tool_compare_periods(self.ctx, days=90)
        self.assertEqual(r["current"]["to"], "2025-11-01")

    def test_tool_outputs_are_small(self):
        for name in api.AGENT_TOOLS:
            out = api._compact_json(api._run_tool(name, "{}", self.ctx))
            self.assertLessEqual(len(out), api.TOOL_RESULT_MAX_CHARS + 20, name)


class AgentLoopTests(unittest.TestCase):
    def run_ask(self, llm, body=None):
        with mock.patch.dict(os.environ, {"LLM_API_KEY": "test"}), mock.patch.object(api, "_llm_chat", llm):
            return api.ask(body or make_body())

    def test_a_repeat_rate_question_uses_tools_and_cites_numbers(self):
        llm = ScriptedLLM(
            {"content": "", "tool_calls": [tool_call("check_benchmark", '{"metric":"repeat_rate"}', "c1"),
                                           tool_call("get_segments", "{}", "c2")]},
            answer_from_tool_results)
        res = self.run_ask(llm)
        self.assertEqual(res["source"], "agent")
        self.assertGreaterEqual(len(res["trace"]), 2)
        self.assertIn(f"{SAMPLE['metrics']['repeat_rate']}%", res["answer"])
        self.assertTrue(all({"tool", "args", "short_result"} <= set(t) for t in res["trace"]))

    def test_b_no_api_key_falls_back_to_rules(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            res = api.ask(make_body())
        self.assertEqual(res["source"], "rule_based")
        self.assertEqual(res["answer"], api._rule_based_answer(
            "why is my repeat rate low?", SAMPLE["metrics"], SAMPLE["customers"]))

    def test_c_malformed_tool_calls_are_recovered(self):
        def provider_rejects(messages):
            raise api.ToolCallError("malformed tool call")
        llm = ScriptedLLM(
            provider_rejects,
            {"content": "", "tool_calls": [tool_call("get_segments", "{not json", "c1"),
                                           tool_call("drop_tables", "{}", "c2")]},
            {"content": "Done."})
        res = self.run_ask(llm)
        self.assertEqual(res["answer"], "Done.")
        tool_msgs = [m for m in llm.calls[-1]["messages"] if m["role"] == "tool"]
        self.assertEqual(len(tool_msgs), 2)
        self.assertTrue(all("error" in json.loads(m["content"]) for m in tool_msgs))

    def test_d_loop_stops_at_cap(self):
        llm = ScriptedLLM()  # model asks for tools forever
        res = self.run_ask(llm)
        self.assertEqual(len(llm.calls), api.AGENT_MAX_ITERS)
        self.assertEqual(llm.calls[-1]["tool_choice"], "none")
        self.assertEqual(res["source"], "rule_based")
        self.assertEqual(len(res["trace"]), api.AGENT_MAX_ITERS - 1)

    def test_history_is_forwarded(self):
        llm = ScriptedLLM({"content": "Thanks, the price change explains it."})
        hist = [{"role": "assistant", "content": "Did anything change recently?"},
                {"role": "user", "content": "We raised prices 15% on Oct 1"},
                {"role": "system", "content": "ignored"}]
        self.run_ask(llm, make_body(question="so what now?", history=hist))
        roles = [m["role"] for m in llm.calls[0]["messages"]]
        self.assertEqual(roles, ["system", "assistant", "user", "user"])


class HTTPClientTests(unittest.TestCase):
    """Exercises the real _llm_chat against a fake urlopen."""

    @staticmethod
    def http_429():
        return urllib.error.HTTPError("u", 429, "Too Many Requests", {"retry-after": "0"}, io.BytesIO(b"{}"))

    @staticmethod
    def ok(content):
        resp = mock.MagicMock()
        resp.read.return_value = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
        resp.__enter__.return_value = resp
        return resp

    def ask_with(self, urlopen_effects):
        with mock.patch.dict(os.environ, {"LLM_API_KEY": "test"}), \
             mock.patch.object(api.urllib.request, "urlopen", side_effect=urlopen_effects) as uo, \
             mock.patch.object(api.time, "sleep") as sleep:
            return api.ask(make_body()), uo, sleep

    def test_429_then_success_retries(self):
        res, uo, sleep = self.ask_with([self.http_429(), self.ok("Recovered answer.")])
        self.assertEqual(res["answer"], "Recovered answer.")
        self.assertEqual(uo.call_count, 2)
        sleep.assert_called_once()

    def test_persistent_429_falls_back(self):
        res, uo, _ = self.ask_with([self.http_429() for _ in range(5)])
        self.assertEqual(res["source"], "rule_based")
        self.assertEqual(uo.call_count, api.LLM_MAX_RETRIES + 1)

    def test_provider_tool_use_failed_is_recovered(self):
        bad = urllib.error.HTTPError("u", 400, "Bad Request", {},
                                     io.BytesIO(b'{"error":{"code":"tool_use_failed"}}'))
        res, _, _ = self.ask_with([bad, self.ok("Answer after retry.")])
        self.assertEqual(res["answer"], "Answer after retry.")
        self.assertEqual(res["trace"][0]["tool"], "(malformed call)")

    def test_network_error_falls_back(self):
        res, _, _ = self.ask_with([urllib.error.URLError("offline")])
        self.assertEqual(res["source"], "rule_based")


@unittest.skipUnless(os.getenv("LLM_API_KEY"), "set LLM_API_KEY to run against the real provider")
class LiveTests(unittest.TestCase):
    def test_live_repeat_rate_question(self):
        res = api.ask(make_body())
        print("\n--- live answer ---\n" + res["answer"])
        for t in res["trace"]:
            print(f"  {t['tool']}({t['args']}) -> {t['short_result'][:100]}")
        self.assertEqual(res["source"], "agent")
        self.assertGreaterEqual(len(res["trace"]), 2)
        tool_text = " ".join(t["short_result"] for t in res["trace"])
        cited = [n for n in re.findall(r"\d+(?:\.\d+)?", res["answer"]) if n in tool_text]
        self.assertTrue(cited, "answer should cite at least one number from tool results")


if __name__ == "__main__":
    unittest.main()
