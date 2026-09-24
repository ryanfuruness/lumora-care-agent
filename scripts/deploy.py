"""Deploy the Lumora Care agent to ElevenLabs from the files in agent/.

The repo is the source of truth: tools, knowledge base and agent settings are
synced on every run, so a change to the prompt or a tool is a normal commit.

    python scripts/deploy.py            # create or update
    python scripts/deploy.py --dry-run  # print the agent config without calling the API
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import yaml

import el

AGENT_DIR = el.ROOT / "agent"
KB_FILE = AGENT_DIR / "knowledge" / "lumora-care-handbook.md"


def sync_tools(state: dict) -> list[str]:
    """Create or update each tool in agent/tools.json, matched by name."""
    wanted = json.loads((AGENT_DIR / "tools.json").read_text())
    existing = {t["tool_config"]["name"]: t["id"] for t in el.call("GET", "/v1/convai/tools").get("tools", [])}
    ids = {}
    for tool in wanted:
        name = tool["name"]
        if name in existing:
            el.call("PATCH", f"/v1/convai/tools/{existing[name]}", {"tool_config": tool})
            ids[name] = existing[name]
            print(f"  tool updated  {name}")
        else:
            ids[name] = el.call("POST", "/v1/convai/tools", {"tool_config": tool})["id"]
            print(f"  tool created  {name}")
    state["tools"] = ids
    return list(ids.values())


def sync_knowledge(state: dict) -> dict:
    """Upload the handbook when its content changes; keep the old doc until the agent points elsewhere."""
    text = KB_FILE.read_text()
    digest = hashlib.sha256(text.encode()).hexdigest()[:12]
    kb = state.get("knowledge_base", {})
    if kb.get("sha") != digest:
        doc = el.call("POST", "/v1/convai/knowledge-base/text", {"text": text, "name": f"Lumora Care handbook ({digest})"})
        state["_stale_kb"] = kb.get("id")
        kb = {"id": doc["id"], "name": f"Lumora Care handbook ({digest})", "sha": digest}
        state["knowledge_base"] = kb
        print(f"  knowledge base uploaded ({digest})")
    else:
        print("  knowledge base unchanged")
    # Small enough (~6 KB) to load in full context: no retrieval hop on each turn.
    return {"type": "text", "name": kb["name"], "id": kb["id"], "usage_mode": "prompt"}


def system_tool(kind: str, **params) -> dict:
    return {"type": "system", "name": kind, "description": "", "params": {"system_tool_type": kind, **params}}


def build_config(cfg: dict, tool_ids: list[str], kb_ref: dict | None) -> dict:
    prompt = (AGENT_DIR / "prompt.md").read_text()
    conv = cfg["conversation"]
    return {
        "name": cfg["name"],
        "tags": cfg["tags"],
        "conversation_config": {
            "agent": {
                "language": "en",
                "first_message": cfg["first_message"]["en"],
                "max_conversation_duration_message": conv["max_duration_message"],
                "dynamic_variables": {"dynamic_variable_placeholders": cfg["dynamic_variable_defaults"]},
                "prompt": {
                    "prompt": prompt,
                    "llm": cfg["llm"]["model"],
                    "temperature": cfg["llm"]["temperature"],
                    "timezone": "Asia/Dubai",
                    "tool_ids": tool_ids,
                    "built_in_tools": {
                        "end_call": system_tool("end_call"),
                        "language_detection": system_tool("language_detection", only_at_conversation_start=False),
                    },
                    "knowledge_base": [kb_ref] if kb_ref else [],
                    "rag": {"enabled": False},
                },
            },
            "tts": {"model_id": cfg["voice"]["en"]["tts_model"], "voice_id": cfg["voice"]["en"]["voice_id"]},
            "asr": {"keywords": cfg["asr_keywords"]},
            "turn": {"turn_eagerness": conv["turn_eagerness"], "silence_end_call_timeout": conv["silence_end_call_timeout"]},
            "conversation": {"max_duration_seconds": conv["max_duration_seconds"], "file_input": {"enabled": False}},
            "language_presets": {
                "ar": {
                    "overrides": {
                        "agent": {"first_message": cfg["first_message"]["ar"]},
                        "tts": {"voice_id": cfg["voice"]["ar"]["voice_id"], "model_id": cfg["voice"]["ar"]["tts_model"]},
                    }
                }
            },
        },
        "platform_settings": {
            "auth": {
                "enable_auth": False,
                "allowlist": [{"hostname": h} for h in cfg["security"]["allowed_hosts"]],
                "require_origin_header": True,
            },
            "call_limits": {
                "agent_concurrency_limit": cfg["security"]["concurrency_limit"],
                "daily_limit": cfg["security"]["daily_call_limit"],
                "bursting_enabled": False,
            },
            "overrides": {
                "conversation_config_override": {
                    "agent": {"language": True},
                    "conversation": {"text_only": True},
                }
            },
            "evaluation": {
                "criteria": [
                    {"id": c["id"], "name": c["name"], "type": "prompt", "conversation_goal_prompt": c["prompt"], "use_knowledge_base": False}
                    for c in cfg["evaluation_criteria"]
                ]
            },
            "data_collection": cfg["data_collection"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cfg = yaml.safe_load((AGENT_DIR / "agent.yaml").read_text())
    if args.dry_run:
        print(json.dumps(build_config(cfg, ["<tool ids>"], None), indent=2, ensure_ascii=False))
        return

    state = el.load_state()
    print("Syncing tools")
    tool_ids = sync_tools(state)
    print("Syncing knowledge base")
    kb_ref = sync_knowledge(state)
    config = build_config(cfg, tool_ids, kb_ref)

    if state.get("agent_id"):
        el.call("PATCH", f"/v1/convai/agents/{state['agent_id']}", config)
        print(f"Agent updated  {state['agent_id']}")
    else:
        state["agent_id"] = el.call("POST", "/v1/convai/agents/create", config)["agent_id"]
        print(f"Agent created  {state['agent_id']}")

    agent_id = state["agent_id"]
    (el.ROOT / "docs" / "config.js").write_text(
        "// Written by scripts/deploy.py. A public agent id is safe to publish;\n"
        "// the agent only accepts sessions from the allowlisted demo domain.\n"
        f'export const AGENT_ID = "{agent_id}";\n'
    )

    stale = state.pop("_stale_kb", None)
    if stale:
        el.call("DELETE", f"/v1/convai/knowledge-base/{stale}")
    el.save_state(state)


if __name__ == "__main__":
    main()
