import { campusHour, DAY_MS, hoursWithin, LAB_CLOSE_HOUR, LAB_OPEN_HOUR, toInterval } from './time.js';
import type { Booking, Department, Equipment, Interval } from './types.js';

export const OVERUSED_THRESHOLD = 0.75;
export const UNDERUSED_THRESHOLD = 0.25;

export interface EquipmentUtilisation {
  equipmentId: string;
  name: string;
  category: string;
  departmentId: string;
  bookedHours: number;
  capacityHours: number;
  /** bookedHours / capacityHours, 0 when unavailable. */
  rate: number;
}

export interface UtilisationReport {
  window: { start: string; end: string };
  equipment: EquipmentUtilisation[];
  departments: { departmentId: string; name: string; rate: number }[];
  /** Booked hours per lab hour of day (09–17), for spotting peak times. */
  peakHours: { hour: number; bookedHours: number }[];
  suggestions: string[];
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0);

/**
 * Utilisation of every item over `window` plus actionable rebalancing suggestions:
 * when an item is over-used and an equivalent item is under-used, recommend redirecting demand.
 */
export function utilisationReport(
  window: Interval,
  equipment: Equipment[],
  bookings: Booking[],
  departments: Department[],
): UtilisationReport {
  const days = Math.max(1, Math.round((window.end - window.start) / DAY_MS));
  const dailyCapacity = LAB_CLOSE_HOUR - LAB_OPEN_HOUR;
  const confirmed = bookings.filter((b) => b.status === 'confirmed');

  const items: EquipmentUtilisation[] = equipment.map((e) => {
    const intervals = confirmed.filter((b) => b.equipmentId === e.id).map(toInterval);
    // The 7-day window rarely starts on the hour, so round to one decimal for display.
    const bookedHours = Math.round(hoursWithin(intervals, window) * 10) / 10;
    const capacityHours = e.status === 'available' ? days * dailyCapacity : 0;
    return {
      equipmentId: e.id,
      name: e.name,
      category: e.category,
      departmentId: e.departmentId,
      bookedHours,
      capacityHours,
      rate: ratio(bookedHours, capacityHours),
    };
  });

  const deptRates = departments.map((d) => {
    const own = items.filter((i) => i.departmentId === d.id);
    const booked = own.reduce((s, i) => s + i.bookedHours, 0);
    const capacity = own.reduce((s, i) => s + i.capacityHours, 0);
    return { departmentId: d.id, name: d.name, rate: ratio(booked, capacity) };
  });

  const peak = new Map<number, number>();
  for (let h = LAB_OPEN_HOUR; h < LAB_CLOSE_HOUR; h++) peak.set(h, 0);
  for (const b of confirmed) {
    const { start, end } = toInterval(b);
    if (end <= window.start || start >= window.end) continue;
    for (let t = start; t < end; t += 60 * 60 * 1000) {
      const h = Math.floor(campusHour(t));
      if (peak.has(h)) peak.set(h, (peak.get(h) ?? 0) + 1);
    }
  }

  const suggestions: string[] = [];
  for (const busy of items.filter((i) => i.rate >= OVERUSED_THRESHOLD)) {
    const spare = items.find(
      (i) =>
        i.category === busy.category &&
        i.equipmentId !== busy.equipmentId &&
        i.capacityHours > 0 &&
        i.rate <= UNDERUSED_THRESHOLD,
    );
    suggestions.push(
      spare
        ? `${busy.name} is ${Math.round(busy.rate * 100)}% booked while ${spare.name} is only ${Math.round(spare.rate * 100)}% booked — redirect new ${busy.category} requests there.`
        : `${busy.name} is ${Math.round(busy.rate * 100)}% booked with no spare equivalent — consider extending lab hours or acquiring another ${busy.category}.`,
    );
  }
  const idle = items.filter((i) => i.capacityHours > 0 && i.bookedHours === 0);
  if (idle.length) {
    // One grouped line keeps the list actionable instead of one line per idle item.
    const named = idle
      .slice(0, 3)
      .map((i) => i.name)
      .join(', ');
    const more = idle.length > 3 ? ` and ${idle.length - 3} more` : '';
    suggestions.push(
      `${idle.length} item${idle.length > 1 ? 's were' : ' was'} not booked at all (${named}${more}) — promote them to projects that need them.`,
    );
  }

  return {
    window: { start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() },
    equipment: items,
    departments: deptRates,
    peakHours: [...peak].map(([hour, bookedHours]) => ({ hour, bookedHours })),
    suggestions,
  };
}
