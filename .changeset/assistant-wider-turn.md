---
"@hgdc/assistant": patch
---

`runTurn`: default bounds raised to 25 steps and 25 tool calls per step (were 12 and 8), so a grouped request ("one call per item in the same reply") can propose many confirmation cards in one turn.
