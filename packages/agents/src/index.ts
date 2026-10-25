export { htmlToMarkdown, pageFrontmatter, pageTitle } from "./markdown.js"
export { prefersMarkdown, varyOn, varyOnAccept } from "./negotiate.js"
export {
  API_CATALOG_PATH,
  API_CATALOG_TYPE,
  apiCatalogResponse,
  appendLinks,
  isAgentUserAgent,
  markdownTwin,
  pageOfTwin,
  type ApiCatalogEntry,
  type LinkTarget,
} from "./discovery.js"
export { linksFooter, withMarkdown, type MarkdownOptions } from "./fetch.js"
export { canonicalLink, injectIntoHead, jsonLdScript } from "./head.js"
export { HGDC_DISCOVERY_FILES, HGDC_ORGANIZATION, HGDC_TRUST_PAGES, productJsonLd } from "./hgdc.js"
