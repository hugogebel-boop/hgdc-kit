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
