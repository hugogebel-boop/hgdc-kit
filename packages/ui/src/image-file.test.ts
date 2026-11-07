import { describe, expect, it } from "vitest"

import { imageKind, imageSize, stripJpegMetadata } from "./image-file.ts"

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe("image-file", () => {
  it("lit le type dans les octets, et refuse un SVG ou du HTML", () => {
    expect(imageKind(png(1, 1))).toBe("png")
    expect(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg")
    expect(imageKind(new TextEncoder().encode("RIFF0000WEBPVP8 "))).toBe("webp")
    expect(imageKind(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull()
    expect(imageKind(new TextEncoder().encode("<!doctype html>"))).toBeNull()
  })

  it("lit les dimensions d'un PNG", () => {
    expect(imageSize("png", png(180, 90))).toEqual({ width: 180, height: 90 })
    expect(imageSize("png", png(1, 1).slice(0, 10))).toBeNull()
  })

  it("retire les métadonnées d'un JPEG, sans toucher à l'image", () => {
    const exif = [0xff, 0xe1, 0x00, 0x04, 0x47, 0x50]
    const image = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22]
    const clean = stripJpegMetadata(new Uint8Array([0xff, 0xd8, ...exif, ...image]))
    expect([...clean]).toEqual([0xff, 0xd8, ...image])
  })
})
