/** Typed data access over the generic Rust `db_query` / `db_execute` IPC.
 *  The frontend owns all business logic (per CLAUDE.md). */

import { tauri } from "@/lib/tauri";
import { ciKey } from "@/lib/tag-key";
import type {
  ConstantTag,
  Costume,
  ImageItem,
  ImageStatus,
  Project,
  ProjectTag,
  ProjectType,
  TagScore,
} from "@/lib/types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" ? v : v == null ? null : Number(v);

function parseJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string" || v === "") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

const uuid = (): string => crypto.randomUUID();
const now = (): number => Date.now();

// ---------------------------------------------------------------- projects

function toProject(r: Row): Project {
  return {
    id: str(r.id),
    name: str(r.name),
    type: str(r.type) as ProjectType,
    trigger: str(r.trigger),
    baseModel: str(r.base_model) || "illustrious-xl",
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
  };
}

export interface NewProject {
  name: string;
  type: ProjectType;
  trigger: string;
  baseModel: string;
}

export const projectsDb = {
  async list(): Promise<Project[]> {
    const rows = await tauri.dbQuery<Row>(
      "SELECT * FROM projects ORDER BY updated_at DESC",
      [],
    );
    return rows.map(toProject);
  },

  async create(input: NewProject): Promise<Project> {
    const p: Project = {
      id: uuid(),
      name: input.name,
      type: input.type,
      trigger: input.trigger,
      baseModel: input.baseModel || "illustrious-xl",
      createdAt: now(),
      updatedAt: now(),
    };
    await tauri.dbExecute(
      `INSERT INTO projects
         (id, name, type, trigger, base_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.name, p.type, p.trigger, p.baseModel, p.createdAt, p.updatedAt],
    );
    return p;
  },

  async update(
    id: string,
    patch: Partial<Pick<Project, "name" | "trigger" | "baseModel">>,
  ): Promise<void> {
    await tauri.dbExecute(
      `UPDATE projects
         SET name = COALESCE(?, name),
             trigger = COALESCE(?, trigger),
             base_model = COALESCE(?, base_model),
             updated_at = ?
       WHERE id = ?`,
      [
        patch.name ?? null,
        patch.trigger ?? null,
        patch.baseModel ?? null,
        now(),
        id,
      ],
    );
  },

  async remove(id: string): Promise<void> {
    await tauri.dbExecute("DELETE FROM projects WHERE id = ?", [id]);
  },
};

// ---------------------------------------------------------------- costumes

function toCostume(r: Row): Costume {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    name: str(r.name),
    trigger: strOrNull(r.trigger),
    tags: parseJson<string[]>(r.tags, []),
    colorTags: parseJson<string[]>(r.color_tags, []),
    sortOrder: num(r.sort_order),
  };
}

export interface NewCostume {
  projectId: string;
  name: string;
  trigger: string | null;
  tags: string[];
  colorTags: string[];
}

export const costumesDb = {
  async list(projectId: string): Promise<Costume[]> {
    const rows = await tauri.dbQuery<Row>(
      "SELECT * FROM costumes WHERE project_id = ? ORDER BY sort_order, name",
      [projectId],
    );
    return rows.map(toCostume);
  },

  async create(input: NewCostume): Promise<Costume> {
    const orderRows = await tauri.dbQuery<Row>(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM costumes WHERE project_id = ?",
      [input.projectId],
    );
    const sortOrder = num(orderRows[0]?.next);
    const c: Costume = { id: uuid(), sortOrder, ...input };
    await tauri.dbExecute(
      `INSERT INTO costumes
         (id, project_id, name, trigger, tags, color_tags, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.projectId,
        c.name,
        c.trigger,
        JSON.stringify(c.tags),
        JSON.stringify(c.colorTags),
        c.sortOrder,
      ],
    );
    return c;
  },

  async update(
    id: string,
    patch: Partial<Pick<Costume, "name" | "trigger" | "tags" | "colorTags" | "sortOrder">>,
  ): Promise<void> {
    await tauri.dbExecute(
      `UPDATE costumes
         SET name = COALESCE(?, name),
             trigger = ?,
             tags = COALESCE(?, tags),
             color_tags = COALESCE(?, color_tags),
             sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [
        patch.name ?? null,
        patch.trigger ?? null,
        patch.tags ? JSON.stringify(patch.tags) : null,
        patch.colorTags ? JSON.stringify(patch.colorTags) : null,
        patch.sortOrder ?? null,
        id,
      ],
    );
  },

  async remove(id: string): Promise<void> {
    await tauri.dbExecute("DELETE FROM costumes WHERE id = ?", [id]);
  },
};

// ------------------------------------------------------------------ images

function toImage(r: Row): ImageItem {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    costumeId: strOrNull(r.costume_id),
    filename: str(r.filename),
    filepath: str(r.filepath),
    sourcePath: strOrNull(r.source_path),
    width: numOrNull(r.width),
    height: numOrNull(r.height),
    tagsAuto: parseJson<TagScore[]>(r.tags_auto, []),
    tagsFinal: parseJson<string[]>(r.tags_final, []),
    caption: strOrNull(r.caption),
    costumeScore: parseJson<Record<string, number>>(r.costume_score, {}),
    status: (str(r.status) || "pending") as ImageStatus,
    createdAt: num(r.created_at),
  };
}

export interface NewImage {
  /** Pre-generated so the caller can name the managed library file after it. */
  id: string;
  projectId: string;
  filename: string;
  /** App-managed copy path (already inside the library). */
  filepath: string;
  /** Original external path it was imported from. */
  sourcePath: string;
  width: number | null;
  height: number | null;
  /** Tags known at import time (e.g. from a Grabber `.txt`). Defaults empty. */
  tagsFinal?: string[];
  tagsAuto?: TagScore[];
  caption?: string | null;
  costumeId?: string | null;
  costumeScore?: Record<string, number>;
  /** Defaults to "pending" when no tags are supplied. */
  status?: ImageStatus;
}

export interface ImagePatch {
  costumeId?: string | null;
  tagsAuto?: TagScore[];
  tagsFinal?: string[];
  caption?: string | null;
  costumeScore?: Record<string, number>;
  status?: ImageStatus;
}

export const imagesDb = {
  async list(projectId: string): Promise<ImageItem[]> {
    const rows = await tauri.dbQuery<Row>(
      "SELECT * FROM images WHERE project_id = ? ORDER BY filename",
      [projectId],
    );
    return rows.map(toImage);
  },

  async insert(input: NewImage): Promise<ImageItem> {
    const img: ImageItem = {
      id: input.id,
      projectId: input.projectId,
      costumeId: input.costumeId ?? null,
      filename: input.filename,
      filepath: input.filepath,
      sourcePath: input.sourcePath,
      width: input.width,
      height: input.height,
      tagsAuto: input.tagsAuto ?? [],
      tagsFinal: input.tagsFinal ?? [],
      caption: input.caption ?? null,
      costumeScore: input.costumeScore ?? {},
      status: input.status ?? "pending",
      createdAt: now(),
    };
    await tauri.dbExecute(
      `INSERT INTO images
         (id, project_id, costume_id, filename, filepath, source_path,
          width, height, tags_auto, tags_final, caption, costume_score,
          status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        img.id,
        img.projectId,
        img.costumeId,
        img.filename,
        img.filepath,
        img.sourcePath,
        img.width,
        img.height,
        JSON.stringify(img.tagsAuto),
        JSON.stringify(img.tagsFinal),
        img.caption,
        JSON.stringify(img.costumeScore),
        img.status,
        img.createdAt,
      ],
    );
    return img;
  },

  async update(id: string, patch: ImagePatch): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if ("costumeId" in patch) {
      sets.push("costume_id = ?");
      params.push(patch.costumeId ?? null);
    }
    if (patch.tagsAuto !== undefined) {
      sets.push("tags_auto = ?");
      params.push(JSON.stringify(patch.tagsAuto));
    }
    if (patch.tagsFinal !== undefined) {
      sets.push("tags_final = ?");
      params.push(JSON.stringify(patch.tagsFinal));
    }
    if ("caption" in patch) {
      sets.push("caption = ?");
      params.push(patch.caption ?? null);
    }
    if (patch.costumeScore !== undefined) {
      sets.push("costume_score = ?");
      params.push(JSON.stringify(patch.costumeScore));
    }
    if (patch.status !== undefined) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (sets.length === 0) return;
    params.push(id);
    await tauri.dbExecute(
      `UPDATE images SET ${sets.join(", ")} WHERE id = ?`,
      params,
    );
  },

  async markExported(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    await tauri.dbExecute(
      `UPDATE images SET status = 'exported' WHERE id IN (${placeholders})`,
      ids,
    );
  },

  /** Add `tag` to `tags_final` of every listed image (case-insensitive
   *  de-dup). Read-modify-write per row since `tags_final` is JSON-as-TEXT —
   *  business logic stays in the frontend (per CLAUDE.md). */
  async addTagMany(ids: string[], tag: string): Promise<void> {
    const t = tag.trim();
    if (ids.length === 0 || t === "") return;
    const ph = ids.map(() => "?").join(", ");
    const rows = await tauri.dbQuery<Row>(
      `SELECT id, tags_final FROM images WHERE id IN (${ph})`,
      ids,
    );
    const k = ciKey(t);
    for (const r of rows) {
      const cur = parseJson<string[]>(r.tags_final, []);
      if (cur.some((x) => ciKey(x) === k)) continue;
      await tauri.dbExecute(
        "UPDATE images SET tags_final = ? WHERE id = ?",
        [JSON.stringify([...cur, t]), str(r.id)],
      );
    }
  },

  /** Remove `tag` (case-insensitive) from `tags_final` of every listed
   *  image. */
  async removeTagMany(ids: string[], tag: string): Promise<void> {
    const t = tag.trim();
    if (ids.length === 0 || t === "") return;
    const ph = ids.map(() => "?").join(", ");
    const rows = await tauri.dbQuery<Row>(
      `SELECT id, tags_final FROM images WHERE id IN (${ph})`,
      ids,
    );
    const k = ciKey(t);
    for (const r of rows) {
      const cur = parseJson<string[]>(r.tags_final, []);
      const next = cur.filter((x) => ciKey(x) !== k);
      if (next.length === cur.length) continue;
      await tauri.dbExecute(
        "UPDATE images SET tags_final = ? WHERE id = ?",
        [JSON.stringify(next), str(r.id)],
      );
    }
  },

  /** Re-insert full image rows (preserving id + created_at), overwriting any
   *  current row. Used by single-level Undo to restore bulk edits/deletes. */
  async insertRestore(rows: ImageItem[]): Promise<void> {
    for (const img of rows) {
      await tauri.dbExecute(
        `INSERT OR REPLACE INTO images
           (id, project_id, costume_id, filename, filepath, source_path,
            width, height, tags_auto, tags_final, caption, costume_score,
            status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          img.id,
          img.projectId,
          img.costumeId,
          img.filename,
          img.filepath,
          img.sourcePath,
          img.width,
          img.height,
          JSON.stringify(img.tagsAuto),
          JSON.stringify(img.tagsFinal),
          img.caption,
          JSON.stringify(img.costumeScore),
          img.status,
          img.createdAt,
        ],
      );
    }
  },

  async setStatusMany(ids: string[], status: ImageStatus): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(", ");
    await tauri.dbExecute(
      `UPDATE images SET status = ? WHERE id IN (${ph})`,
      [status, ...ids],
    );
  },

  async setCostumeMany(
    ids: string[],
    costumeId: string | null,
  ): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(", ");
    await tauri.dbExecute(
      `UPDATE images SET costume_id = ? WHERE id IN (${ph})`,
      [costumeId, ...ids],
    );
  },

  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(", ");
    await tauri.dbExecute(
      `DELETE FROM images WHERE id IN (${ph})`,
      ids,
    );
  },

  /** De-dup keys on the **original** import path (managed `filepath`s are
   *  unique per import). `COALESCE` keeps pre-migration legacy rows working. */
  async existingPaths(projectId: string): Promise<Set<string>> {
    const rows = await tauri.dbQuery<Row>(
      "SELECT COALESCE(source_path, filepath) AS p FROM images WHERE project_id = ?",
      [projectId],
    );
    return new Set(rows.map((r) => str(r.p)));
  },

  async remove(id: string): Promise<void> {
    await tauri.dbExecute("DELETE FROM images WHERE id = ?", [id]);
  },
};

// ----------------------------------------------------------- constant tags

function toConstantTag(r: Row): ConstantTag {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    tag: str(r.tag),
  };
}

export const constantTagsDb = {
  async list(projectId: string): Promise<ConstantTag[]> {
    const rows = await tauri.dbQuery<Row>(
      "SELECT * FROM character_constant_tags WHERE project_id = ? ORDER BY tag",
      [projectId],
    );
    return rows.map(toConstantTag);
  },

  async add(projectId: string, tag: string): Promise<void> {
    await tauri.dbExecute(
      "INSERT INTO character_constant_tags (id, project_id, tag) VALUES (?, ?, ?)",
      [uuid(), projectId, tag],
    );
  },

  async remove(id: string): Promise<void> {
    await tauri.dbExecute(
      "DELETE FROM character_constant_tags WHERE id = ?",
      [id],
    );
  },
};

// ------------------------------------------------------ project (style) tags

function toProjectTag(r: Row): ProjectTag {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    tag: str(r.tag),
    sortOrder: num(r.sort_order),
  };
}

export const projectTagsDb = {
  async list(projectId: string): Promise<ProjectTag[]> {
    const rows = await tauri.dbQuery<Row>(
      "SELECT * FROM project_tags WHERE project_id = ? ORDER BY sort_order, tag",
      [projectId],
    );
    return rows.map(toProjectTag);
  },

  async add(projectId: string, tag: string): Promise<void> {
    const orderRows = await tauri.dbQuery<Row>(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM project_tags WHERE project_id = ?",
      [projectId],
    );
    await tauri.dbExecute(
      "INSERT INTO project_tags (id, project_id, tag, sort_order) VALUES (?, ?, ?, ?)",
      [uuid(), projectId, tag, num(orderRows[0]?.next)],
    );
  },

  async remove(id: string): Promise<void> {
    await tauri.dbExecute("DELETE FROM project_tags WHERE id = ?", [id]);
  },
};
