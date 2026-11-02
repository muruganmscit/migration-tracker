import { prisma } from "./prisma";

export const WAVE_MIN = 1;
export const WAVE_MAX = 4;

// Resolves a wave number (1-4) to its Wave.id. Every application needs a wave, so clearing one is refused.
// Returns undefined to leave the field untouched (used for partial updates).
export async function resolveWaveId(raw: unknown): Promise<number | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") throw new Error("wave is required");
  const value = Number(raw);
  if (!Number.isInteger(value) || value < WAVE_MIN || value > WAVE_MAX) {
    throw new Error(`wave must be an integer between ${WAVE_MIN} and ${WAVE_MAX}`);
  }
  const wave = await prisma.wave.findUnique({ where: { number: value } });
  if (!wave) throw new Error(`wave ${value} does not exist`);
  return wave.id;
}

export function parseDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid date "${raw}"`);
  return date;
}
