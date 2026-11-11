import {
  createRateLimit,
  isReportable,
  sendErrorReport,
  type ErrorContext,
  type RateLimitOptions,
  type SendOptions,
} from "./index.ts"

/**
 * Serveur Bun ou Node (collecteur, agent, worker) :
 *
 * - **Jamais de latence** : l'envoi part au tour suivant de la boucle (`setTimeout`), après la
 *   réponse ; l'appelant n'attend rien et ne voit jamais d'échec.
 * - **Limité en débit** : une remontée par source et par minute, `perHour` au plus en tout.
 * - **Contexte fermé** : l'appelant ne passe qu'une source, l'erreur et un contexte plat (méthode,
 *   route sans identifiant, statut), jamais d'en-tête ni de corps de requête. Les chaînes du
 *   contexte sont nettoyées comme le message.
 */

export type ReportError = (source: string, error: unknown, context?: ErrorContext) => void

export type ErrorReporterOptions = Pick<
  SendOptions,
  "dsn" | "environment" | "serverName" | "release" | "keyPrefixes" | "fetchImpl"
> &
  RateLimitOptions & {
    send?: typeof sendErrorReport | undefined
    defer?: ((task: () => void) => void) | undefined
  }

export function createErrorReporter(options: ErrorReporterOptions): ReportError {
  const { dsn, send = sendErrorReport, defer = (task) => void setTimeout(task, 0) } = options
  if (!dsn) return () => {}
  const allow = createRateLimit(options)
  const sendOptions: SendOptions = {
    dsn,
    environment: options.environment,
    serverName: options.serverName,
    release: options.release,
    keyPrefixes: options.keyPrefixes,
    fetchImpl: options.fetchImpl,
    platform: "node",
  }

  return (source, error, context) => {
    try {
      if (!isReportable(error) || !allow(source)) return
      defer(() => {
        void send({ source, error, context }, sendOptions).catch(() => false)
      })
    } catch {
      // La télémétrie ne fait jamais échouer le serveur.
    }
  }
}

/** Segment gardé tel quel : un mot de route (`reglages`, `api`, `v1`, `oauth2`), jamais un identifiant. */
const WORD = /^(?:[a-z][a-z-]{0,30}|v\d{1,2}|oauth2)$/
const SHAPE_MAX_SEGMENTS = 8

/**
 * Forme d'un chemin, sans identifiant : `/mail/o/acme/emails/js72…` devient `/mail/o/:org/emails/:id`.
 * Le segment qui suit `/o/` est le nom d'une organisation (convention des consoles) : il part aussi.
 * Tout segment qui n'est pas un simple mot en minuscules devient `:id`.
 */
export function routeShape(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean).slice(0, SHAPE_MAX_SEGMENTS)
  const shape = segments.map((segment, index) => {
    if (index > 0 && segments[index - 1] === "o") return ":org"
    return WORD.test(segment) ? segment : ":id"
  })
  return `/${shape.join("/")}`
}

/** Un `redirect()` ou un `notFound()` lancé par le routeur, ou une `Response` : un parcours normal, pas une panne. */
function isControlFlow(error: unknown): boolean {
  if (error instanceof Response) return true
  if (typeof error !== "object" || error === null) return false
  return "isRedirect" in error || "isNotFound" in error || "redirect" in error
}

/**
 * Enrobe le traitement d'une requête par un serveur web (middleware de requête d'une console) : une
 * exception, ou une réponse 5xx, remonte avec la méthode, la forme de la route et le statut. Rien
 * d'autre ne part : ni adresse complète, ni en-tête, ni corps. Le résultat et l'exception sont rendus
 * tels quels : la remontée ne change jamais la réponse.
 */
export async function reportRequestFailure<Result extends { response: Response }>(
  report: ReportError,
  source: string,
  request: Pick<Request, "method" | "url">,
  run: () => Promise<Result>,
): Promise<Result> {
  const context = (): ErrorContext => {
    let route = "illisible"
    try {
      route = routeShape(new URL(request.url).pathname)
    } catch {
      // Adresse illisible : la forme reste « illisible ».
    }
    return { method: request.method, route }
  }
  let result: Result
  try {
    result = await run()
  } catch (error) {
    if (!isControlFlow(error)) report(source, error, context())
    throw error
  }
  const { status } = result.response
  if (status >= 500) report(source, new Error(`Réponse ${status}`), { ...context(), status })
  return result
}
