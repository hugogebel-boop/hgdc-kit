---
"@hgdc/assistant": minor
---

Bedrock stays in the EU. `vendorReady("bedrock")` is false (with a warning) when `BEDROCK_REGION` is not in the closed `EU_BEDROCK_REGIONS` list (EU regions and Zurich; not `eu-west-2`, London), so the assistant shows as not connected instead of sending data outside the EU. `modelClient` throws for a non-EU region or a model without the `eu.` inference profile; `bedrockClient` throws for a non-EU region and checks the model on every `messages.stream` call. New helpers: `EU_BEDROCK_REGIONS`, `isEuBedrockRegion`, `isEuBedrockModel`, `assertEuBedrock`.
