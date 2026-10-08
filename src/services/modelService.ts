export type ModelItem = {
  id: string;
  name: string;
  discipline: string;
  loaded: boolean;
  source: string;
};

type ModelsApiResponse = {
  source: string;
  count: number;
  models: ModelItem[];
};

export async function getModels(): Promise<ModelItem[]> {
  const response = await fetch("/api/models");

  if (!response.ok) {
    throw new Error(
      `Models API request failed: ${response.status}`
    );
  }

  const data: ModelsApiResponse = await response.json();

  console.log("Models API source:", data.source);
  console.log("Models received:", data.count);

  return data.models;
}