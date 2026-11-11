export type ModelItem = {
  id: string;
  name: string;
  discipline: string;
  loaded: boolean;
  source: string;
  folder?: string;
  tags: string[];
};

export type ModelsApiResponse = {
  source: string;
  count: number;
  scannedFolders?: number;
  warnings?: string[];
  models: ModelItem[];
};

export function isModel(item: ModelItem): boolean {
  return Boolean(item && typeof item.id === "string" && typeof item.name === "string" &&
    /\.(ifc|trb|skp|rvt|dwg|tekla)$/i.test(item.name.trim()));
}

// The result must reflect the project API: no hardcoded old test model is injected.
export async function getModels(): Promise<ModelsApiResponse> {
  const response = await fetch("/api/models", { cache: "no-store" });
  const body = await response.text();
  let data: ModelsApiResponse & {error?: string};
  try { data = JSON.parse(body); }
  catch { throw new Error(`Models API returned ${response.status} with an invalid or empty response`); }
  if (!response.ok) throw new Error(data.error || `Models API request failed: ${response.status}`);
  const models = Array.isArray(data.models) ? data.models.filter(isModel).map(model => ({
    ...model, tags: Array.isArray(model.tags) ? model.tags.filter(tag => typeof tag === "string") : [],
  })) : [];
  return { ...data, models };
}
