---
owner: Hugo Gebel
last_reviewed: 2026-10-15
status: accepted
---

# 0009. `@hgdc/domains` : logique commune des domaines personnalisés

## Contexte

Host sert les sites de ses clients sur leurs domaines ; Status sert leurs pages de statut sur `status.client.ch`. Les deux font la même chose avant de servir quoi que ce soit : nettoyer le nom saisi, distinguer domaine racine et sous-domaine, demander une preuve TXT, interroger le DNS sans conclure sur une panne de résolveur, puis afficher les enregistrements à poser. Host avait écrit ces règles dans `convex/lib/dns.ts` ; Status allait les recopier.

## Décision

- **Un paquet pur**, `@hgdc/domains`, une seule entrée, aucune dépendance ni variable d'environnement. Seule `resolve` touche le réseau, par `fetch` (injectable pour les tests) vers deux résolveurs DNS-over-HTTPS publics dont les réponses sont réunies.
- **Ce qui est commun y va, ce qui est propre au produit reste au produit** : le paquet ne sait rien de l'hébergeur (edge de Host, API Vercel pour Status), des tables Convex ni des rôles. Le préfixe du TXT (`agenthost`, `hgdc-status`) est un paramètre.
- **Domaine racine sans liste des suffixes publics** : une courte liste des suffixes à deux étiquettes les plus courants (`co.uk`…), suffisante pour une clientèle suisse, au lieu de 200 ko de liste complète.
- **Instructions de la forme de `DnsRecord`** (`@hgdc/ui/dns-record-table`) sans en dépendre : le paquet reste utilisable côté serveur, et les noms sont donnés relatifs au domaine enregistrable, comme les fournisseurs DNS les demandent.
- **Une absence de réponse n'est jamais une absence d'enregistrement** : `resolve` rend `null`, `evaluateDomain` rend `{ conclusive: false }`.

## Conséquences

- Status l'adopte dès sa première version de domaines personnalisés. Host l'adoptera en remplaçant `convex/lib/dns.ts` : `normalizeHostname`, `clean` (devenu `cleanRecord`), `resolve` et `verificationName("agenthost", host)` ont le même comportement ; `isApex` y gagne les suffixes à deux étiquettes.
- Premier envoi sur npm depuis le poste ([runbook](../runbooks/publier.md)), puis trusted publisher.
