import type { ClassProp } from "class-variance-authority/types"
import { clsx } from "clsx"
import type { ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: Array<ClassValue>): string {
  return twMerge(clsx(inputs))
}

/**
 * Signature d'une fonction `cva`, écrite à la main : `isolatedDeclarations` exige un type
 * explicite sur tout ce qu'expose un paquet, et celui que `cva` infère ne s'écrit pas.
 */
export type Variants<V extends Record<string, string>> = (
  props?: { [K in keyof V]?: V[K] | null } & ClassProp,
) => string
