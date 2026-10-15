import { isReportable, sendErrorReport, type ErrorContext, type ScrubOptions } from "./index.ts"

/**
 * Côté Convex : DSN (`GLITCHTIP_DSN`), nom du déploiement (`CONVEX_CLOUD_URL`) et version
 * (`GLITCHTIP_RELEASE`, facultative) lus dans l'environnement du déploiement.
 *
 * `fetch` n'est permis que dans une action ou une action HTTP : une query ou une mutation qui
 * échoue est remontée par le navigateur (`@hgdc/errors/browser`), qui reçoit l'erreur.
 */

type Env = Record<string, string | undefined>

function readEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {}
}

/** `https://hip-monitor-87.convex.cloud` donne `hip-monitor-87`. */
export function deploymentName(cloudUrl: string | undefined): string {
  return (cloudUrl ?? "").replace(/^https?:\/\//, "").split(".")[0] || "convex"
}

export type ReportServerErrorOptions = ScrubOptions & {
  /** Remplace l'environnement du processus (tests). */
  env?: Env | undefined
  fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined
}

/**
 * Remonte une erreur depuis une action. Attendre la promesse est sûr : elle ne rejette jamais et
 * rend la main au plus tard après 5 s. Une `ConvexError` n'est pas remontée.
 */
export async function reportServerError(
  source: string,
  error: unknown,
  context?: ErrorContext,
  options: ReportServerErrorOptions = {},
): Promise<boolean> {
  const env = options.env ?? readEnv()
  if (!env.GLITCHTIP_DSN || !isReportable(error)) return false
  const sent = await sendErrorReport(
    { source, error, context },
    {
      dsn: env.GLITCHTIP_DSN,
      serverName: deploymentName(env.CONVEX_CLOUD_URL),
      platform: "node",
      release: env.GLITCHTIP_RELEASE,
      keyPrefixes: options.keyPrefixes,
      fetchImpl: options.fetchImpl,
    },
  )
  if (!sent) console.warn("[@hgdc/errors] GlitchTip n'a pas pris l'événement")
  return sent
}
