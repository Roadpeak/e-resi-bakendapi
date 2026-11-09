import type { UnitStatus } from '@prisma/client';

/**
 * How many of a unit type are left, reserved and sold.
 *
 * Hand-kept numbers by default. Once individual units are linked to the type
 * they are the truth — counted from those units — so the advertised "5 of 20
 * left" can never disagree with the inventory a reservation actually draws on.
 */
export interface TypeCounts {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  /** Where the numbers came from: kept by hand, or counted from linked units. */
  source: 'manual' | 'units';
}

export function typeCounts(t: {
  availableCount: number;
  reservedCount: number;
  soldCount: number;
  units?: { status: UnitStatus }[];
}): TypeCounts {
  const linked = t.units ?? [];
  if (linked.length > 0) {
    const available = linked.filter((u) => u.status === 'AVAILABLE').length;
    const reserved = linked.filter((u) => u.status === 'RESERVED').length;
    const sold = linked.filter((u) => u.status === 'SOLD').length;
    return { total: linked.length, available, reserved, sold, source: 'units' };
  }
  const available = Math.max(0, t.availableCount);
  const reserved = Math.max(0, t.reservedCount);
  const sold = Math.max(0, t.soldCount);
  return { total: available + reserved + sold, available, reserved, sold, source: 'manual' };
}

/** A type as the public sees it: its counts, never the raw hand-kept fields. */
export function publicType<T extends {
  availableCount: number;
  reservedCount: number;
  soldCount: number;
  units?: { status: UnitStatus }[];
}>(t: T) {
  const { availableCount: _a, reservedCount: _r, soldCount: _s, ...rest } = t;
  void _a; void _r; void _s;
  return { ...rest, counts: typeCounts(t) };
}
