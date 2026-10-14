import { cn } from "./cn.ts"
import { CopyButton } from "./copy-button.tsx"
import { MiddleTruncate } from "./middle-truncate.tsx"
import { StatusBadge, type ServiceStatus } from "./status.tsx"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table.tsx"

/** Où en est un enregistrement : vu chez le fournisseur DNS ou pas encore. */
export type DnsRecordStatus = "verified" | "pending" | "failed" | "not_started"

export const DNS_RECORD_STATUS_LABEL: Record<DnsRecordStatus, string> = {
  verified: "Vérifié",
  pending: "En attente",
  failed: "Échec",
  not_started: "À ajouter",
}

const STATUS_TONE: Record<DnsRecordStatus, ServiceStatus> = {
  verified: "operational",
  pending: "degraded",
  failed: "outage",
  not_started: "unknown",
}

export type DnsRecord = {
  /** Clé de ligne ; à défaut, type, nom et valeur. */
  id?: string
  /** `TXT`, `MX`, `CNAME`… */
  type: string
  /** Tel qu'il se saisit chez le fournisseur : `send`, `resend._domainkey`, `@`. */
  name: string
  value: string
  priority?: number
  /** « Auto », « 3600 ». */
  ttl?: string
  status?: DnsRecordStatus
}

function CopyableValue({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <MiddleTruncate text={value} tail={10} className="font-mono text-[13px]" />
      <CopyButton value={value} label={label} className="size-7" />
    </span>
  )
}

/**
 * Les enregistrements à poser chez le fournisseur DNS : type, nom et valeur à copier, et le
 * statut de chacun (point et libellé). Une valeur longue (DKIM) est coupée au milieu, mais le
 * bouton copie toujours la valeur entière. Priorité et TTL n'ont leur colonne que si une ligne
 * en a. Sur téléphone, le tableau défile de côté dans sa carte.
 */
export function DnsRecordTable({
  records,
  label = "Enregistrements DNS",
  surface = true,
  className,
}: {
  records: Array<DnsRecord>
  /** Nom du tableau pour les lecteurs d'écran. */
  label?: string
  /** `false` dans une carte qui a déjà sa teinte. */
  surface?: boolean
  className?: string
}): React.JSX.Element {
  const hasPriority = records.some((r) => r.priority !== undefined)
  const hasTtl = records.some((r) => r.ttl !== undefined)
  const hasStatus = records.some((r) => r.status !== undefined)

  return (
    <Table
      aria-label={label}
      surface={surface}
      data-slot="dns-record-table"
      className={cn("min-w-[44rem] table-fixed", className)}
    >
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Type</TableHead>
          <TableHead className="w-[26%]">Nom</TableHead>
          <TableHead>Valeur</TableHead>
          {hasPriority ? (
            <TableHead numeric className="w-24">
              Priorité
            </TableHead>
          ) : null}
          {hasTtl ? <TableHead className="w-20">TTL</TableHead> : null}
          {hasStatus ? <TableHead className="w-36">Statut</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => (
          <TableRow key={record.id ?? `${record.type} ${record.name} ${record.value}`}>
            <TableCell className="font-mono text-[13px] font-medium">{record.type}</TableCell>
            <TableCell>
              <CopyableValue value={record.name} label={`Copier le nom ${record.name}`} />
            </TableCell>
            <TableCell>
              <CopyableValue value={record.value} label={`Copier la valeur ${record.type}`} />
            </TableCell>
            {hasPriority ? <TableCell numeric>{record.priority ?? ""}</TableCell> : null}
            {hasTtl ? <TableCell className="text-muted-foreground tabular-nums">{record.ttl ?? ""}</TableCell> : null}
            {hasStatus ? (
              <TableCell>
                {record.status ? (
                  <StatusBadge
                    status={STATUS_TONE[record.status]}
                    label={DNS_RECORD_STATUS_LABEL[record.status]}
                    live={record.status === "pending"}
                  />
                ) : null}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
