import { isReportable, scrub, sendErrorReport, type ErrorContext, type SendOptions } from "./index.ts"

/**
 * Erreurs du navigateur vers GlitchTip. Couvre aussi les plantages des queries et mutations
 * Convex : Convex ne les remonte pas lui-même sans le plan Pro, mais le client les reçoit, avec
 * l'identifiant de requête qui retrouve la ligne dans les journaux.
 *
 * Éteint sans DSN, et hors navigateur (rendu serveur, tests sans `window`).
 */

export type BrowserReporterOptions = Pick<
  SendOptions,
  "dsn" | "environment" | "release" | "keyPrefixes" | "fetchImpl"
> & {
  /** Une page qui boucle sur la même erreur n'envoie pas cent événements. 10 par défaut. */
  maxPerPage?: number | undefined
  /** Faux pour taire une erreur attendue. Par défaut, tout sauf `ConvexError`. */
  shouldReport?: ((error: unknown) => boolean) | undefined
}

export type BrowserReporter = {
  report: (source: string, error: unknown, context?: ErrorContext) => void
  /** Écoute les exceptions et promesses rejetées que rien n'a rattrapées. Sans effet au second appel. */
  install: () => void
}

export function createBrowserReporter(options: BrowserReporterOptions): BrowserReporter {
  const maxPerPage = options.maxPerPage ?? 10
  const shouldReport = options.shouldReport ?? isReportable
  const seen = new Set<string>()
  let installed = false

  const report = (source: string, error: unknown, context?: ErrorContext): void => {
    try {
      if (typeof window === "undefined" || !options.dsn || !shouldReport(error)) return
      const key = `${source}:${error instanceof Error ? error.message : String(error)}`
      if (seen.has(key) || seen.size >= maxPerPage) return
      seen.add(key)
      void sendErrorReport(
        // Le chemin seul : la requête et le fragment peuvent porter un jeton d'invitation.
        { source, error, context: { path: scrub(window.location.pathname, options), ...context } },
        {
          dsn: options.dsn,
          environment: options.environment,
          release: options.release,
          keyPrefixes: options.keyPrefixes,
          fetchImpl: options.fetchImpl,
          serverName: window.location.hostname,
          platform: "javascript",
        },
      )
    } catch {
      // La télémétrie ne fait jamais échouer la page.
    }
  }

  const install = (): void => {
    if (installed || typeof window === "undefined" || !options.dsn) return
    installed = true
    window.addEventListener("error", (event) => report("browser", event.error ?? event.message))
    window.addEventListener("unhandledrejection", (event) => report("browser", event.reason))
  }

  return { report, install }
}
