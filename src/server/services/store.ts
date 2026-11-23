import { randomUUID } from 'node:crypto';
import type {
  AccessRequest,
  Booking,
  Department,
  Equipment,
  Project,
  SlotRequest,
  User,
} from '../domain/types.js';

export interface SeedData {
  departments: Department[];
  users: User[];
  equipment: Equipment[];
  projects: Project[];
  bookings: Booking[];
  slotRequests: SlotRequest[];
  accessRequests: AccessRequest[];
}

type Entity = { id: string };

/** Small id-indexed collection: O(1) lookups, insertion-ordered listing. */
class Collection<T extends Entity> {
  private readonly items = new Map<string, T>();

  constructor(initial: T[] = []) {
    for (const item of initial) this.items.set(item.id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  list(predicate?: (item: T) => boolean): T[] {
    const all = [...this.items.values()];
    return predicate ? all.filter(predicate) : all;
  }

  insert(item: Omit<T, 'id'>): T {
    const created = { ...item, id: randomUUID() } as T;
    this.items.set(created.id, created);
    return created;
  }

  update(id: string, patch: Partial<Omit<T, 'id'>>): T {
    const current = this.items.get(id);
    if (!current) throw new Error(`Entity ${id} not found`);
    const next = { ...current, ...patch };
    this.items.set(id, next);
    return next;
  }

  asMap(): Map<string, T> {
    return new Map(this.items);
  }
}

/**
 * In-memory repository seeded at boot. Kept behind this class so a persistent
 * implementation (e.g. Firestore) can replace it without touching routes or domain logic.
 */
export class Store {
  readonly departments: Collection<Department>;
  readonly users: Collection<User>;
  readonly equipment: Collection<Equipment>;
  readonly projects: Collection<Project>;
  readonly bookings: Collection<Booking>;
  readonly slotRequests: Collection<SlotRequest>;
  readonly accessRequests: Collection<AccessRequest>;

  constructor(seed: SeedData) {
    this.departments = new Collection(seed.departments);
    this.users = new Collection(seed.users);
    this.equipment = new Collection(seed.equipment);
    this.projects = new Collection(seed.projects);
    this.bookings = new Collection(seed.bookings);
    this.slotRequests = new Collection(seed.slotRequests);
    this.accessRequests = new Collection(seed.accessRequests);
  }
}
