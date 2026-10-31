export type AssistantLabels = {
  welcomeTitle: string
  welcomeDescription: string
  notReadyTitle: string
  notReadyDescription: string
  exhaustedTitle: string
  exhaustedDescription: string
  placeholder: string
  placeholderBusy: string
  composerLabel: string
  history: string
  noHistory: string
  newThread: string
  deleteThread: string
  deleteConfirm: string
  deleteYes: string
  deleteNo: string
  loadError: string
  full: string
  sendError: string
  creditsLeft: (remaining: number) => string
  ownKey: (hint: string) => string
  notReadyShort: string
  detach: string
}

/** Tutoiement de la console ; un produit qui vouvoie (clients de Portal) remplace ce qu'il faut. */
export const ASSISTANT_LABELS: AssistantLabels = {
  welcomeTitle: "Qu'est-ce que je fais pour toi ?",
  welcomeDescription:
    "Je lis ce que tu vois dans l'application et je t'aide à t'y retrouver. Je te demande toujours avant de modifier ou d'envoyer quoi que ce soit.",
  notReadyTitle: "L'assistant n'est pas encore branché",
  notReadyDescription: "Il manque une clé pour le modèle. Un administrateur peut l'ajouter dans les réglages.",
  exhaustedTitle: "Les crédits du mois sont utilisés",
  exhaustedDescription:
    "Le compteur repart le 1er du mois. Un administrateur peut aussi ajouter la clé de l'organisation dans les réglages.",
  placeholder: "Demande-moi quelque chose",
  placeholderBusy: "L'assistant répond…",
  composerLabel: "Message pour l'assistant",
  history: "Conversations précédentes",
  noHistory: "Aucune conversation pour l'instant",
  newThread: "Nouvelle conversation",
  deleteThread: "Effacer cette conversation",
  deleteConfirm: "Effacer pour de bon ?",
  deleteYes: "Effacer",
  deleteNo: "Garder",
  loadError: "Cette conversation ne s'affiche pas. Réessaie dans un instant.",
  full: "Cette conversation est pleine. Ouvre une nouvelle conversation pour continuer.",
  sendError: "Le message n'est pas parti. Réessaie dans un instant.",
  creditsLeft: (remaining) =>
    remaining <= 0
      ? "Plus de crédits ce mois-ci"
      : `${remaining} crédit${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""} ce mois-ci`,
  ownKey: (hint) => `Clé de l'organisation ••••${hint}`,
  notReadyShort: "Pas encore branché",
  detach: "Ne plus parler de cette page",
}

/** Le message d'une erreur Convex (`ConvexError` avec un texte) ; sinon `fallback`. */
export function assistantErrorText(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data: unknown }).data
    if (typeof data === "string" && data.trim()) return data
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message: unknown }).message
      if (typeof message === "string" && message.trim()) return message
    }
  }
  return fallback
}
