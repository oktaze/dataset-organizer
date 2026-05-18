/** Canonical domain types (camelCase). DB rows are snake_case and mapped
 *  in `db.ts`; JSON-as-TEXT columns are parsed there too. */

export type ProjectType = "character" | "style" | "concept";

export type ImageStatus = "pending" | "tagged" | "validated" | "exported";

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  trigger: string;
  baseModel: string;
  createdAt: number;
  updatedAt: number;
}

export interface Costume {
  id: string;
  projectId: string;
  name: string;
  trigger: string | null;
  tags: string[];
  colorTags: string[];
  sortOrder: number;
}

export interface TagScore {
  tag: string;
  score: number;
}

export interface ImageItem {
  id: string;
  projectId: string;
  costumeId: string | null;
  filename: string;
  filepath: string;
  width: number | null;
  height: number | null;
  tagsAuto: TagScore[];
  tagsFinal: string[];
  caption: string | null;
  costumeScore: Record<string, number>;
  status: ImageStatus;
  createdAt: number;
}

export interface ConstantTag {
  id: string;
  projectId: string;
  tag: string;
}

/** Style/Concept: tags always added to every caption (after trigger). */
export interface ProjectTag {
  id: string;
  projectId: string;
  tag: string;
  sortOrder: number;
}
