---
owner: Hugo Gebel
last_reviewed: 2026-10-18
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

Variables Convex : `ASSISTANT_LLM_API_KEY` (clé OpenRouter `sk-or-…` du produit, plafonnée, ou Anthropic `sk-ant-…`) et `BETTER_AUTH_SECRET` (déjà là : il scelle la clé propre d'une organisation).

## 2. Les outils

Un outil reprend une action de l'interface. Le moteur impose sa classe : `read` lit (query) ; `write` modifie sans rien envoyer ni détruire ; `confirm` envoie, publie, supprime ou ne se rattrape pas, et pendant le tour il ne peut que **décrire une carte**, en lecture seule. Le fichier n'importe rien du serveur : l'action Node et les fonctions Convex le partagent.

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
import {
  runProposeTool,
  runReadTool,
  runWriteTool,
  type ConfirmHandlers,
  type ReadHandlers,
  type WriteHandlers,
} from "@hgdc/assistant/convex"
import { ConvexError, v } from "convex/values"

import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server"
import { TOOLS } from "./assistant/tools"
import { memberRole, startRedeploy } from "./deployments"

/** La personne pour qui l'assistant agit, vérifiée par la mutation `assistant.send`. */
export const vSpeaker = v.object({ organizationId: v.string(), userId: v.string() })
type Speaker = { organizationId: string; userId: string }

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

const READ: ReadHandlers<typeof TOOLS, QueryCtx> = {
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

const WRITE: WriteHandlers<typeof TOOLS, MutationCtx> = {}

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

const turnCall = {
  speaker: vSpeaker,
  threadId: v.id("assistantThreads"),
  messageId: v.id("assistantMessages"),
  name: v.string(),
  input: v.any(),
}

export const runRead = internalQuery({
  args: { speaker: vSpeaker, name: v.string(), input: v.any() },
  handler: async (ctx, { speaker, name, input }) =>
    await runReadTool(ctx, { tools: TOOLS, speaker, name, input }, READ),
})

export const runWrite = internalMutation({
  args: turnCall,
  handler: async (ctx, { speaker, ...call }) => await runWriteTool(ctx, { tools: TOOLS, speaker, ...call }, WRITE),
})

export const runPropose = internalMutation({
  args: turnCall,
  handler: async (ctx, { speaker, ...call }) => await runProposeTool(ctx, { tools: TOOLS, speaker, ...call }, CONFIRM),
})
```

`execute` vérifie tout avant d'écrire : une `ConvexError` texte passe la carte en « Échec » sans annuler la transaction, toute autre erreur annule tout et la carte reste à confirmer. Les sorties d'outils sont toujours coupées à 20 000 caractères par le kit.

## 4. Les fonctions publiques

Chaque query et mutation pose la garde, puis passe la personne vérifiée au kit.

```ts
// convex/assistant.ts
import {
  cancelAction,
  confirmAction,
  deleteThread,
  eraseUser,
  failStuckTurns,
  finishTurn,
  listThreads,
  progressMessage,
  purgeIdleThreads,
  readStatus,
  readThread,
  removeKey,
  startTurn,
  storeKey,
  turnContext,
  vFinishTurn,
  vProgress,
} from "@hgdc/assistant/convex"
import { readKey } from "@hgdc/assistant/model"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { TOOLS } from "./assistant/tools"
import { CONFIRM } from "./assistantTools"
import { requireMember } from "./lib/functions" // requireOrgMember de @hgdc/auth/convex, sur la copie d'Account

export const MONTHLY_CREDITS = 300
const platformKey = () => readKey(process.env.ASSISTANT_LLM_API_KEY) !== undefined

export const status = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId)
    return await readStatus(ctx, organizationId, { limit: MONTHLY_CREDITS, platformKey: platformKey() })
  },
})

export const threads = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    const { userId } = await requireMember(ctx, organizationId)
    return await listThreads(ctx, { organizationId, userId })
  },
})

export const thread = query({
  args: { organizationId: v.string(), threadId: v.id("assistantThreads") },
  handler: async (ctx, { organizationId, threadId }) => {
    const { userId } = await requireMember(ctx, organizationId)
    return await readThread(ctx, { organizationId, userId }, threadId)
  },
})

export const send = mutation({
  args: {
    organizationId: v.string(),
    threadId: v.optional(v.id("assistantThreads")),
    text: v.string(),
    page: v.optional(v.object({ kind: v.literal("deployment"), id: v.string() })),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.organizationId)
    const speaker = { organizationId: args.organizationId, userId }
    // Contrôle des crédits et réservation dans la même transaction.
    const turn = await startTurn(ctx, speaker, {
      threadId: args.threadId ?? null,
      text: args.text,
      limit: MONTHLY_CREDITS,
      platformKey: platformKey(),
    })
    // La page ouverte : son identifiant vient du navigateur, il est vérifié comme les autres.
    const context = args.page ? await pageContext(ctx, speaker, args.page) : ""
    await ctx.scheduler.runAfter(0, internal.assistantNode.run, {
      messageId: turn.messageId,
      threadId: turn.threadId,
      text: context ? `${turn.text}\n\n(Page ouverte) ${context}` : turn.text,
      speaker,
    })
    return turn.threadId
  },
})

export const confirm = mutation({
  args: { organizationId: v.string(), actionId: v.id("assistantActions") },
  handler: async (ctx, { organizationId, actionId }) => {
    const { userId } = await requireMember(ctx, organizationId)
    return await confirmAction(ctx, { organizationId, userId }, actionId, { tools: TOOLS, handlers: CONFIRM })
  },
})

export const cancel = mutation({
  args: { organizationId: v.string(), actionId: v.id("assistantActions") },
  handler: async (ctx, { organizationId, actionId }) => {
    const { userId } = await requireMember(ctx, organizationId)
    await cancelAction(ctx, { organizationId, userId }, actionId)
  },
})

export const remove = mutation({
  args: { organizationId: v.string(), threadId: v.id("assistantThreads") },
  handler: async (ctx, { organizationId, threadId }) => {
    const { userId } = await requireMember(ctx, organizationId)
    // Refusé tant qu'une réponse est en cours.
    await deleteThread(ctx, { organizationId, userId }, threadId)
  },
})

export const removeOrganizationKey = mutation({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId, "admin")
    await removeKey(ctx, organizationId)
  },
})

// ── Internes : appelées par l'action Node et les crons ──

export const context = internalQuery({
  args: { messageId: v.id("assistantMessages"), organizationId: v.string() },
  handler: async (ctx, args) => await turnContext(ctx, args),
})

export const progress = internalMutation({
  args: vProgress,
  handler: async (ctx, args) => await progressMessage(ctx, args),
})

export const finish = internalMutation({ args: vFinishTurn, handler: async (ctx, args) => await finishTurn(ctx, args) })

export const saveKey = internalMutation({
  args: { organizationId: v.string(), sealed: v.string(), hint: v.string(), updatedBy: v.string() },
  handler: async (ctx, args) => await storeKey(ctx, args),
})

export const sweep = internalMutation({ args: {}, handler: async (ctx) => await failStuckTurns(ctx) })

export const purge = internalMutation({
  args: {},
  handler: async (ctx) => await purgeIdleThreads(ctx, { before: Date.now() - 90 * 86_400_000 }),
})

/** Effacement d'une personne, par lots replanifiés jusqu'au bout. */
export const eraseOf = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const { done } = await eraseUser(ctx, userId)
    if (!done) await ctx.scheduler.runAfter(0, internal.assistant.eraseOf, { userId })
  },
})
```

Crons : `crons.interval("assistant interrompu", { minutes: 15 }, internal.assistant.sweep)` (une réponse jamais finie garde sa réservation comme coût) et `crons.daily("assistant purge", …, internal.assistant.purge)`. L'export d'une personne appelle `exportUser` (conversations et cartes).

## 5. L'action Node

```ts
// convex/assistantNode.ts
"use node"

import { clientFor, runTurn, verifyKey } from "@hgdc/assistant/node"
import { readKey } from "@hgdc/assistant/model"
import { keyHint, openSecret, sealSecret } from "@hgdc/assistant/secret"
import type Anthropic from "@anthropic-ai/sdk"
import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import { action, internalAction } from "./_generated/server"
import { TOOLS } from "./assistant/tools"
import { vSpeaker } from "./assistantTools"

// Fixe : elle est mise en cache avec les outils (le kit y ajoute ses règles). Le contexte du tour part à côté.
const SYSTEM = `Tu es l'assistant de Host, la plateforme de déploiement : projets, déploiements, journaux, domaines.
Tu agis pour la personne connectée, avec les outils fournis : ils reprennent ce qu'elle peut faire dans l'interface, avec ses droits.
- Français, tutoiement, phrases courtes. Jamais de grand tiret.
- N'invente jamais un identifiant : relis-le avec un outil de lecture.`

export const run = internalAction({
  args: {
    messageId: v.id("assistantMessages"),
    threadId: v.id("assistantThreads"),
    text: v.string(),
    speaker: vSpeaker,
  },
  handler: async (ctx, { messageId, threadId, text, speaker }) => {
    const { organizationId } = speaker
    const turn = await ctx.runQuery(internal.assistant.context, { messageId, organizationId })
    if (!turn) return
    const secret = process.env.BETTER_AUTH_SECRET ?? ""
    const key = turn.sealedKey
      ? await openSecret(turn.sealedKey, { secret, context: organizationId }).catch(() => undefined)
      : readKey(process.env.ASSISTANT_LLM_API_KEY)
    if (!key) {
      await ctx.runMutation(internal.assistant.finish, {
        messageId,
        organizationId,
        status: "error",
        text: "L'assistant n'est pas branché. Un administrateur peut enregistrer la clé dans les réglages.",
        tools: [],
        history: null,
        historyFull: false,
        notesDelivered: 0,
        costMicros: 0,
        inputTokens: 0,
        outputTokens: 0,
      })
      return
    }
    const { client, model, direct } = clientFor(key, { origin: "https://host.hgdc.ch", title: "Host" })
    const call = (name: string, input: Record<string, unknown>) => ({ speaker, threadId, messageId, name, input })
    const result = await runTurn({
      client,
      model,
      direct,
      system: SYSTEM,
      context: `Organisation ${organizationId}. Date : ${new Date().toISOString().slice(0, 10)}.`,
      tools: TOOLS,
      history: JSON.parse(turn.history) as Anthropic.MessageParam[],
      notes: turn.notes,
      text,
      // Le moteur choisit le gestionnaire selon la classe déclarée de l'outil.
      handlers: {
        read: (c) => ctx.runQuery(internal.assistantTools.runRead, { speaker, name: c.name, input: c.input }),
        write: (c) => ctx.runMutation(internal.assistantTools.runWrite, call(c.name, c.input)),
        propose: (c) => ctx.runMutation(internal.assistantTools.runPropose, call(c.name, c.input)),
      },
      onProgress: async ({ text, tools }) => {
        await ctx.runMutation(internal.assistant.progress, { messageId, organizationId, text, tools })
      },
    })
    // `result.failure` donne la nature d'une panne (« api », « timeout »…) : c'est elle qu'on journalise,
    // jamais l'erreur brute du fournisseur ni le texte de la conversation.
    await ctx.runMutation(internal.assistant.finish, {
      messageId,
      organizationId,
      status: result.status,
      text: result.text,
      tools: result.tools,
      history: result.history,
      historyFull: result.historyFull,
      notesDelivered: turn.notes.length,
      costMicros: result.costMicros,
      inputTokens: result.usage.input + result.usage.cacheRead + result.usage.cacheWrite,
      outputTokens: result.usage.output,
    })
  },
})

/** Clé propre de l'organisation : essayée, scellée (liée à l'organisation), jamais rendue. Administrateurs seulement. */
export const saveOrganizationKey = action({
  args: { organizationId: v.string(), key: v.string() },
  handler: async (ctx, { organizationId, key }) => {
    const { userId } = await ctx.runQuery(internal.lib.access.requireAdmin, { organizationId })
    const refused = await verifyKey(key)
    if (refused) throw new ConvexError(refused)
    const sealed = await sealSecret(key.trim(), {
      secret: process.env.BETTER_AUTH_SECRET ?? "",
      context: organizationId,
    })
    await ctx.runMutation(internal.assistant.saveKey, { organizationId, sealed, hint: keyHint(key), updatedBy: userId })
  },
})
```

Bornes posées par `runTurn` : 12 étapes, 8 appels d'outils par étape, 8 minutes pour le tour entier (requête en cours coupée), 20 000 caractères par résultat d'outil, 700 000 octets d'historique (au-delà, la conversation est déclarée pleine).

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
