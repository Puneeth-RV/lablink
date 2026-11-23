import { randomUUID } from 'node:crypto';
import type {
  AccessRequest,
  Booking,
  Department,
  Equipment,
  FaultReport,
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
  faultReports: FaultReport[];
}

type Entity = { id: string };

export type CollectionName = keyof SeedData;

/** Called after every insert/update so changes can be written through to durable storage. */
export type ChangeListener = (collection: CollectionName, entity: Entity) => void;

/** Small id-indexed collection: O(1) lookups, insertion-ordered listing. */
class Collection<T extends Entity> {
  private readonly items = new Map<string, T>();

  constructor(
    private readonly name: CollectionName,
    initial: T[],
    private readonly onChange?: ChangeListener,
  ) {
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
    this.onChange?.(this.name, created);
    return created;
  }

  update(id: string, patch: Partial<Omit<T, 'id'>>): T {
    const current = this.items.get(id);
    if (!current) throw new Error(`Entity ${id} not found`);
    const next = { ...current, ...patch };
    this.items.set(id, next);
    this.onChange?.(this.name, next);
    return next;
  }

  asMap(): Map<string, T> {
    return new Map(this.items);
  }
}

/**
 * In-memory working set: all reads are synchronous O(1) map lookups. Durability comes from
 * an optional change listener that writes every mutation through to Firestore
 * (see `services/persistence.ts`), so domain logic and routes stay storage-agnostic.
 */
export class Store {
  readonly departments: Collection<Department>;
  readonly users: Collection<User>;
  readonly equipment: Collection<Equipment>;
  readonly projects: Collection<Project>;
  readonly bookings: Collection<Booking>;
  readonly slotRequests: Collection<SlotRequest>;
  readonly accessRequests: Collection<AccessRequest>;
  readonly faultReports: Collection<FaultReport>;

  constructor(seed: SeedData, onChange?: ChangeListener) {
    this.departments = new Collection('departments', seed.departments, onChange);
    this.users = new Collection('users', seed.users, onChange);
    this.equipment = new Collection('equipment', seed.equipment, onChange);
    this.projects = new Collection('projects', seed.projects, onChange);
    this.bookings = new Collection('bookings', seed.bookings, onChange);
    this.slotRequests = new Collection('slotRequests', seed.slotRequests, onChange);
    this.accessRequests = new Collection('accessRequests', seed.accessRequests, onChange);
    // Older persisted snapshots may predate fault reports.
    this.faultReports = new Collection('faultReports', seed.faultReports ?? [], onChange);
  }
}
