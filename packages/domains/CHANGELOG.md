# @hgdc/domains

## 0.1.0

### Minor Changes

- 9436ca7: Premier paquet des domaines personnalisés, repris de `convex/lib/dns.ts` de Host pour être partagé avec Status : normalisation et validation du nom saisi, domaine racine ou sous-domaine (avec les suffixes courants à deux étiquettes), zones de la plateforme, preuve TXT (`verificationName`, `verificationToken`), comparaison d'enregistrements (`cleanRecord`, `hasRecord`, `sameAddresses`), `evaluateDomain` qui ne conclut rien quand un résolveur se tait, `dnsInstructions` de la forme de `DnsRecord` de `@hgdc/ui`, et `resolve` par DNS-over-HTTPS chez deux résolveurs.
