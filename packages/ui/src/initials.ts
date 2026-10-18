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

/** Nombre de teintes d'avatar (`--avatar-1` à `--avatar-7`, `styles.css`). */
export const AVATAR_TONES = 7

export type AvatarTone = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * La teinte de l'avatar à initiales d'une personne ou d'une organisation, stable : la même clé
 * (identifiant, ou adresse e-mail, sans tenir compte de la casse ni des espaces autour) donne
 * toujours la même teinte, dans tous les produits. FNV-1a 32 bits, puis modulo 7.
 */
export function avatarTone(key: string): AvatarTone {
  let hash = 0x811c9dc5
  for (const char of key.trim().toLocaleLowerCase("fr-CH")) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return ((hash % AVATAR_TONES) + 1) as AvatarTone
}
