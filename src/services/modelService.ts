
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

// Real Trimble model already verified in the 3D viewer.
const verifiedModel: ModelItem = {
  id: "WnC-a6wV27I",
  name: "SZC-MW0900-CWA-U9-HPL-01XXXX-MDL-CBF-100001_Galleries Pour Model HPL_Ver8_P04.ifc",
  discipline: "Structural",
  loaded: false,
  source: "Trimble Connect",
};

function isModel(item: ModelItem): boolean {
  if (!item || typeof item.id !== "string") {
    return false;
  }

  if (typeof item.name !== "string") {
    return false;
  }

  // Only display recognised 3D model file types.
  return /\.(ifc|trb|skp|rvt|tekla|dwg)$/i.test(
    item.name.trim()
  );
}

export async function getModels(): Promise<ModelItem[]> {
  try {
    const response = await fetch("/api/models", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Models API request failed: ${response.status}`
      );
    }

    const data: ModelsApiResponse = await response.json();

    const validModels = Array.isArray(data.models)
      ? data.models.filter(isModel)
      : [];

    console.log("Models API source:", data.source);
    console.log("Valid models:", validModels.length);

    // Keep the confirmed working model available.
    if (
      !validModels.some(
        (model) => model.id === verifiedModel.id
      )
    ) {
      validModels.push(verifiedModel);
    }

    return validModels;
  } catch (error) {
    console.warn(
      "Models API unavailable; using verified model:",
      error
    );

    return [verifiedModel];
  }
}
