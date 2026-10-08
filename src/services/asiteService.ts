export type AsiteModel = {
  id: string;
  name: string;
  revision: string;
  discipline: string;
  status: string;
  size: string;
  modifiedDate: string;
  source: string;
};

type AsiteModelsApiResponse = {
  source: string;
  count: number;
  models: AsiteModel[];
};

export async function getAsiteModels(): Promise<
  AsiteModel[]
> {
  const response = await fetch("/api/asite/models");

  if (!response.ok) {
    throw new Error(
      `Asite API request failed: ${response.status}`
    );
  }

  const data: AsiteModelsApiResponse =
    await response.json();

  console.log("Asite API source:", data.source);
  console.log("Asite models received:", data.count);

  return data.models;
}