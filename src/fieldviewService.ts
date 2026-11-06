// Read-only FieldView CSV demonstrator. Put the four CSV files in public/fieldview/.
export type CSVRow = Record<string, string>;
export type FieldViewData = {
  forms: CSVRow[];
  answersByForm: Map<string, CSVRow[]>;
  tablesByForm: Map<string, CSVRow[]>;
  tasksById: Map<string, CSVRow>;
};

// Handles quoted fields, escaped quotes, CRLF and embedded newlines.
function parseCSV(input: string): CSVRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = "";
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = "";
      if (row.some(value => value.length)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [headers = [], ...records] = rows;
  if (headers.length) headers[0] = headers[0].replace(/^\uFEFF/, '');
  return records.map(values => Object.fromEntries(headers.map((name, i) => [name, values[i] ?? ""])));
}

function groupByForm(rows: CSVRow[]): Map<string, CSVRow[]> {
  const grouped = new Map<string, CSVRow[]>();
  for (const row of rows) {
    const key = row.FormID;
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}

async function readCSV(file: string): Promise<CSVRow[]> {
  const response = await fetch(`/fieldview/${file}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Cannot load ${file} (${response.status}). Place CSVs in public/fieldview/.`);
  return parseCSV(await response.text());
}

let pending: Promise<FieldViewData> | undefined;
export function loadFieldViewCSV(): Promise<FieldViewData> {
  if (!pending) {
    pending = Promise.all([
      readCSV('forms.csv'),
      readCSV('form-answers.csv'),
      readCSV('table-group-answers.csv'),
      readCSV('process-details.csv'),
    ]).then(([forms, answers, tables, tasks]) => ({
      forms: forms.filter(form => form.Deleted?.toUpperCase() !== 'TRUE'),
      answersByForm: groupByForm(answers),
      tablesByForm: groupByForm(tables),
      tasksById: new Map(tasks.filter(task => task.TaskId).map(task => [task.TaskId, task])),
    })).catch(error => { pending = undefined; throw error; });
  }
  return pending;
}

export function getFormTables(rows: CSVRow[]): { name: string; columns: string[]; rows: CSVRow[] }[] {
  const groups = new Map<string, { name: string; columns: string[]; byRow: Map<string, CSVRow> }>();
  for (const entry of rows) {
    const name = entry.tableName || 'Checklist';
    const group = groups.get(name) ?? { name, columns: [], byRow: new Map<string, CSVRow>() };
    if (!group.columns.includes(entry.columnName)) group.columns.push(entry.columnName);
    const rowKey = entry.rowNo || String(group.byRow.size + 1);
    const record = group.byRow.get(rowKey) ?? { rowNo: rowKey };
    record[entry.columnName] = entry.answer;
    group.byRow.set(rowKey, record);
    groups.set(name, group);
  }
  return [...groups.values()].map(group => ({ name: group.name, columns: group.columns, rows: [...group.byRow.values()].sort((a,b) => Number(a.rowNo) - Number(b.rowNo)) }));
}

// Demonstration-only mappings. Not verified FieldView-to-BIM relationships.
export type PourFormLink = { fullPourId: string; formId: string; recordType?: "ITP" | "NCR"; association?: "supplied-demo" | "generated-demo" };
export async function loadPourFormLinks(): Promise<PourFormLink[]> {
  const rows = await readCSV('pour-form-links.csv');
  return rows.filter(row => row.FullPourID && row.FormID).map(row => ({
    fullPourId: row.FullPourID.trim().toUpperCase(), formId: row.FormID.trim(),
    recordType: row.RecordType === "ITP" || row.RecordType === "NCR" ? row.RecordType : undefined,
    association: "supplied-demo",
  }));
}
