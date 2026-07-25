# Publish package — Instruments vs LLMs

Self-contained folder for arXiv / journal submission.

| File | Role |
|------|------|
| `main.tex` → `main.pdf` | Main paper |
| `supplement.tex` → `supplement.pdf` | Supplement |
| `refs.bib` | References |
| `data/` | Packs, prompts, schemas, scored tables, raw responses |
| `supplement/PROTOCOL.md` | Locked protocol |
| `supplement/DECISIONS.md` | Locked decisions |

## Build

```bash
cd research/paper-instruments-vs-llm
make          # builds main.pdf + supplement.pdf
make zip      # arxiv-ready zip (sources + data, no secrets)
```

Or manually:

```bash
pdflatex main && bibtex main && pdflatex main && pdflatex main
pdflatex supplement && pdflatex supplement
```

## arXiv upload checklist

1. Category: `cs.AI` (cross-list `cs.CY` optional).
2. Upload `main.tex`, `refs.bib`, and either compiled PDF or let arXiv compile.
3. Attach `supplement.pdf` as ancillary **or** merge as appendix (your choice).
4. Also upload `arxiv-source.zip` from `make zip` as ancillary for full replication data.
5. License: CC BY 4.0 for the PDF text.
6. Do **not** include `.env` or API keys.

## After arXiv ID

- Link from ARGUS README and shamaresearch.com.
- Cite: Adam, Z. (2026). *Auditable Instruments Dominate Language Models on Calibrated Geopolitical Assessment*. arXiv:XXXX.XXXXX.
