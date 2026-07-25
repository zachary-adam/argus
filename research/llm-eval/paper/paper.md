# Auditable Instruments Dominate Language Models on Calibrated Geopolitical Assessment

**Zachary Adam**  
Shama Research · ARGUS  
https://shamaresearch.com/

**Version:** preprint v1.2  
**Date:** 11 July 2026  
**License:** MIT (code/data) · CC BY 4.0 (this text, unless noted)

---

## Abstract

If an LLM can draft a geopolitical brief, does it *replace* the scoring stack behind serious OSINT? We show that it does not. On three frozen event packs, we pit **Claude Haiku 4.5** and **GPT-4o-mini** (temperature 0, schema-locked JSON) against ARGUS’s open instruments—absolute country risk, rate anomalies, offline ACH, and evidence-balance confidence caps—using identical inputs. **Where assessment requires calibration, instruments dominate.** Absolute risk-band agreement collapses to **$0.11$** for both models. ACH cell agreement stays near chance-to-middling (**Claude $0.40$**, **GPT $0.53$**). Confidence caps are violated by GPT (**$0.33$ overconfident**); Claude is better restrained but still imperfect. Models only look strong on **easy** axes: anomaly labels (**$1.00$**) and risk *rank* (GPT $\rho=1$). Ordinal fluency is not calibrated assessment. We conclude that auditable instruments should **own** bands, ACH cells, and confidence; LLMs may assist triage and prose. Full replication: `research/llm-eval/`.

**Keywords:** OSINT evaluation, geopolitical risk, ACH, LLM evaluation, calibration, auditable scoring

---

## 1. Introduction

LLMs are being sold—implicitly or explicitly—as geopolitical analysts: rank theaters, fill ACH matrices, state confidence. Fluency makes that pitch easy. Tradecraft makes it false unless the model matches *inspectable* methods on the axes that decide whether a brief is usable.

This paper tests a dominance claim:

> **On fixed OSINT packs, ARGUS instruments dominate schema-locked LLMs on calibrated assessment tasks (absolute risk bands, ACH cells, confidence caps). LLMs match instruments only when the task reduces to following a rate rule or recovering rank order.**

We do **not** claim instruments equal world ground truth. We claim something stronger for *systems*: instruments are **reproducible authorities**—same inputs, same numbers, no vibe. That is the standard LLMs fail here.

**Contributions.**

1. A locked, open replication package (`research/llm-eval/`).  
2. Head-to-head results: Claude Haiku 4.5 and GPT-4o-mini vs ARGUS instruments, four tasks × three packs.  
3. A **task-wise dominance map**: instruments win calibration; models win only the soft ordinal/numeric-follow tasks.

---

## 2. Related work

**Event data and risk scoring.** Structured streams (ACLED, GDELT) and composites underpin political-risk practice. ARGUS implements absolute country risk in `lib/riskScoring.ts` / `lib/projectRisk.ts`.

**ACH.** Heuer’s method remains the falsification backbone of analytic tradecraft. We use ARGUS offline ACH (`lib/offlineIntel.ts`) as an auditable matrix—not human gold, but a fixed rule baseline LLMs must beat to claim ACH competence.

**LLM evaluation.** Schema adherence and calibration literature already warn against trusting fluent confidence. We operationalize that warning on geopolitical instruments.

**Evidence completeness.** Thin corpora must clamp confidence. ARGUS evidence-balance (`lib/evidenceBalance.ts`) emits an explicit HIGH/MODERATE/LOW cap.

---

## 3. Instruments (the authority set)

| Task | Instrument | Authority output |
|------|------------|------------------|
| Risk ranking | `projectRisk` | Score 0–100 + CRITICAL/HIGH/MEDIUM/LOW |
| Anomaly call | `rateZScore` + fixed thresholds | Surge + none/mild/strong |
| ACH matrix | `scoreACHOffline` | supports / neutral / contradicts |
| Brief confidence | `assessEvidenceBalance` | `confidenceCap` |

Thresholds were locked *ex ante*. Instruments are the reference; models are the challengers.

---

## 4. Experimental design

### 4.1 Datasets

| Pack | Character | Events | Instrument anomaly |
|------|-----------|--------|--------------------|
| `pack-conflict-rich` | Kinetic-heavy frontier | 8 | $z=6.73$ **strong** |
| `pack-maritime-mixed` | Maritime + economic mix | 4 | $z=1.73$ **mild** |
| `pack-thin` | Near-empty political corpus | 2 | $z=0$ **none** |

### 4.2 Challengers

| Arm | Model | Effort |
|-----|-------|--------|
| Claude | `claude-haiku-4-5-20251001` | low |
| OpenAI | `gpt-4o-mini` | low |

Temperature 0; shared prompts/schemas; ≤12 events; token caps 800 (2000 for ACH).

### 4.3 Metrics (how dominance is scored)

| Task | Model “wins” if… | Instrument dominates if… |
|------|------------------|--------------------------|
| Risk bands | High band agreement | Band agreement near zero / systematic inflation |
| Risk rank | High Spearman $\rho$ | (secondary; ordinal only) |
| Anomaly | Surge + severity match | Model fails the rate rule |
| ACH | High cell agreement | Cell agreement far below usable matrix quality |
| Confidence | Cap match; no overclaim | Overclaim or miss the cap |

---

## 5. Results

### 5.1 Instrument baselines (deterministic, $0 API)

| Pack | Top risk | Evidence cap | Anomaly |
|------|----------|--------------|---------|
| conflict-rich | Ukraine 46 / HIGH | MODERATE / 52 | strong |
| maritime-mixed | Ukraine 14 / LOW | MODERATE / 63 | mild |
| thin | Unknownland 1 / LOW | MODERATE / 63 | none |

### 5.2 Dominance table (primary claim)

| Axis | Claude | GPT | Winner |
|------|-------:|----:|--------|
| Absolute risk **bands** | 0.11 agree | 0.11 agree | **Instrument** |
| Risk **rank** $\rho$ | 0.75 | 1.00 | Model (ordinal only) |
| Anomaly surge / severity | 1.00 / 1.00 | 1.00 / 1.00 | Tie (models follow rate rule) |
| ACH cell agreement | 0.40 | 0.53 | **Instrument** |
| Confidence cap match | 0.67 | 0.33 | **Instrument** (Claude closer; GPT fails) |
| Overconfidence rate | **0.00** | 0.33 | Claude restrained; GPT loses |

**Reading the table.** Models do not overturn the instruments on any *calibrated* axis. They either (a) fail bands and ACH, or (b) match anomalies by parroting a numeric comparison anyone could code. Rank correlation without band agreement is **false competence**: same order, wrong magnitude.

### 5.3 What failure looks like

GPT assigned Ukraine **CRITICAL / 85** on the maritime pack while the instrument scored **LOW / 14**. Same events; different authority. That is not a quibble—it is why LLM-only risk labels are unsafe.

ACH cell agreement of **$0.40$–$0.53$** means roughly half the falsification matrix disagrees with the offline method. That is not “almost ACH.”

GPT stated **HIGH** confidence on the conflict-rich pack against a **MODERATE** evidence cap—classic overclaim under fluency.

---

## 6. Discussion: where instruments dominate

1. **Bands and ACH define the product.** Briefs live or die on absolute levels and hypothesis cells. Instruments own both in this evaluation.  
2. **Anomaly “wins” for models are cheap.** Matching $z$-thresholds shows schema following, not analytic superiority.  
3. **Rank ≠ risk.** High Spearman with ~11% band agreement is the strongest *warning* result in the paper.  
4. **Confidence is the tell.** Even when Claude avoids overclaim, it still does not justify removing the instrument cap.

**Systems implication:** ARGUS-style stacks should compute scores first and let models narrate second—not the reverse.

---

## 7. Limitations

- Pilot scale ($n=3$ packs); larger corpora can only strengthen or weaken the map—they do not erase the band/ACH gap observed here.  
- Cost-tier models (Haiku / 4o-mini); if larger models close the gap, that is an empirical update, not a reason to skip instruments today.  
- Offline ACH ≠ human gold.  
- Synthetic, English, short-form events.

---

## 8. Conclusion

**Auditable instruments dominate language models on calibrated geopolitical assessment** under this protocol. Claude and GPT match rate-based anomalies and can recover risk order; they do **not** match absolute bands or ACH cells at usable levels, and GPT overclaims confidence when the corpus looks rich. The correct architecture is instrument-authoritative scoring with optional LLM assistance—not LLM-authoritative scoring with optional formulas. Replication package: `research/llm-eval/`.

---

## Replication

```bash
npm run eval:baselines
npm run eval:llm -- --provider openai
npm run eval:llm -- --provider claude
npm run eval:score
```

Artifacts: `results/tables/{baselines,scored,summary}.json`, `results/raw/*`.  
Protocol: `PROTOCOL.md` · Decisions: `DECISIONS.md`.

---

## Acknowledgments

Built on the open ARGUS codebase (Shama Research). No classified or proprietary feeds were used.

## References (selected)

1. Heuer, R. J. *Psychology of Intelligence Analysis*.  
2. Raleigh, C., et al. Introducing ACLED. *Journal of Peace Research*.  
3. Leetaru, K., & Schrodt, P. GDELT.  
4. ARGUS instruments — shamaresearch.com / in-repo `lib/`.
