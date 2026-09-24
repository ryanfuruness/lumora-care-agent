"""Run the Lumora Care eval suite on ElevenLabs Agent Testing.

    python evals/run_evals.py                      # sync tests, run all, write evals/results/
    python evals/run_evals.py --only emergency     # run tests whose name contains "emergency"
    python evals/run_evals.py --llm gpt-5-mini     # same suite against another LLM (config override)
    python evals/run_evals.py --repeat 3           # repeat each test to measure consistency

Tests are defined in evals/suite.yaml. They are created or updated on ElevenLabs by name, run
against the deployed agent, and the results are written as Markdown and JSON.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import el  # noqa: E402

EVALS = el.ROOT / "evals"
TEST_IDS = EVALS / "test_ids.json"


def history(turns: list[dict]) -> list[dict]:
    return [{"role": t["role"], "message": t["message"], "time_in_call_secs": i * 5} for i, t in enumerate(turns)]


def build_payload(test: dict, profiles: dict, tool_ids: dict) -> dict:
    base = {"name": test["name"], "dynamic_variables": {"channel": "eval"}}
    kind = test["type"]
    if kind == "llm":
        return {**base, "type": "llm", "chat_history": history(test["chat_history"]),
                "success_condition": test["success_condition"], "success_examples": [], "failure_examples": []}
    if kind == "tool":
        params = [{"path": path, "eval": {"type": spec["type"], "expected_value": spec["value"]}} for path, spec in test["expect"].items()]
        return {**base, "type": "tool", "chat_history": history(test["chat_history"]),
                "success_condition": f"The agent calls {test['tool']} with the expected parameters.",
                "success_examples": [], "failure_examples": [],
                "tool_call_parameters": {"referenced_tool": {"id": tool_ids[test["tool"]], "type": "client"},
                                         "parameters": params, "verify_absence": False}}
    if kind == "simulation":
        profile = profiles[test["profile"]]
        mocks = {tool_ids[name]: [{"mock_result": json.dumps(result, ensure_ascii=False), "parameter_conditions": [], "is_error": False}]
                 for name, result in profile.items()}
        return {**base, "type": "simulation", "chat_history": [],
                "simulation_scenario": " ".join(test["scenario"].split()),
                "success_conditions": test["success_conditions"],
                "simulation_max_turns": test.get("max_turns", 10),
                "tool_mock_config": {"mocking_strategy": "selected", "mocked_tool_ids": list(mocks), "fallback_strategy": "raise_error"},
                "tool_mock_overrides": mocks}
    raise ValueError(f"unknown test type {kind}")


def sync_tests(tests: list[dict], profiles: dict, tool_ids: dict) -> dict:
    ids = json.loads(TEST_IDS.read_text()) if TEST_IDS.exists() else {}
    for test in tests:
        payload = build_payload(test, profiles, tool_ids)
        if test["name"] in ids:
            el.call("PUT", f"/v1/convai/agent-testing/{ids[test['name']]}", payload)
        else:
            ids[test["name"]] = el.call("POST", "/v1/convai/agent-testing/create", payload)["id"]
    TEST_IDS.write_text(json.dumps(ids, indent=2, ensure_ascii=False) + "\n")
    return ids


def run(agent_id: str, test_ids: list[str], llm: str | None, repeat: int) -> dict:
    body: dict = {"tests": [{"test_id": t} for t in test_ids]}
    if repeat > 1:
        body["repeat_count"] = repeat
    if llm:
        # The override must be a complete config: take the deployed one and swap the LLM.
        agent = el.call("GET", f"/v1/convai/agents/{agent_id}")
        agent["conversation_config"]["agent"]["prompt"]["llm"] = llm
        body["agent_config_override"] = {"conversation_config": agent["conversation_config"], "platform_settings": agent["platform_settings"]}
    invocation = el.call("POST", f"/v1/convai/agents/{agent_id}/run-tests", body)
    inv_id = invocation.get("id") or invocation.get("test_invocation_id")
    print(f"Invocation {inv_id}: waiting for {len(test_ids) * repeat} runs", flush=True)
    for _ in range(180):
        result = el.call("GET", f"/v1/convai/test-invocations/{inv_id}")
        runs = result.get("test_runs", [])
        pending = [r for r in runs if r.get("status") == "pending"]
        if runs and not pending:
            return result
        time.sleep(10)
    raise TimeoutError("test invocation did not finish in 30 minutes")


def report(suite: list[dict], ids: dict, result: dict, label: str, llm: str) -> str:
    by_id = {v: k for k, v in ids.items()}
    meta = {t["name"]: t for t in suite}
    rows = defaultdict(list)
    for r in result["test_runs"]:
        name = r.get("test_name") or by_id.get(r.get("test_id"), r.get("test_id"))
        t = meta.get(name, {})
        rationale = ((r.get("condition_result") or {}).get("rationale") or {}).get("summary", "")
        rows[t.get("capability", "Other")].append((name, t.get("language", ""), r.get("status"), rationale))

    total = sum(len(v) for v in rows.values())
    passed = sum(1 for v in rows.values() for row in v if row[2] == "passed")
    lines = [
        f"# Eval results: {label}",
        "",
        f"Run {datetime.fromtimestamp(result.get('created_at') or time.time(), timezone.utc):%Y-%m-%d %H:%M} UTC · LLM `{llm}` · **{passed}/{total} passed**",
        "",
        "| Capability | Passed |",
        "|---|---|",
    ]
    for cap, items in rows.items():
        ok = sum(1 for i in items if i[2] == "passed")
        lines.append(f"| {cap} | {ok}/{len(items)} |")
    lines += ["", "## Tests", "", "| Test | Lang | Result | Evaluator's rationale |", "|---|---|---|---|"]
    for cap, items in rows.items():
        for name, lang, status, why in items:
            mark = "pass" if status == "passed" else f"**{status}**"
            lines.append(f"| {name} | {lang} | {mark} | {why.replace('|', '/').replace(chr(10), ' ')[:300]} |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="run tests whose name contains this text")
    parser.add_argument("--llm", help="override the agent's LLM for this run")
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()

    spec = yaml.safe_load((EVALS / "suite.yaml").read_text())
    state = el.load_state()
    agent_cfg = yaml.safe_load((el.ROOT / "agent" / "agent.yaml").read_text())
    ids = sync_tests(spec["tests"], spec["profiles"], state["tools"])

    selected = [t for t in spec["tests"] if not args.only or args.only in t["name"]]
    result = run(state["agent_id"], [ids[t["name"]] for t in selected], args.llm, args.repeat)

    llm = args.llm or agent_cfg["llm"]["model"]
    label = llm if not args.only else f"{llm} ({args.only})"
    out = EVALS / "results"
    out.mkdir(exist_ok=True)
    stem = llm.replace("/", "_") + (f"-{args.only.replace(' ', '_')}" if args.only else "")
    (out / f"{stem}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    md = report(spec["tests"], ids, result, label, llm)
    (out / f"{stem}.md").write_text(md)
    print(md)


if __name__ == "__main__":
    main()
