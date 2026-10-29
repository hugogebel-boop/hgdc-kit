---
"@hgdc/assistant": minor
---

Bedrock stays in the EU. `vendorReady("bedrock")` is false when `BEDROCK_REGION` is not an `eu-*` region, so the assistant shows as not connected instead of sending data outside the EU. `modelClient` and `bedrockClient` throw for a non-EU region or a model without the `eu.` inference profile. New helpers: `isEuBedrockRegion`, `isEuBedrockModel`, `assertEuBedrock`.
