#!/usr/bin/env python3
"""Insere include do snippet do gateway nos confs Nginx do site I.S.O PRO."""
from pathlib import Path
import re

include_line = "    include /etc/nginx/snippets/iso-pro-atendimento-api.conf;"
marker = "iso-pro-atendimento-api.conf"
candidates = []
for base in (Path("/etc/nginx/conf.d"), Path("/etc/nginx/sites-enabled"), Path("/etc/nginx/sites-available")):
    if not base.is_dir():
        continue
    for p in base.iterdir():
        if not p.is_file():
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "isoprogestaodemateriais" in text or "iso-pro" in text.lower():
            candidates.append(p)

seen = set()
for p in candidates:
    rp = str(p.resolve())
    if rp in seen:
        continue
    seen.add(rp)
    text = p.read_text(encoding="utf-8", errors="ignore")
    if marker in text:
        print(f"nginx: ja inclui snippet em {p}")
        continue
    new_text, n = re.subn(
        r"(include\s+/etc/nginx/snippets/isopro-security-headers\.conf;)",
        r"\1\n" + include_line,
        text,
        count=0,
    )
    if n == 0:
        new_text, n = re.subn(
            r"(location\s+=\s+/index\.html\s*\{)",
            include_line + "\n\n    " + r"\1",
            text,
            count=1,
        )
    if n == 0:
        new_text, n = re.subn(
            r"(location\s+/\s*\{)",
            include_line + "\n\n    " + r"\1",
            text,
            count=1,
        )
    if n == 0:
        print(f"nginx: AVISO — nao consegui inserir include em {p}")
        continue
    bak = Path(str(p) + ".bak-atend-gw")
    bak.write_text(text, encoding="utf-8")
    p.write_text(new_text, encoding="utf-8")
    print(f"nginx: include adicionado em {p} (backup {bak.name})")
