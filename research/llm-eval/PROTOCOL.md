# ARGUS / Shama Research — LLM vs scientific instruments

## Question

On open-source geopolitical intelligence tasks, how do frontier LLMs compare to ARGUS’s published statistical and analytic instruments — when both see the same inputs?

We report whatever we find. The paper is an evaluation, not a takedown.

## Framing (title working set)

1. *Open Instruments vs. Language Models for Geopolitical Assessment*
2. *When Models Disagree with Methods: An Evaluation of LLMs Against Statistical OSINT Instruments*
3. *Auditable Scoring Versus Generative Assessment in Geopolitical Intelligence*

Pick one after the pilot results exist.

## What we compare

### Scientific / instrument baselines (already in ARGUS)

| Instrument | Code | Output |
|------------|------|--------|
| Absolute country risk | `lib/riskScoring.ts` | 0–100 + band |
| Threat band (counts) | `lib/threatLevel.ts` | CRITICAL / ELEVATED / WATCH |
| Anomaly engine | `lib/anomalyEngine.ts` | surge alerts, z / CUSUM / FDR |
| Correlation patterns | `lib/correlationEngine.ts` | 14 named patterns |
| NATO + aged confidence | `lib/sourceWeight.ts` | grade + 0–1 confidence |
| Evidence balance | `lib/evidenceBalance.ts` | score + confidence cap |
| Formula library | `lib/formulas.ts` | 0–100 with assumptions |
| ACH offline heuristic | `lib/offlineIntel.ts` | supports / neutral / contradicts |
| Forecast Brier | `lib/forecasting.ts` | calibration / skill |
| Thread join / contradictions | `lib/threads.ts`, `lib/contradictions.ts` | auditable structures |

### LLM conditions

Same JSON event packs + mission text. Models produce structured JSON only (schema-locked).

V1 lineup (locked — see `DECISIONS.md`):

- Claude (Anthropic)
- GPT (OpenAI)

Each model: temperature 0, identical system prompt, identical schema. Open models / human ACH gold = later appendix.

## Tasks (keep to 4 for v1 paper)

1. **Risk ranking** — Given events for N countries (same window), rank / score risk. Metric: Spearman vs instrument score; band agreement (CRITICAL/HIGH/…).
2. **Anomaly call** — Given daily counts + baseline, say surge yes/no + severity. Metric: precision/recall vs engine; calibration of confidence.
3. **ACH matrix** — Fixed hypotheses + evidence set. Metric: cell agreement with (a) offline ACH, (b) optional human gold on a small subset.
4. **Brief confidence** — Model states confidence; instrument evidence-balance cap. Metric: overconfidence rate when corpus is thin.

Optional appendix (not main claims): formula variable elicitation vs `executeFormula`; pattern naming vs correlation engine.

## Data

- **Frozen corpora** in `research/llm-eval/datasets/` — JSON snapshots, no live drift.
- At least 3 theaters (e.g. maritime, conflict, election/civil).
- Thin-corpus and rich-corpus packs (to stress evidence-balance).
- License-clean / synthetic-ok packs where needed; document provenance.

No cherry-picking after looking at model failures. Lock datasets before main runs.

## Protocol (do this order)

1. **Lock schemas + metrics** (this doc).
2. **Build runner** — `research/llm-eval/` scripts: load pack → run instrument → call model → score → write row.
3. **Pilot** — 1 theater, 1–2 models, fix prompt/schema bugs.
4. **Main runs** — all packs × models; save raw responses.
5. **Analysis** — tables + figures; confidence intervals where n allows.
6. **Write** — intro, related work, methods, results, discussion, limitations.
7. **Release** — paper PDF + code + datasets (or replication package).

## What we will *not* claim

- That instruments are “ground truth” of the world (they are auditable baselines).
- That all AI is useless (only: on these tasks, under this protocol, here’s the gap).
- That one vendor is permanently worse (snapshot in time, models change).

## Paper skeleton

1. Introduction — why inspectable instruments matter for OSINT / political risk  
2. Related work — LLM eval, Admiralty, ACH (Heuer), event data (ACLED/GDELT), forecasting (Brier)  
3. Instruments — short formal definitions (cite ARGUS methods page / code)  
4. Experimental design — data, models, prompts, metrics  
5. Results — tables first, prose second  
6. Discussion — where models overclaim, where they help, implications for analysts  
7. Limitations — corpus size, English bias, no classified ground truth  
8. Conclusion  

Venue later (arXiv first is fine).

## Repo layout (to create)

```
research/llm-eval/
  PROTOCOL.md          ← this file (canonical)
  datasets/
  prompts/
  schemas/
  runners/             ← instrument + LLM
  results/raw/
  results/tables/
  analysis/
  paper/               ← LaTeX or Quarto
```

## Locked decisions

See `DECISIONS.md`. Short version: Claude+GPT, synthetic packs, skip human ACH for v1, arXiv + short site note, low API spend by design.

## Success criteria

- Outsider can re-run: same packs → same instrument numbers → same scoring of model JSON.
- Main result tables fit on two pages.
- Tone stays empirical.
