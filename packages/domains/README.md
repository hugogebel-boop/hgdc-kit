# @hgdc/domains

Domaines personnalisés des produits HGDC (`status.client.ch` pour une page de Status, `www.client.ch` pour un site de Host) : ce que la personne saisit, ce qu'elle doit poser chez son fournisseur DNS, et ce que le DNS répond. Fonctions pures, sauf `resolve` (DNS-over-HTTPS par `fetch`). Aucune dépendance, aucune variable d'environnement : Convex, navigateur, Bun et Node.

```sh
bun add @hgdc/domains
```

| Fonction                                                      | Rôle                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `normalizeHostname(input)`                                    | `https://Status.Exemple.ch/x` donne `status.exemple.ch` ; `null` si le nom n'est pas valide          |
| `isApex(host)`, `registrableDomain(host)`                     | Domaine racine (A obligatoire) ou sous-domaine (CNAME), avec les suffixes courants à deux étiquettes |
| `isWithin(host, zone)`, `isWithinAny(host, zones)`            | Refuser les domaines de la plateforme                                                                |
| `relativeName(name, host)`                                    | Nom tel qu'il se saisit chez le fournisseur : `_hgdc-status.status`, `@`                             |
| `verificationName(prefix, host)`, `verificationToken(prefix)` | Preuve de propriété : TXT `_<prefix>.<host>` = `<prefix>-verify=<32 hex>`                            |
| `cleanRecord`, `sameRecord`, `hasRecord`, `sameAddresses`     | Comparer des valeurs DNS (guillemets, TXT découpés, point final, casse)                              |
| `evaluateDomain(observed, expected)`                          | Propriété prouvée, trafic dirigé ; rien de conclu si un résolveur s'est tu                           |
| `dnsInstructions(input)`                                      | Lignes à afficher, de la forme de `DnsRecord` de `@hgdc/ui/dns-record-table`                         |
| `resolve(name, type, options?)`                               | DNS-over-HTTPS chez Cloudflare et Google, réponses réunies ; `null` si aucun n'a répondu             |

## Exemple

```ts
import { dnsInstructions, evaluateDomain, resolve, verificationName } from "@hgdc/domains"

const host = "status.exemple.ch"
const proof = { name: verificationName("hgdc-status", host), value: page.domainToken }

// Contrôle (action Convex) : une panne de résolveur ne change rien.
const [txt, cname] = await Promise.all([resolve(proof.name, "TXT"), resolve(host, "CNAME")])
const result = evaluateDomain({ txt, cname }, { token: proof.value, cnameTarget: "cname.vercel-dns.com" })
if (result.conclusive) await save(result.owned, result.pointing)

// Affichage : <DnsRecordTable records={rows} />
const rows = dnsInstructions({ hostname: host, cnameTarget: "cname.vercel-dns.com", verification: proof })
```

## Règles communes

- **Sous-domaine par CNAME, domaine racine par A.** Le DNS interdit un CNAME à la racine ; un produit qui n'accepte que des sous-domaines le dit dès la saisie (`isApex`).
- **La preuve TXT tranche.** Une revendication non prouvée ne bloque personne ; le premier qui pose le TXT garde le domaine.
- **Une panne de résolveur n'est pas une absence.** `resolve` rend `null`, `evaluateDomain` rend `{ conclusive: false }` : on ne retire jamais un domaine sur un silence.

Décision : [ADR 0009](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0009-domaines-personnalises.md).

Tous droits réservés, Hugo Gebel Développement Conseil.
