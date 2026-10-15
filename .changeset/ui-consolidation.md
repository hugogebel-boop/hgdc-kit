---
"@hgdc/ui": minor
---

Reprend ce que les produits avaient écrit chacun, sans dépendance en plus de Base UI. Catalogue des produits (`@hgdc/ui/products` : `HGDC_PRODUCTS`, `HGDC_ACCOUNT`, `productMenuEntries`), liste par défaut d'`AccountMenu` (prop `product` pour cocher le produit ouvert, `products` la remplace toujours). `SettingsSection` avec son bouton Enregistrer. `StatusBadge` et `StatusDot` acceptent `tone` (`neutral`, `success`, `warning`, `danger`, `info`, `pending`). `CopyButton` à libellé visible (`showLabel`), `CommandMenuButton` compact (`compact`, ou `"mobile"`). Nouveaux : `Progress` et `Meter`, `RankBar`, `DateRangePicker` et `DateTimeField` (champs de date du navigateur), `ColorField` (contraste WCAG), `MoneyField` (CHF en centimes, « 1’250.50 »), `AddressFields` (adresse suisse structurée). `TimeChart` trace en pointillés un dernier point incomplet (`lastIncomplete`). Aucune API existante ne change.
