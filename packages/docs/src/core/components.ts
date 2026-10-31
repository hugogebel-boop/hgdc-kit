/**
 * Composants disponibles dans chaque page MDX sans `import`, comme chez Mintlify
 * (`<Note>`, `<Steps>`, `<Card>`…). Lus par le build (`build/auto-import.ts`) et par
 * l'éditeur de la console (validation, insertion par « / » ou « < », mode visuel).
 * Les props décrites ici sont celles des fichiers `src/components/*.astro`.
 */
export const MDX_COMPONENTS = [
  "Accordion",
  "AccordionGroup",
  "Badge",
  "Card",
  "CardGroup",
  "Check",
  "CodeGroup",
  "Columns",
  "Danger",
  "Expandable",
  "Frame",
  "Info",
  "Note",
  "ParamField",
  "ResponseField",
  "Step",
  "Steps",
  "Tab",
  "Tabs",
  "Tip",
  "Tooltip",
  "Warning",
] as const

export type MdxComponent = (typeof MDX_COMPONENTS)[number]

/** Composants qui vivent dans une phrase (`<Badge>`, `<Tooltip>`), les autres sont des blocs. */
export const INLINE_COMPONENTS: ReadonlyArray<MdxComponent> = ["Badge", "Tooltip"]

export function isMdxComponent(name: string): name is MdxComponent {
  return (MDX_COMPONENTS as ReadonlyArray<string>).includes(name)
}

export type ComponentProp = {
  name: string
  label: string
  type: "string" | "number" | "boolean"
  required?: boolean
}

/** Props de chaque composant, pour les formulaires du mode visuel. */
export const COMPONENT_PROPS: Record<MdxComponent, ReadonlyArray<ComponentProp>> = {
  Accordion: [
    { name: "title", label: "Titre", type: "string", required: true },
    { name: "defaultOpen", label: "Ouvert au départ", type: "boolean" },
    { name: "icon", label: "Icône", type: "string" },
  ],
  AccordionGroup: [],
  Badge: [
    { name: "color", label: "Couleur", type: "string" },
    { name: "size", label: "Taille", type: "string" },
    { name: "shape", label: "Forme", type: "string" },
    { name: "icon", label: "Icône", type: "string" },
    { name: "disabled", label: "Grisé", type: "boolean" },
  ],
  Card: [
    { name: "title", label: "Titre", type: "string", required: true },
    { name: "href", label: "Lien", type: "string" },
    { name: "icon", label: "Icône", type: "string" },
  ],
  CardGroup: [{ name: "cols", label: "Colonnes", type: "number" }],
  Check: [{ name: "title", label: "Titre", type: "string" }],
  CodeGroup: [{ name: "dropdown", label: "Liste déroulante", type: "boolean" }],
  Columns: [{ name: "cols", label: "Colonnes", type: "number" }],
  Danger: [{ name: "title", label: "Titre", type: "string" }],
  Expandable: [
    { name: "title", label: "Titre", type: "string" },
    { name: "defaultOpen", label: "Ouvert au départ", type: "boolean" },
  ],
  Frame: [{ name: "caption", label: "Légende", type: "string" }],
  Info: [{ name: "title", label: "Titre", type: "string" }],
  Note: [{ name: "title", label: "Titre", type: "string" }],
  ParamField: [
    { name: "path", label: "Paramètre de chemin", type: "string" },
    { name: "query", label: "Paramètre de requête", type: "string" },
    { name: "body", label: "Champ du corps", type: "string" },
    { name: "header", label: "En-tête", type: "string" },
    { name: "type", label: "Type", type: "string" },
    { name: "required", label: "Obligatoire", type: "boolean" },
    { name: "default", label: "Valeur par défaut", type: "string" },
    { name: "deprecated", label: "Obsolète", type: "boolean" },
  ],
  ResponseField: [
    { name: "name", label: "Nom", type: "string", required: true },
    { name: "type", label: "Type", type: "string" },
    { name: "required", label: "Obligatoire", type: "boolean" },
    { name: "default", label: "Valeur par défaut", type: "string" },
    { name: "deprecated", label: "Obsolète", type: "boolean" },
  ],
  Step: [
    { name: "title", label: "Titre", type: "string", required: true },
    { name: "icon", label: "Icône", type: "string" },
  ],
  Steps: [{ name: "titleSize", label: "Taille des titres", type: "string" }],
  Tab: [{ name: "title", label: "Titre", type: "string", required: true }],
  Tabs: [{ name: "syncKey", label: "Clé de synchronisation", type: "string" }],
  Tip: [{ name: "title", label: "Titre", type: "string" }],
  Tooltip: [
    { name: "tip", label: "Texte de la bulle", type: "string", required: true },
    { name: "headline", label: "Titre de la bulle", type: "string" },
    { name: "cta", label: "Texte du lien", type: "string" },
    { name: "href", label: "Lien", type: "string" },
  ],
  Warning: [{ name: "title", label: "Titre", type: "string" }],
}

export type BlockCategory = "Encadrés" | "Mise en page" | "Contenu" | "API"

/**
 * Blocs proposés à l'insertion, dans l'ordre du menu. `snippet` est le MDX inséré ; `$|`
 * marque l'endroit où placer le curseur. Plusieurs blocs peuvent produire le même
 * composant (colonnes à 2, 3 ou 4).
 */
export type Block = {
  id: string
  label: string
  description: string
  category: BlockCategory
  keywords: ReadonlyArray<string>
  snippet: string
}

const callout = (name: string, label: string, description: string, keywords: Array<string>): Block => ({
  id: name.toLowerCase(),
  label,
  description,
  category: "Encadrés",
  keywords: [name.toLowerCase(), ...keywords],
  snippet: `<${name}>\n$|\n</${name}>`,
})

const columns = (cols: number): Block => ({
  id: `columns-${cols}`,
  label: `${cols} colonnes`,
  description: `Cartes côte à côte, sur ${cols} colonnes.`,
  category: "Mise en page",
  keywords: ["colonnes", "columns", "grille", String(cols)],
  snippet: `<Columns cols={${cols}}>\n${Array.from({ length: cols }, (_, i) => `  <Card title="Carte ${i + 1}">${i === 0 ? "$|" : ""}</Card>`).join("\n")}\n</Columns>`,
})

export const BLOCKS: ReadonlyArray<Block> = [
  callout("Note", "Note", "Une information utile à côté du texte.", ["information", "remarque"]),
  callout("Tip", "Conseil", "Une astuce qui fait gagner du temps.", ["astuce", "conseil"]),
  callout("Info", "Info", "Un contexte ou une précision.", ["information"]),
  callout("Warning", "Attention", "Un point à ne pas manquer.", ["attention", "avertissement"]),
  callout("Danger", "Danger", "Une action risquée ou irréversible.", ["danger", "risque"]),
  callout("Check", "Validé", "Une étape réussie, un résultat attendu.", ["validé", "succès", "ok"]),
  columns(2),
  columns(3),
  columns(4),
  {
    id: "steps",
    label: "Étapes",
    description: "Une marche à suivre numérotée.",
    category: "Mise en page",
    keywords: ["étapes", "steps", "procédure"],
    snippet:
      '<Steps>\n  <Step title="Première étape">\n    $|\n  </Step>\n  <Step title="Deuxième étape">\n  </Step>\n</Steps>',
  },
  {
    id: "tabs",
    label: "Onglets",
    description: "Plusieurs variantes d'un même contenu.",
    category: "Mise en page",
    keywords: ["onglets", "tabs"],
    snippet: '<Tabs>\n  <Tab title="Premier">\n    $|\n  </Tab>\n  <Tab title="Second">\n  </Tab>\n</Tabs>',
  },
  {
    id: "accordion",
    label: "Accordéon",
    description: "Un détail replié, ouvert au clic.",
    category: "Mise en page",
    keywords: ["accordéon", "accordion", "replié", "faq"],
    snippet: '<AccordionGroup>\n  <Accordion title="Question">\n    $|\n  </Accordion>\n</AccordionGroup>',
  },
  {
    id: "card",
    label: "Carte",
    description: "Un lien mis en avant, avec un titre.",
    category: "Contenu",
    keywords: ["carte", "card", "lien"],
    snippet: '<Card title="Titre" href="/">\n  $|\n</Card>',
  },
  {
    id: "code-group",
    label: "Groupe de code",
    description: "Le même exemple en plusieurs langages.",
    category: "Contenu",
    keywords: ["code", "codegroup", "exemple"],
    snippet: "<CodeGroup>\n\n```bash npm\n$|\n```\n\n```bash bun\n\n```\n\n</CodeGroup>",
  },
  {
    id: "frame",
    label: "Cadre",
    description: "Une image ou une capture, avec sa légende.",
    category: "Contenu",
    keywords: ["cadre", "frame", "image", "capture"],
    snippet: '<Frame caption="Légende">\n  ![Description de l\'image]($|)\n</Frame>',
  },
  {
    id: "badge",
    label: "Badge",
    description: "Une étiquette dans le texte : version, statut, nouveauté.",
    category: "Contenu",
    keywords: ["badge", "étiquette", "statut", "nouveau"],
    snippet: '<Badge color="blue">$|Nouveau</Badge>',
  },
  {
    id: "tooltip",
    label: "Info-bulle",
    description: "Une explication au survol d'un mot.",
    category: "Contenu",
    keywords: ["tooltip", "info-bulle", "bulle", "définition"],
    snippet: '<Tooltip tip="Explication au survol.">$|mot</Tooltip>',
  },
  {
    id: "expandable",
    label: "Section dépliable",
    description: "Des détails repliés, comme les propriétés d'un objet.",
    category: "API",
    keywords: ["expandable", "dépliable", "propriétés", "replié"],
    snippet: '<Expandable title="propriétés">\n  $|\n</Expandable>',
  },
  {
    id: "param-field",
    label: "Paramètre d'API",
    description: "Un paramètre de requête : nom, type, obligatoire.",
    category: "API",
    keywords: ["paramfield", "paramètre", "api", "requête"],
    snippet: '<ParamField query="limite" type="number" default="20">\n  $|Nombre de résultats.\n</ParamField>',
  },
  {
    id: "response-field",
    label: "Champ de réponse",
    description: "Un champ renvoyé par l'API, avec son type.",
    category: "API",
    keywords: ["responsefield", "réponse", "champ", "api"],
    snippet: '<ResponseField name="id" type="string" required>\n  $|Identifiant de l\'objet.\n</ResponseField>',
  },
]

/** Texte à insérer et position du curseur dans ce texte. */
export function expandSnippet(snippet: string): { text: string; cursor: number } {
  const cursor = snippet.indexOf("$|")
  return cursor === -1 ? { text: snippet, cursor: snippet.length } : { text: snippet.replace("$|", ""), cursor }
}
