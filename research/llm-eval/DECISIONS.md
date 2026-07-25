# Decisions (locked for v1)

| Choice | Decision | Why |
|--------|----------|-----|
| Models | **Claude Haiku 4.5 + GPT-4o-mini** (both completed) | Cost-tier, temperature 0, schema-locked |
| Human ACH gold | **Skip for v1** | Offline ACH is the baseline; human labels = v2 |
| Output | **Both**: arXiv preprint (`paper/paper.md` + `paper.pdf`) + short shamaresearch.com note later | Paper first |
| Data | **3 synthetic frozen packs** | Reproducible, license-clean |
| API spend | **Low** — ~24 scored calls; few dollars | Caps enforced |

## What “both” means

- **Both outputs** (arXiv + site note): yes  
- **Both human gold + skip**: no — skip human for v1  
- **Both Claude + GPT**: done for v1.1  
