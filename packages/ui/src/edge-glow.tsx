import { useEffect, useRef } from "react"

/**
 * Réglages de la lueur, choisis par Hugo le 2026-11-11 : épaisseur 47 px, houle 32 %, vitesse
 * 68 %, pulsation 56 % sur 3 s.
 */
export const EDGE_GLOW = { width: 47, swell: 0.32, speed: 0.68, pulse: 0.56, pulsePeriodMs: 3000 } as const

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"

/**
 * Une seule bande le long du bord : opaque contre le bord, effacée vers l'intérieur. Son bord
 * intérieur ondule (cinq vagues de vitesses différentes, qui ne se répètent pas), toute la bande
 * respire (pulsation), les couleurs du H tournent. La profondeur est un minimum adouci des quatre
 * distances aux bords : les coins intérieurs restent arrondis quelle que soit l'épaisseur.
 */
const FRAGMENT = `precision highp float;
uniform vec2 R;uniform float D,T,W,A,I,P,Q;
vec3 pal(float x){x=fract(x)*6.;vec3 b=vec3(.173,.471,.992),v=vec3(.451,.263,.996),k=vec3(.996,.322,.573),o=vec3(1.,.604,.275);
if(x<1.)return mix(b,v,x);if(x<2.)return mix(v,k,x-1.);if(x<3.)return mix(k,o,x-2.);if(x<4.)return mix(o,k,x-3.);if(x<5.)return mix(k,v,x-4.);return mix(v,b,x-5.);}
void main(){vec2 s=R/D;vec2 p=gl_FragCoord.xy/D;
float k=14.;float d=-k*log(exp(-p.x/k)+exp(-p.y/k)+exp(-(s.x-p.x)/k)+exp(-(s.y-p.y)/k));
vec2 c=p-s*.5;float a=atan(c.y/s.y,c.x/s.x);
float w=.55+A*(.22*sin(2.*a+1.1*T)+.16*sin(3.*a-1.7*T+1.3)+.12*sin(5.*a+2.3*T+.4)+.08*sin(8.*a-3.1*T+2.)+.05*sin(13.*a+4.2*T));
float br=.5-.5*cos(6.2832*Q);br=br*br*(3.-2.*br);
float th=max(W*w,W*.12)*I*(1.+P*(br*1.2-.4));
float f=pow(1.-smoothstep(0.,th,d),1.5);
float al=f*.92*min(I*1.5,1.)*(.88+.12*br);
gl_FragColor=vec4(pal(a/6.2832+T*.06)*al,al);}`

/** Temps des vagues (s) et phase de la pulsation (0 à 1) sur l'horloge : même image partout au même instant. */
export function edgeGlowClock(epochMs: number): { time: number; pulse: number } {
  // Ramené sous 2π × 1000 : la précision des flottants du GPU reste fine, un saut toutes les 2,5 h.
  const time = ((epochMs / 1000) * EDGE_GLOW.speed) % (Math.PI * 2000)
  const pulse =
    (((epochMs % EDGE_GLOW.pulsePeriodMs) + EDGE_GLOW.pulsePeriodMs) % EDGE_GLOW.pulsePeriodMs) /
    EDGE_GLOW.pulsePeriodMs
  return { time, pulse }
}

type Renderer = { draw: (width: number, height: number, ratio: number, intensity: number, epochMs: number) => void }

function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true })
  if (!gl) return null
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, "p")
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(program, name)
  const [uR, uD, uT, uW, uA, uI, uP, uQ] = ["R", "D", "T", "W", "A", "I", "P", "Q"].map(u)
  return {
    draw(width, height, ratio, intensity, epochMs) {
      const w = Math.round(width * ratio)
      const h = Math.round(height * ratio)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (intensity < 0.003) return
      const { time, pulse } = edgeGlowClock(epochMs)
      gl.uniform2f(uR ?? null, w, h)
      gl.uniform1f(uD ?? null, ratio)
      gl.uniform1f(uT ?? null, time)
      gl.uniform1f(uW ?? null, EDGE_GLOW.width)
      gl.uniform1f(uA ?? null, EDGE_GLOW.swell)
      gl.uniform1f(uI ?? null, intensity)
      gl.uniform1f(uP ?? null, EDGE_GLOW.pulse)
      gl.uniform1f(uQ ?? null, pulse)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}

function isShown(element: Element): boolean {
  return typeof element.checkVisibility === "function" ? element.checkVisibility({ visibilityProperty: true }) : true
}

/**
 * La lueur du chargement de page : une bande tricolore le long du bord de son parent (qui fixe la
 * taille et l'arrondi, `overflow: hidden`). Elle pousse depuis le bord quand elle devient visible et
 * s'y retire quand elle se cache ; l'animation ne tourne que pendant ce temps. Sans WebGL, avant
 * l'hydratation, ou avec le mouvement réduit (une image fixe), le CSS dessine une lueur immobile
 * (`[data-slot="edge-glow"]:not([data-live])`).
 */
export function EdgeGlow(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const renderer = createRenderer(canvas)
    if (!renderer) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)")
    canvas.dataset["live"] = ""
    let frame = 0
    let intensity = 0
    let last = performance.now()
    const tick = (now: number) => {
      frame = 0
      const shown = isShown(canvas)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const target = shown ? 1 : 0
      intensity = still.matches ? target : intensity + (target - intensity) * (1 - Math.exp(-dt * (shown ? 5 : 7)))
      // Mouvement réduit : une image fixe, toujours la même.
      const epoch = still.matches ? 0 : performance.timeOrigin + now
      const { width, height } = canvas.getBoundingClientRect()
      renderer.draw(width, height, Math.min(window.devicePixelRatio || 1, 1.5), intensity, epoch)
      if (still.matches || (!shown && intensity < 0.003)) return
      frame = requestAnimationFrame(tick)
    }
    const wake = (event?: Event) => {
      if (event && !(event.target instanceof Element && event.target.contains(canvas))) return
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    wake()
    // Le chargeur s'affiche par une transition CSS (`:has`) : elle réveille la boucle.
    document.addEventListener("transitionrun", wake)
    const onMotionChange = () => wake()
    still.addEventListener("change", onMotionChange)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("transitionrun", wake)
      still.removeEventListener("change", onMotionChange)
    }
  }, [])
  return <canvas ref={ref} data-slot="edge-glow" aria-hidden />
}
