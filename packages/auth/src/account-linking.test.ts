import { describe, expect, it } from "vitest"

import { HGDC_PROVIDER_ID } from "./index.ts"
import { assertSingleHgdcAccount, guardHgdcAccountLink, HgdcAccountLinkError } from "./server.ts"

const hgdc = (accountId: string) => ({ providerId: HGDC_PROVIDER_ID, accountId })

function hookContext(accounts: { providerId: string; accountId: string }[]) {
  const asked: string[] = []
  return {
    asked,
    ctx: {
      context: {
        internalAdapter: {
          findAccounts: async (userId: string) => {
            asked.push(userId)
            return accounts
          },
        },
      },
    },
  }
}

describe("assertSingleHgdcAccount", () => {
  it("refuse un nouveau sub sur une fiche déjà reliée à ID (adresse reprise par une autre personne)", () => {
    expect(() => assertSingleHgdcAccount([hgdc("sub-ancien")], hgdc("sub-nouveau"))).toThrow(HgdcAccountLinkError)
  })

  it("accepte la première liaison d'une fiche sans compte ID", () => {
    expect(() => assertSingleHgdcAccount([{ providerId: "credential", accountId: "u1" }], hgdc("sub-1"))).not.toThrow()
    expect(() => assertSingleHgdcAccount([], hgdc("sub-1"))).not.toThrow()
  })

  it("accepte le même sub", () => {
    expect(() => assertSingleHgdcAccount([hgdc("sub-1")], hgdc("sub-1"))).not.toThrow()
  })

  it("ignore un autre fournisseur", () => {
    expect(() => assertSingleHgdcAccount([hgdc("sub-1")], { providerId: "github", accountId: "42" })).not.toThrow()
  })
})

describe("guardHgdcAccountLink", () => {
  it("lit les comptes de la fiche visée et refuse un second sub", async () => {
    const { ctx, asked } = hookContext([hgdc("sub-ancien")])
    await expect(guardHgdcAccountLink({ userId: "u1", ...hgdc("sub-nouveau") }, ctx)).rejects.toThrow(
      HgdcAccountLinkError,
    )
    expect(asked).toEqual(["u1"])
  })

  it("laisse passer une inscription (fiche neuve, aucun compte)", async () => {
    const { ctx } = hookContext([])
    await expect(guardHgdcAccountLink({ userId: "u1", ...hgdc("sub-1") }, ctx)).resolves.toBeUndefined()
  })

  it("refuse un compte ID créé sans contexte de requête", async () => {
    await expect(guardHgdcAccountLink({ userId: "u1", ...hgdc("sub-1") }, null)).rejects.toThrow(HgdcAccountLinkError)
  })

  it("ne lit rien pour un autre fournisseur", async () => {
    await expect(
      guardHgdcAccountLink({ userId: "u1", providerId: "credential", accountId: "u1" }, null),
    ).resolves.toBeUndefined()
  })
})
