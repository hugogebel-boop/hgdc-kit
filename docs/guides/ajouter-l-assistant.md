---
owner: Hugo Gebel
last_reviewed: 2026-10-29
---

# Ajouter l'assistant à un produit

Le moteur vient de `@hgdc/assistant`, l'interface de `@hgdc/ui/assistant-view`, la place dans l'écran de `AppShell` (`assistant={{ open, onOpenChange, panel }}`). Le produit écrit sa garde, ses outils et sa consigne ; tout le reste est commun. Décision : [ADR 0019](../adr/0019-assistant-commun.md).

L'exemple suit Host : un outil en lecture (`list_deployments`), un outil à confirmer (`redeploy`). Les noms de tables (`projects`, `deployments`) et la garde `requireMember` sont ceux du produit. La maquette testée du kit (`packages/assistant/src/fixture/assistant.ts`) suit le même modèle.

## 1. Installer et brancher les tables

```sh
bun add @hgdc/assistant @anthropic-ai/sdk
```

```ts
// convex/schema.ts
import { assistantTables } from "@hgdc/assistant/convex"

export default defineSchema({
  ...assistantTables(),
  // … tables du produit
})
```

Variables Convex : `INFOMANIAK_AI_TOKEN` et `INFOMANIAK_AI_PRODUCT_ID` (Infomaniak, en Suisse, défaut), ou `BEDROCK_REGION` (une région de l'UE ou de Suisse, `EU_BEDROCK_REGIONS`, sinon Bedrock reste non branché) et `BEDROCK_API_KEY` avec `ASSISTANT_MODEL=bedrock/claude-sonnet-5-5` (Claude par AWS, profil `eu.`, dans l'UE). Il n'y a pas d'autre fournisseur : ni Anthropic en direct, ni OpenRouter ([ADR 0022](../adr/0022-assistant-souverain-et-fabrique.md)).

## 2. Les outils

Un outil reprend une action de l'interface. Le moteur impose sa classe : `read` lit (query) ; `write` modifie sans rien envoyer ni détruire ; `confirm` publie, supprime ou ne se rattrape pas, et pendant le tour il ne peut que **décrire une carte**, en lecture seule ; `send` envoie vers l'extérieur (e-mail, webhook, message) et passe, lui aussi, toujours par une carte. `private: true` et `untrusted: true` marquent ce qu'un outil rend (garde « trifecta », section 5). Le fichier n'importe rien du serveur : l'action Node et les fonctions Convex le partagent.

```ts
// convex/assistant/tools.ts
import { defineTools } from "@hgdc/assistant/tools"
import { z } from "zod"

const id = z.string().min(1).max(64).describe("Identifiant renvoyé par un outil de lecture.")

export const TOOLS = defineTools({
  list_deployments: {
    kind: "read",
    label: "Lecture des déploiements",
    description: "Derniers déploiements d'un projet, du plus récent au plus ancien, avec leur état.",
    input: z.object({ projectId: id, limit: z.number().int().min(1).max(20).optional() }),
  },
  redeploy: {
    kind: "confirm",
    label: "Redéploiement",
    description: "Propose de relancer un déploiement. La personne confirme dans l'interface.",
    input: z.object({ deploymentId: id }),
  },
})
```

## 3. Les gestionnaires, avec les droits de la personne

L'action Node n'a pas d'identité (elle est planifiée) : la personne vient de la mutation qui l'a lancée, après la garde. Chaque gestionnaire relit son rôle et l'appartenance de chaque identifiant reçu du modèle, comme la fonction publique équivalente. Les types (`ReadHandlers`, `WriteHandlers`, `ConfirmHandlers`) exigent un gestionnaire par outil de la bonne classe, avec son entrée typée.

```ts
// convex/assistantTools.ts
import type { ConfirmHandlers, ReadHandlers, Speaker, WriteHandlers } from "@hgdc/assistant/convex"
import { ConvexError } from "convex/values"

import type { MutationCtx, QueryCtx } from "./_generated/server"
import { TOOLS } from "./assistant/tools"
import { memberRole, startRedeploy } from "./deployments"

async function requireRole(ctx: QueryCtx, speaker: Speaker, roles: string[]) {
  // Relu à chaque outil : retiré de l'organisation pendant la conversation, plus rien.
  const role = await memberRole(ctx, speaker)
  if (!role || !roles.includes(role)) throw new ConvexError("Accès refusé.")
}

/** Un déploiement de l'organisation, ou « Introuvable. » : jamais celui d'une autre. */
async function ownedDeployment(ctx: QueryCtx, speaker: Speaker, raw: string) {
  const id = ctx.db.normalizeId("deployments", raw)
  const deployment = id ? await ctx.db.get(id) : null
  if (!deployment || deployment.organizationId !== speaker.organizationId) throw new ConvexError("Introuvable.")
  return deployment
}

export const READ: ReadHandlers<typeof TOOLS, QueryCtx> = {
  list_deployments: async (ctx, { projectId, limit }, speaker) => {
    await requireRole(ctx, speaker, ["member", "admin", "owner"])
    const id = ctx.db.normalizeId("projects", projectId)
    const project = id ? await ctx.db.get(id) : null
    if (!project || project.organizationId !== speaker.organizationId) throw new ConvexError("Projet introuvable.")
    const rows = await ctx.db
      .query("deployments")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(limit ?? 10)
    return rows.map((d) => ({ id: d._id, status: d.status, branch: d.branch, createdAt: d._creationTime }))
  },
}

export const WRITE: WriteHandlers<typeof TOOLS, MutationCtx> = {}

/**
 * `card` décrit la carte avec un `ctx` en lecture seule (le kit retire `insert`, `patch` et le
 * planificateur, à l'exécution aussi) ; `snapshot` reprend TOUT ce que la carte affiche. Au clic,
 * le kit redécrit la carte, compare l'empreinte SHA-256, refuse une carte de plus de 24 h, et
 * seulement alors appelle `execute`, avec la session de la personne qui clique.
 */
export const CONFIRM: ConfirmHandlers<typeof TOOLS, MutationCtx> = {
  redeploy: {
    card: async (ctx, { deploymentId }, speaker) => {
      await requireRole(ctx, speaker, ["admin", "owner"])
      const d = await ownedDeployment(ctx, speaker, deploymentId)
      return {
        summary: `Redéployer « ${d.projectName} » (${d.branch}, ${d.commit.slice(0, 7)})`,
        details: [{ label: "Environnement", value: d.environment }],
        snapshot: {
          projectName: d.projectName,
          branch: d.branch,
          commit: d.commit,
          environment: d.environment,
          status: d.status,
        },
      }
    },
    execute: async (ctx, { deploymentId }, speaker) => {
      await requireRole(ctx, speaker, ["admin", "owner"])
      const d = await ownedDeployment(ctx, speaker, deploymentId)
      if (d.status === "building") throw new ConvexError("Ce déploiement est déjà en cours.")
      await startRedeploy(ctx, d) // la même fonction que le bouton de l'interface
      return "Redéploiement lancé."
    },
  },
}
```

`execute` vérifie tout avant d'écrire : une `ConvexError` texte passe la carte en « Échec » sans annuler la transaction, toute autre erreur annule tout et la carte reste à confirmer. Les sorties d'outils sont toujours coupées à 20 000 caractères par le kit.

## 4. Les fonctions Convex : `createConsoleAssistant`

La fabrique écrit les fonctions que chaque console répétait : `status`, `threads`, `thread`, `send`, `confirm`, `cancel`, `remove` (publiques, chacune passe d'abord par la garde du produit), puis `context`, `progress`, `finish`, `runRead`, `runWrite`, `runPropose`, `sweep`, `purge`, `eraseOf`, `exportOf` (internes). Le produit exporte celles qu'il veut et garde les siennes à côté (réglage propre, statut enrichi).

```ts
// convex/assistant.ts
import { createConsoleAssistant } from "@hgdc/assistant/console"
import { v } from "convex/values"

import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server"
import { TOOLS } from "./assistant/tools"
import { CONFIRM, READ } from "./assistantTools"
import { requireMember } from "./lib/functions" // requireOrgMember de @hgdc/auth/convex, sur la copie d'Account

const assistant = createConsoleAssistant({
  builders: { query, mutation, internalQuery, internalMutation },
  // Ajoutés à chaque fonction publique ; la garde rend la personne vérifiée.
  guard: {
    args: { organizationId: v.string() },
    speaker: async (ctx: QueryCtx, { organizationId }) => {
      const { userId } = await requireMember(ctx, organizationId)
      return { organizationId, userId }
    },
  },
  tools: TOOLS,
  read: READ,
  confirm: CONFIRM,
  // La page ouverte : son identifiant vient du navigateur, `describe` le vérifie comme les autres.
  page: { args: v.object({ kind: v.literal("deployment"), id: v.string() }), describe: pageContext },
  // Défauts : module « assistant », action « assistantNode:run », 300 crédits, 90 jours, `sovereignReady()`.
})

export const { status, threads, thread, send, confirm, cancel, remove } = assistant.public
export const { context, progress, finish, runRead, runWrite, runPropose, sweep, purge, eraseOf, exportOf } =
  assistant.internal
```

Les gestionnaires (`READ`, `WRITE`, `CONFIRM`) restent dans `convex/assistantTools.ts`, exportés ; `runRead`, `runWrite` et `runPropose` ne s'y écrivent plus. Crons : `crons.interval("assistant interrompu", { minutes: 15 }, internal.assistant.sweep)` (une réponse jamais finie garde sa réservation comme coût) et `crons.daily("assistant purge", …, internal.assistant.purge)` (un lot plein se replanifie).

Sans fabrique, chaque fonction du kit (`startTurn`, `readThread`, `confirmAction`…) reste disponible dans `@hgdc/assistant/convex`, pour une console qui sort du modèle (Portal, Mail).

## 5. L'action Node : `createConsoleRunner`

```ts
// convex/assistantNode.ts
"use node"

import { createConsoleRunner } from "@hgdc/assistant/console/node"

import { internalAction } from "./_generated/server"
import { TOOLS } from "./assistant/tools"

// Fixe : elle est mise en cache avec les outils (le kit y ajoute ses règles). Le contexte du tour part à côté.
const SYSTEM = `Tu es l'assistant de Host, la plateforme de déploiement : projets, déploiements, journaux, domaines.
Tu agis pour la personne connectée, avec les outils fournis : ils reprennent ce qu'elle peut faire dans l'interface, avec ses droits.
- Français, tutoiement, phrases courtes. Jamais de grand tiret.
- N'invente jamais un identifiant : relis-le avec un outil de lecture.`

export const run = createConsoleRunner({ internalAction, tools: TOOLS, system: SYSTEM })
```

Le modèle vient de `sovereignClient()` (`@hgdc/assistant/clients`) : Infomaniak en Suisse par défaut, ou Claude par Bedrock, profil `eu.`, selon `ASSISTANT_MODEL`. Sans identifiants, le tour s'arrête sur « L'assistant n'est pas encore branché. ». Options : `context` (contexte du tour, la date par défaut), `formal` (vouvoiement), `trifecta` et `taint` (garde « trifecta », plus bas), `client` (un autre modèle du catalogue).

Bornes posées par `runTurn` : 12 étapes, 8 appels d'outils par étape, 8 minutes pour le tour entier (requête en cours coupée), le coût réservé, 20 000 caractères par résultat d'outil (balises désarmées ; `markup: true` dans `runReadTool` pour garder un corps HTML à reprendre), 700 000 octets d'historique (au-delà, la conversation est déclarée pleine).

### Garde « trifecta »

Un outil qui rend des données privées se marque `private: true` ; un outil qui rend du contenu de tiers (page explorée, e-mail reçu, réponse de webhook), `untrusted: true`. Un outil qui envoie vers l'extérieur est de classe `send` : toujours une carte, jamais exécuté pendant le tour, gestionnaire dans `CONFIRM` comme un outil `confirm`. Quand un même tour a lu les deux, la carte d'un `send` porte la mise en garde `TRIFECTA_DETAIL` ; avec `trifecta: "block"`, l'appel est refusé et le modèle le lit. `taint: { untrusted: true }` compte la demande elle-même comme non fiable (visiteur anonyme). La garde vaut pour un tour : l'historique des tours précédents n'en fait pas partie.

## 6. L'interface

```tsx
// src/features/assistant/assistant.tsx
import { AssistantLink, AssistantView } from "@hgdc/ui/assistant-view"
import Markdown from "react-markdown"

export function Assistant({ organizationId }: { organizationId: string }) {
  const [threadId, setThreadId] = useState<Id<"assistantThreads"> | null>(null)
  const status = useQuery(api.assistant.status, { organizationId })
  const threads = useQuery(api.assistant.threads, { organizationId })
  const thread = useQuery(api.assistant.thread, threadId ? { organizationId, threadId } : "skip")
  const send = useMutation(api.assistant.send)
  const confirm = useMutation(api.assistant.confirm)
  const cancel = useMutation(api.assistant.cancel)
  const remove = useMutation(api.assistant.remove)
  return (
    <AssistantView
      status={status}
      threads={threads}
      threadId={threadId}
      onThreadChange={(id) => setThreadId(id as Id<"assistantThreads"> | null)}
      thread={threadId ? thread : null}
      // Sans image (elle se chargerait sans clic) ; liens par AssistantLink (https seulement, domaine affiché).
      renderText={(text) => (
        <Markdown disallowedElements={["img"]} components={{ a: ({ href, children }) => <AssistantLink href={href}>{children}</AssistantLink> }}>
          {text}
        </Markdown>
      )}
      onSend={async (text) => setThreadId(await send({ organizationId, text, ...(threadId ? { threadId } : {}) }))}
      onConfirm={async (actionId) => {
        const outcome = await confirm({ organizationId, actionId: actionId as Id<"assistantActions"> })
        if (!outcome.ok) toast.error(outcome.message)
      }}
      onCancel={(actionId) => cancel({ organizationId, actionId: actionId as Id<"assistantActions"> })}
      onDeleteThread={(id) => remove({ organizationId, threadId: id as Id<"assistantThreads"> })}
      examples={["Pourquoi mon dernier déploiement a échoué ?", "Quels domaines attendent une vérification ?"]}
      setup={<Link to="/o/$org/settings" hash="assistant">Ouvrir les réglages</Link>}
    />
  )
}

// Dans la coque :
<AppShell assistant={{ open, onOpenChange: setOpen, panel: <Assistant organizationId={org.id} />, shortcut: "j" }} …>
```

Sans `renderText`, le panneau rend le texte brut, adresses https en liens sûrs. `subject` pose la page ouverte en pastille au-dessus de la saisie (« Déploiement 3f9c2a1 », retirable) ; `request` envoie une demande venue d'un bouton de la page (« Expliquer cet échec »). Un client qui vouvoie remplace les textes par `labels`.

## 7. Vérifier

- Tests avec `convex-test` (pas de fausse base), sur le modèle de `packages/assistant/src/convex.test.ts` du kit : par outil, une personne qui n'est **pas** membre de l'organisation et un membre sans le rôle requis (« Introuvable. » ou « Accès refusé. », jamais de donnée) ; la confirmation par un collègue ; deux confirmations simultanées ; une carte dont le contenu a changé.
- Revue adversariale (`/codex:adversarial-review`) avant la première mise en production : c'est du code d'autorisation.
