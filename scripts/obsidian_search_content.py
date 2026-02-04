#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


OBSIDIAN_CONFIG = (
    Path.home() / "Library" / "Application Support" / "obsidian" / "obsidian.json"
)


@dataclass(frozen=True)
class Vault:
    name: str
    path: Path


def _load_obsidian_vaults() -> list[Vault]:
    try:
        data = json.loads(OBSIDIAN_CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return []

    vaults = data.get("vaults")
    if not isinstance(vaults, dict):
        return []

    out: list[tuple[bool, Vault]] = []
    for v in vaults.values():
        if not isinstance(v, dict):
            continue
        raw_path = v.get("path")
        if not raw_path:
            continue
        p = Path(str(raw_path)).expanduser()
        out.append((bool(v.get("open") is True), Vault(name=p.name, path=p)))

    # Prefer open vaults when the flag exists.
    out.sort(key=lambda t: (not t[0], t[1].name))
    return [v for _is_open, v in out]


def _resolve_vault(vault_arg: str | None) -> Vault:
    env_vault = os.environ.get("OPENCLAW_OBSIDIAN_VAULT") or os.environ.get("OBSIDIAN_VAULT")

    if vault_arg:
        p = Path(vault_arg).expanduser()
        if p.is_dir():
            return Vault(name=p.name, path=p.resolve())

        vaults = _load_obsidian_vaults()
        for v in vaults:
            if v.name == vault_arg:
                return Vault(name=v.name, path=v.path.expanduser().resolve())
        for v in vaults:
            if v.name.lower() == vault_arg.lower():
                return Vault(name=v.name, path=v.path.expanduser().resolve())

        raise ValueError(
            f"Vault '{vault_arg}' not found. Use a vault folder name or a full path."
        )

    if env_vault:
        p = Path(env_vault).expanduser()
        if p.is_dir():
            return Vault(name=p.name, path=p.resolve())

    vaults = _load_obsidian_vaults()
    if vaults:
        v0 = vaults[0]
        return Vault(name=v0.name, path=v0.path.expanduser().resolve())

    raise ValueError(
        "No vault specified and no Obsidian config found. Pass --vault <name|path>."
    )


def _smartcase(hay: str, needle: str) -> bool:
    if any(c.isupper() for c in needle):
        return needle in hay
    return needle.lower() in hay.lower()


def _search_fallback(vault_path: Path, term: str, max_results: int) -> list[dict]:
    matches: list[dict] = []
    for p in vault_path.rglob("*.md"):
        if ".obsidian" in p.parts:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue
        for i, line in enumerate(text, start=1):
            if _smartcase(line, term):
                matches.append(
                    {
                        "path": str(p),
                        "line": i,
                        "text": line.strip(),
                    }
                )
                if len(matches) >= max_results:
                    return matches
    return matches


def _search_rg(vault_path: Path, term: str, max_results: int) -> list[dict]:
    rg = shutil.which("rg")
    if not rg:
        return _search_fallback(vault_path, term, max_results)

    cmd = [
        rg,
        "--line-number",
        "--with-filename",
        "--no-heading",
        "--color",
        "never",
        "--smart-case",
        "--fixed-string",
        term,
        "--glob",
        "*.md",
        "--glob",
        "!**/.obsidian/**",
    ]
    proc = subprocess.run(cmd, cwd=str(vault_path), capture_output=True, text=True)
    if proc.returncode not in (0, 1):
        raise RuntimeError((proc.stderr or proc.stdout or "rg failed").strip())

    matches: list[dict] = []
    for raw in (proc.stdout or "").splitlines():
        if not raw.strip():
            continue
        parts = raw.split(":", 2)
        if len(parts) < 3:
            continue
        rel_path, line_s, text = parts
        try:
            line_n = int(line_s)
        except Exception:
            continue
        matches.append(
            {
                "path": str((vault_path / rel_path).resolve()),
                "line": line_n,
                "text": text.strip(),
            }
        )
        if len(matches) >= max_results:
            break
    return matches


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("term", help="Literal term to search for (smart-case).")
    ap.add_argument(
        "--vault",
        help="Vault folder name (as shown by obsidian-cli) or a full vault path.",
    )
    ap.add_argument("--max", type=int, default=80, help="Max matches (default: 80).")
    ap.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    args = ap.parse_args(argv)

    try:
        vault = _resolve_vault(args.vault)
        matches = _search_rg(vault.path, args.term, max_results=max(1, int(args.max)))
        payload = {
            "ok": True,
            "query": str(args.term),
            "vault": {"name": vault.name, "path": str(vault.path)},
            "count": len(matches),
            "matches": matches,
        }
    except Exception as e:
        payload = {"ok": False, "error": str(e)}

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        if not payload.get("ok"):
            print(f"ERROR: {payload.get('error')}", file=sys.stderr)
            return 1
        for m in payload.get("matches", []):
            print(f"{m.get('path')}:{m.get('line')}:{m.get('text')}")

    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())

