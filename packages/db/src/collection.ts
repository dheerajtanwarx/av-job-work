import type { Model, PipelineStage, PopulateOptions, QueryFilter, UpdateQuery } from "mongoose";
import { plain } from "./plain.js";

export type Filter = QueryFilter<any>;
export type Update = UpdateQuery<any>;
export type Sort = Record<string, 1 | -1>;
export type Populate = string | PopulateOptions | (string | PopulateOptions)[];

export interface FindOpts {
  /** Mongoose projection, e.g. "name unit" or { name: 1 }. `_id` (returned as `id`) is always included. */
  select?: string | Record<string, 0 | 1>;
  sort?: Sort;
  skip?: number;
  limit?: number;
  populate?: Populate;
}

/** New rows may leave out anything with a schema default (ids, timestamps, nullable fields), embedded lines included. */
export type NewRow<T> = { [K in keyof T]?: T[K] extends (infer E)[] ? (E extends object ? NewRow<E>[] : T[K]) : T[K] | null } & Record<string, unknown>;

/**
 * Typed access to one collection. Every read is `.lean()` and comes back as a plain row (see `plain`).
 * Inside `transaction()` every call joins the transaction's session automatically.
 */
export class Collection<T> {
  constructor(readonly model: Model<any>) {}

  async find<R = T>(filter: Filter = {}, o: FindOpts = {}): Promise<R[]> {
    const q = this.model.find(filter);
    if (o.select) q.select(o.select);
    if (o.sort) q.sort(o.sort);
    if (o.skip) q.skip(o.skip);
    if (o.limit !== undefined) q.limit(o.limit);
    if (o.populate) q.populate(o.populate as PopulateOptions);
    return plain<R[]>(await q.lean());
  }

  async findOne<R = T>(filter: Filter, o: Omit<FindOpts, "skip" | "limit"> = {}): Promise<R | null> {
    const q = this.model.findOne(filter);
    if (o.select) q.select(o.select);
    if (o.sort) q.sort(o.sort);
    if (o.populate) q.populate(o.populate as PopulateOptions);
    return plain<R | null>(await q.lean());
  }

  /** `findOne` that throws when nothing matched. */
  async findOneOrThrow<R = T>(filter: Filter, o: Omit<FindOpts, "skip" | "limit"> = {}): Promise<R> {
    const row = await this.findOne<R>(filter, o);
    if (!row) throw new Error(`${this.model.modelName} not found`);
    return row;
  }

  findById<R = T>(id: string | number, o: Omit<FindOpts, "skip" | "limit" | "sort"> = {}): Promise<R | null> {
    return this.findOne<R>({ _id: id }, o);
  }

  count(filter: Filter = {}): Promise<number> {
    return this.model.countDocuments(filter);
  }

  async exists(filter: Filter): Promise<boolean> {
    return (await this.model.exists(filter)) != null;
  }

  async create(data: NewRow<T>): Promise<T> {
    const doc = await new this.model(data).save();
    return plain<T>(doc.toObject());
  }

  async createMany(data: NewRow<T>[]): Promise<T[]> {
    if (!data.length) return [];
    const docs = await this.model.insertMany(data);
    return docs.map((d) => plain<T>(d.toObject()));
  }

  /** Updates one document and returns it as it is after the update (null when nothing matched). */
  async update<R = T>(filter: Filter | string, update: Update, o: { select?: FindOpts["select"]; upsert?: boolean } = {}): Promise<R | null> {
    const q = this.model.findOneAndUpdate(typeof filter === "string" ? { _id: filter } : filter, update, { returnDocument: "after", upsert: o.upsert });
    if (o.select) q.select(o.select);
    return plain<R | null>(await q.lean());
  }

  /** `update` that throws when nothing matched. */
  async updateOrThrow<R = T>(filter: Filter | string, update: Update): Promise<R> {
    const row = await this.update<R>(filter, update);
    if (!row) throw new Error(`${this.model.modelName} not found`);
    return row;
  }

  async updateMany(filter: Filter, update: Update): Promise<number> {
    return (await this.model.updateMany(filter, update)).modifiedCount;
  }

  async deleteMany(filter: Filter): Promise<number> {
    return (await this.model.deleteMany(filter)).deletedCount;
  }

  /** Runs a pipeline; results go through `plain` (so a `$group` key `_id` comes back as `id`). */
  async aggregate<R>(pipeline: PipelineStage[]): Promise<R[]> {
    return plain<R[]>(await this.model.aggregate(pipeline));
  }

  async distinct<V = string>(field: string, filter: Filter = {}): Promise<V[]> {
    return (await this.model.distinct(field, filter)) as V[];
  }
}
