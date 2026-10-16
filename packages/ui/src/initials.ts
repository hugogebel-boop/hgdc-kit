function firstLetters(value: string, separator: RegExp): string {
  return value
    .trim()
    .split(separator)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase("fr-CH")
}

/**
 * Les initiales d'un nom, pour un avatar ou une marque sans image : la première lettre des deux
 * premiers mots (« Ada Lovelace » donne « AL », « Test vérif » donne « TV »), la première lettre
 * seule pour un mot unique (« Acme » donne « A »). La même règle pour une personne et une
 * organisation, dans tous les produits. Sans nom, la partie locale de `fallback` (une adresse
 * e-mail : « jean.dupont@… » donne « JD »), puis « ? ».
 */
export function initials(name: string | null | undefined, fallback?: string | null): string {
  const fromName = firstLetters(name ?? "", /\s+/)
  if (fromName) return fromName
  return firstLetters((fallback ?? "").split("@")[0] ?? "", /[\s._+-]+/) || "?"
}
