export type FieldViewRecord = {
  id: string;
  type: "ITP" | "NCR" | "Inspection";
  title: string;
  status: "Passed" | "Open" | "Closed" | "Pending";
  date: string;
  modelGuid?: string;
};

type FieldViewApiResponse = {
  source: string;
  count: number;
  records: FieldViewRecord[];
};

export async function getFieldViewRecords(
  modelGuid?: string
): Promise<FieldViewRecord[]> {
  let url = "/api/fieldview/records";

  if (modelGuid) {
    url += `?modelGuid=${encodeURIComponent(modelGuid)}`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `FieldView API request failed: ${response.status}`
    );
  }

  const data: FieldViewApiResponse = await response.json();

  console.log("FieldView API source:", data.source);
  console.log("FieldView records received:", data.count);

  return data.records;
}