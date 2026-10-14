/**
 * Tracés SVG partagés par `TimeChart` et `Sparkline`. Repère de `values.length` unités de large
 * sur 100 de haut : le point `i` est au centre de sa colonne (`i + 0.5`), `min` en bas, `max` en
 * haut. Le SVG s'étire ensuite (`preserveAspectRatio="none"`).
 */

function y(value: number, min: number, max: number): number {
  const range = max - min
  return range > 0 ? 100 - ((value - min) / range) * 100 : 50
}

/** Une ligne, interrompue là où une valeur manque (`null`). */
export function linePath(values: ReadonlyArray<number | null>, max: number, min = 0): string {
  let d = ""
  let open = false
  values.forEach((v, i) => {
    if (v === null) {
      open = false
      return
    }
    d += `${open ? "L" : "M"}${i + 0.5} ${y(v, min, max)}`
    open = true
  })
  return d
}

/** L'aire sous la ligne : une forme par segment continu, fermée sur le bas du repère. */
export function areaPath(values: ReadonlyArray<number | null>, max: number, min = 0): string {
  const parts: Array<string> = []
  let start = -1
  const close = (end: number) => {
    if (start < 0) return
    const top = values
      .slice(start, end)
      .map((v, j) => `${j === 0 ? "M" : "L"}${start + j + 0.5} ${y(v ?? min, min, max)}`)
      .join("")
    parts.push(`${top}L${end - 1 + 0.5} 100L${start + 0.5} 100Z`)
    start = -1
  }
  values.forEach((v, i) => {
    if (v === null) close(i)
    else if (start < 0) start = i
  })
  close(values.length)
  return parts.join("")
}
