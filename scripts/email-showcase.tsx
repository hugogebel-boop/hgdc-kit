// Vitrine de @hgdc/ui/email : un exemple par type d'e-mail, à copier dans un produit. Lancé seul,
// écrit le HTML et le texte de chacun dans un dossier, pour les ouvrir dans un navigateur :
//
//   bun scripts/email-showcase.tsx [dossier]     (.email-showcase/ par défaut)
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ReactElement } from "react"

import {
  EmailButton,
  EmailCallout,
  EmailCode,
  EmailDetails,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailLink,
  EmailText,
  renderEmail,
} from "../packages/ui/src/email.tsx"

/** HGDC Account : confirmer une adresse e-mail. */
export function ConfirmationCodeEmail({ code }: { code: string }): ReactElement {
  return (
    <EmailLayout product="Account" preview={`Ton code de confirmation est ${code}. Il est valable 10 minutes.`}>
      <EmailHeading>Confirme ton adresse e-mail</EmailHeading>
      <EmailText>Saisis ce code dans Account pour confirmer ton adresse.</EmailText>
      <EmailCode code={code} />
      <EmailText small>
        Il est valable 10 minutes. Si tu n&apos;as rien demandé, ignore cet e-mail : ton compte ne change pas.
      </EmailText>
    </EmailLayout>
  )
}

/** HGDC Portal : rejoindre l'espace d'un client. */
export function InvitationEmail({
  inviter,
  organization,
  url,
}: {
  inviter: string
  organization: string
  url: string
}): ReactElement {
  return (
    <EmailLayout product="Portal" preview={`${inviter} t'invite à rejoindre ${organization} sur Portal.`}>
      <EmailHeading>
        {inviter} t&apos;invite dans {organization}
      </EmailHeading>
      <EmailText>
        Tu pourras suivre l&apos;avancement du projet, signer les documents et payer les factures au même endroit.
      </EmailText>
      <EmailDetails
        items={[
          { label: "Organisation", value: organization },
          { label: "Invité par", value: inviter },
          { label: "Rôle", value: "Membre" },
          { label: "Valable jusqu'au", value: "22 octobre 2026" },
        ]}
      />
      <EmailButton href={url}>Voir l&apos;invitation</EmailButton>
      <EmailText small>
        Tu ne connais pas {inviter} ? Ignore cet e-mail, l&apos;invitation expirera d&apos;elle-même.
      </EmailText>
    </EmailLayout>
  )
}

// Espaces insécables : « 14 h 32 » ne se coupe pas en fin de ligne.
const TIME = "14\u00a0h\u00a032"

/** HGDC Status : alerte de panne aux abonnés de la page d'un client. */
export function OutageAlertEmail({
  page,
  site,
  incidentUrl,
  unsubscribeUrl,
}: {
  page: string
  site: string
  incidentUrl: string
  unsubscribeUrl: string
}): ReactElement {
  return (
    <EmailLayout
      product="Status"
      name={`Statut · ${page}`}
      preview={`${site} ne répond plus depuis ${TIME}. On te prévient dès que c'est réparé.`}
      footer={
        <>
          Tu reçois cet e-mail parce que tu suis la page de statut « {page} ».{" "}
          <EmailLink href={unsubscribeUrl}>Me désabonner</EmailLink>
        </>
      }
    >
      <EmailHeading>{site} ne répond plus</EmailHeading>
      <EmailCallout tone="danger" title="Panne en cours">
        Nos vérifications échouent depuis {TIME}, depuis Zurich et Francfort. On t&apos;écrit dès que le site répond à
        nouveau.
      </EmailCallout>
      <EmailDetails
        items={[
          { label: "Service", value: "Site public" },
          { label: "Adresse", value: `https://${site}` },
          { label: "Début", value: `15 octobre 2026, ${TIME}` },
          { label: "Erreur", value: "Délai dépassé (30 s)" },
        ]}
      />
      <EmailButton href={incidentUrl}>Suivre l&apos;incident</EmailButton>
      <EmailDivider />
      <EmailText small>Tu n&apos;as rien à faire : l&apos;équipe est prévenue.</EmailText>
    </EmailLayout>
  )
}

/** HGDC Status : double confirmation d'un abonnement aux alertes. */
export function SubscriptionConfirmEmail({ page, confirmUrl }: { page: string; confirmUrl: string }): ReactElement {
  return (
    <EmailLayout
      product="Status"
      name={`Statut · ${page}`}
      preview={`Confirme ton abonnement aux alertes « ${page} ».`}
      footer="Si tu n'as rien demandé, ignore cet e-mail : tu ne recevras rien."
    >
      <EmailHeading>Confirme ton abonnement</EmailHeading>
      <EmailText>
        Tu as demandé à être prévenu des pannes et des maintenances sur la page de statut « {page} ». Confirme ton
        adresse pour recevoir les alertes.
      </EmailText>
      <EmailButton href={confirmUrl}>Confirmer mon abonnement</EmailButton>
      <EmailCallout tone="info" title="Le lien est valable 24 heures">
        Passé ce délai, abonne-toi à nouveau depuis la page de statut.
      </EmailCallout>
    </EmailLayout>
  )
}

export const SHOWCASE: Readonly<Record<string, ReactElement>> = {
  "code-de-confirmation": <ConfirmationCodeEmail code="482913" />,
  invitation: (
    <InvitationEmail
      inviter="Claire Dupont"
      organization="Atelier Dupont"
      url="https://portal.hgdc.ch/invitations/8fK2pQ7v?source=email&lang=fr"
    />
  ),
  "alerte-de-panne": (
    <OutageAlertEmail
      page="Atelier Dupont"
      site="atelier-dupont.ch"
      incidentUrl="https://status.hgdc.ch/atelier-dupont/incidents/2026-10-15"
      unsubscribeUrl="https://status.hgdc.ch/atelier-dupont/desabonnement?jeton=Zx81"
    />
  ),
  "confirmation-d-abonnement": (
    <SubscriptionConfirmEmail
      page="Atelier Dupont"
      confirmUrl="https://status.hgdc.ch/atelier-dupont/abonnement?jeton=Qm42&etape=confirmer"
    />
  ),
}

if (import.meta.main) {
  const out = process.argv[2] ?? ".email-showcase"
  await mkdir(out, { recursive: true })
  for (const [name, element] of Object.entries(SHOWCASE)) {
    const { html, text } = await renderEmail(element)
    await writeFile(join(out, `${name}.html`), html)
    await writeFile(join(out, `${name}.txt`), text)
    console.log(`${join(out, name)}.html (${Math.round(html.length / 1024)} ko)`)
  }
}
