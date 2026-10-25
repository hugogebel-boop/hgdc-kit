// Ce que chaque site de HGDC dit de l'entreprise aux agents : pages de confiance et données structurées.
// Mêmes valeurs que les mentions légales de hgdc.ch, qui font foi.

/**
 * Pages de confiance (`/about`, `/contact`, `/privacy`) que les agents cherchent sur chaque hôte : celles
 * de l'entreprise, sur hgdc.ch. Pour l'option `redirects` de `withMarkdown`.
 */
export const HGDC_TRUST_PAGES: Readonly<Record<string, string>> = {
  "/about": "https://hgdc.ch/a-propos",
  "/contact": "https://hgdc.ch/contact",
  "/privacy": "https://hgdc.ch/confidentialite",
}

/** Nœud schema.org de l'entreprise, même `@id` que sur hgdc.ch. */
export const HGDC_ORGANIZATION = {
  "@type": "Organization",
  "@id": "https://hgdc.ch/#organization",
  name: "Hugo Gebel Développement Conseil",
  alternateName: "HGDC",
  url: "https://hgdc.ch",
  description:
    "Entreprise individuelle suisse : agence web, accompagnement IA, outils en ligne de la H Collection et logiciel Stratta, pour les entreprises en Suisse.",
  email: "contact@hgdc.ch",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer service",
    email: "contact@hgdc.ch",
    url: "https://hgdc.ch/contact",
    areaServed: "CH",
    availableLanguage: "fr",
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "Chemin des Vignes 6",
    postalCode: "1135",
    addressLocality: "Denens",
    addressRegion: "VD",
    addressCountry: "CH",
  },
} as const

/** Graphe JSON-LD d'un produit : l'entreprise et le site du produit, qu'elle publie. */
export function productJsonLd(product: { name: string; url: string; description: string }): {
  "@context": string
  "@graph": Record<string, unknown>[]
} {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...HGDC_ORGANIZATION },
      {
        "@type": "WebSite",
        "@id": `${product.url}/#website`,
        url: product.url,
        name: product.name,
        description: product.description,
        inLanguage: "fr-CH",
        publisher: { "@id": HGDC_ORGANIZATION["@id"] },
      },
    ],
  }
}
