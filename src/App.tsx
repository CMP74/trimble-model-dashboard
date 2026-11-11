import { useEffect, useState } from "react";
import "./App.css";
import { loadFieldViewCSV, loadPourFormLinks, getFormTables, type PourFormLink, type FieldViewData } from "./fieldviewService";
import TrimbleViewer, {
  type SelectedBIMObject,
} from "./components/TrimbleViewer";
import {
  getModels,
  type ModelItem,
} from "./services/modelService";
// Do not assume an API response contains JSON. Codespaces proxy/network failures
// and expired backend sessions can return an empty body or HTML instead.
const readDocumentApiJson = async (response: Response, action: string): Promise<any> => {
  const raw = await response.text();
  let body: any = null;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      const kind = /^\s*</.test(raw) ? "HTML rather than JSON" : "invalid JSON";
      throw new Error(`${action}: server returned ${kind} (HTTP ${response.status}). Check that the Express backend is running on port 3000 and the frontend API proxy is connected.`);
    }
  }
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : (typeof body?.message === "string" ? body.message : "");
    const authAdvice = response.status === 401 || response.status === 403 ? " Reconnect to Trimble Connect and try again." : "";
    throw new Error(`${action}: ${message || `HTTP ${response.status}`}.${authAdvice}`);
  }
  if (!body || typeof body !== "object") {
    throw new Error(`${action}: server returned an empty or unexpected response (HTTP ${response.status}). Check the Express backend on port 3000 and reconnect Trimble Connect if necessary.`);
  }
  return body;
};

function App() {
  // -------------------------------------------------------
  // Authentication
  // -------------------------------------------------------
  // Layout only: keep the Trimble viewer mounted across tab changes.
  const [activeTab, setActiveTab] = useState<"dashboard" | "data" | "fieldview" | "ai" | "asite">("dashboard");
  const [showDataViewer, setShowDataViewer] = useState(false);
  // Presentation-only controls. Preserve the mounted Trimble viewer and existing selection state.
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState({ models: false, inspections: false, information: false, field: false });
  const togglePanel = (panel: keyof typeof panelCollapsed) => {
    setPanelCollapsed(current => ({ ...current, [panel]: !current[panel] }));
  };
  const [aiQuery, setAiQuery] = useState("");
  const [aiSubmitted, setAiSubmitted] = useState("");
  const [tcDocuments, setTcDocuments] = useState<{id: string; name: string; revision: string | number | null}[]>([]);
  const [tcDocError, setTcDocError] = useState("");
  const [tcDocBusy, setTcDocBusy] = useState("");
  const [tcDocMessage, setTcDocMessage] = useState("");
  const [tcDocResults, setTcDocResults] = useState<{id: string; name: string; revision: string | number | null; page: number; excerpt: string}[]>([]);
  const [tcDocIndexed, setTcDocIndexed] = useState(0);
  const [dashboardDocsLoading, setDashboardDocsLoading] = useState(false);
  const [dashboardDocsError, setDashboardDocsError] = useState("");
  const loadDashboardDocuments = async () => {
    setDashboardDocsLoading(true);
    setDashboardDocsError("");
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const data = await readDocumentApiJson(response, "Load Trimble PDFs");
      setTcDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (error) {
      setDashboardDocsError(error instanceof Error ? error.message : String(error));
    } finally {
      setDashboardDocsLoading(false);
    }
  };

  const [tcDocSearchBusy, setTcDocSearchBusy] = useState(false);
  const [tcDocSearched, setTcDocSearched] = useState(false);
  const [tcDocLastQuery, setTcDocLastQuery] = useState("");
  const refreshTcDocuments = async () => {
    setTcDocError("");
    try {
      const response = await fetch("/api/documents", {cache: "no-store"});
      const data = await readDocumentApiJson(response, "Find Trimble PDFs");
      const documents = Array.isArray(data.documents) ? data.documents : [];
      setTcDocuments(documents);
      setTcDocMessage(`${documents.length} PDF(s) found in the configured Trimble Connect folder.`);
    } catch (error) { setTcDocError(String(error)); }
  };
  const indexTcDocument = async (id: string) => {
    setTcDocBusy(id); setTcDocError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/index`, {method: "POST"});
      const data = await readDocumentApiJson(response, "Index PDF");
      if (!data.document || !Array.isArray(data.document.pages)) throw new Error("Index PDF: server response is missing indexed page details.");
      setTcDocMessage(`Indexed ${data.document.pageCount} page(s) from ${data.document.name}; ${data.document.pages.filter((p: {searchable: boolean}) => !p.searchable).length} page(s) contain no extractable text.`);
      setTcDocIndexed(value => value + 1);
    } catch (error) { setTcDocError(String(error)); }
    finally { setTcDocBusy(""); }
  };
  const searchTcDocuments = async (query: string) => {
    const term = query.trim();
    setTcDocError("");
    setTcDocLastQuery(term);
    setTcDocSearched(Boolean(term));
    setTcDocResults([]);
    if (!term) return;
    setTcDocSearchBusy(true);
    try {
      const response = await fetch(`/api/documents/search?q=${encodeURIComponent(term)}`, {cache: "no-store"});
      const data = await readDocumentApiJson(response, "Search PDFs");
      setTcDocResults(Array.isArray(data.results) ? data.results : []);
      setTcDocIndexed(Number(data.indexed) || 0);
    } catch (error) { setTcDocError(error instanceof Error ? error.message : String(error)); }
    finally { setTcDocSearchBusy(false); }
  };
  const runProjectSearch = (query: string) => {
    setAiSubmitted(query);
    void searchTcDocuments(query);
  };
  const clearProjectSearch = () => {
    setAiQuery("");
    setAiSubmitted("");
    setTcDocResults([]);
    setTcDocSearched(false);
    setTcDocLastQuery("");
    setTcDocError("");
  };

  const [tableSearch, setTableSearch] = useState("");
  const [showSelectedModelOnly, setShowSelectedModelOnly] = useState(false);
  const [showSelectedFormsOnly, setShowSelectedFormsOnly] = useState(false);
  const [ifcClassFilter, setIfcClassFilter] = useState("");
  const [propertyColumnFilter, setPropertyColumnFilter] = useState("");
  const [propertyValueFilter, setPropertyValueFilter] = useState("");
  const [showFilteredIn3D, setShowFilteredIn3D] = useState(false);
  const [hiddenPropertyColumns, setHiddenPropertyColumns] = useState<string[]>([]);
  const [allBIMObjects, setAllBIMObjects] = useState<SelectedBIMObject[]>([]);
  // Per-model BIM data is opt-in. Loading geometry never launches property extraction.
  const [modelDataChoice, setModelDataChoice] = useState("");
  const [dataCommand, setDataCommand] = useState<{ modelId: string; action: "load" | "cancel" | "clear"; sequence: number }>();
  const [dataProgress, setDataProgress] = useState<{ modelId: string; loaded: number; total: number; status: "loading" | "complete" | "cancelled" | "error"; message?: string } | null>(null);
  const [cachedModelIds, setCachedModelIds] = useState<string[]>([]);
  const requestModelData = (action: "load" | "cancel" | "clear") => {
    const targetModelId = action === "cancel" ? (dataProgress?.modelId || modelDataChoice) : modelDataChoice;
    if (!targetModelId) return;
    if (action === "load") {
      setDataProgress({ modelId: targetModelId, loaded: 0, total: 0, status: "loading", message: "Preparing model data…" });
    } else if (action === "clear") {
      setAllBIMObjects(current => current.filter(object => object.modelId !== targetModelId));
      setCachedModelIds(current => current.filter(id => id !== targetModelId));
      setDataProgress(null);
      setShowFilteredIn3D(false);
    }
    setDataCommand(previous => ({ modelId: targetModelId, action, sequence: (previous?.sequence ?? 0) + 1 }));
  };

  const [authStatus, setAuthStatus] =
    useState("Not connected");
  useEffect(() => {
    if (activeTab === "dashboard" && authStatus === "Connected") {
      void loadDashboardDocuments();
    }
  }, [activeTab, authStatus]);
  // -------------------------------------------------------
  // FieldView
  // -------------------------------------------------------
  const [fieldViewData, setFieldViewData] = useState<FieldViewData | null>(null);
  const [fieldViewError, setFieldViewError] = useState("");
  const [fieldViewLoading, setFieldViewLoading] = useState(false);
  const [formSearch, setFormSearch] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [formPage, setFormPage] = useState(0);
  const [pourLinks, setPourLinks] = useState<PourFormLink[]>([]);
  const [colourByFieldView, setColourByFieldView] = useState(false);
  // Keep lightweight pour identifiers separate from the opt-in full Model Data cache.
  const [inspectionIdentifiers, setInspectionIdentifiers] = useState<{modelId: string; runtimeId: number; fullPourId: string}[]>([]);
  const [inspectionScan, setInspectionScan] = useState<{ loaded: number; total: number; status: "loading" | "complete" | "error"; message?: string } | null>(null);
  const [inspectionScanRetry, setInspectionScanRetry] = useState(0);
  const [pourLinkError, setPourLinkError] = useState("");

  useEffect(() => {
    let active = true;
    void loadPourFormLinks().then(links => { if (active) setPourLinks(links); })
      .catch(error => { if (active) setPourLinkError(String(error)); });
    return () => { active = false; };
  }, []);

  // -------------------------------------------------------
  // Trimble models
  // -------------------------------------------------------
  const [models, setModels] = useState<ModelItem[]>([]);
  const [modelCommand, setModelCommand] = useState<{
    ids: string[];
    loaded: boolean;
    sequence: number;
  } | undefined>(undefined);
  const [selectionCommand, setSelectionCommand] = useState<{
    modelId: string;
    runtimeId: number;
    sequence: number;
  }>();
  const [modelsLoading, setModelsLoading] =
    useState(true);
  const [modelSearch, setModelSearch] = useState("");
  const [modelTagFilter, setModelTagFilter] = useState("All tags");
  const [modelFolderFilter, setModelFolderFilter] = useState("All folders");
  const [modelDiscoveryError, setModelDiscoveryError] = useState("");
  const [modelDiscoveryWarnings, setModelDiscoveryWarnings] = useState<string[]>([]);
  const [modelRefreshSequence, setModelRefreshSequence] = useState(0);
  const [modelScannedFolders, setModelScannedFolders] = useState(0);
  const [disciplineFilter, setDisciplineFilter] =
    useState("All disciplines");
  // Asite connector status: explicitly read-only, with no simulated live data.
  const [asiteConnection, setAsiteConnection] = useState<"checking" | "not-configured" | "unavailable">("checking");
  const [asiteMessage, setAsiteMessage] = useState("");
  const [asiteCheckSequence, setAsiteCheckSequence] = useState(0);
  // -------------------------------------------------------
  // Selected BIM object
  // -------------------------------------------------------
  const [realSelectedObject, setRealSelectedObject] =
    useState<SelectedBIMObject | null>(null);
  const [selectedBIMObjects, setSelectedBIMObjects] = useState<SelectedBIMObject[]>([]);
  const formatBIMValue = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };
  const getBIMProperty = (
    object: SelectedBIMObject,
    propertyName: string
  ): string | undefined => {
    const property = object.propertyGroups
      .flatMap((group) => group.properties)
      .find((item) => item.name.toLowerCase() === propertyName.toLowerCase());
    return property ? formatBIMValue(property.value) : undefined;
  };
  // The selected-only view can display clicked elements without scanning an entire model.
  const tableBIMObjects = showSelectedModelOnly
    ? [...new Map(selectedBIMObjects.map(object => [`${object.modelId}:${object.runtimeId}`, object] as const)).values()]
    : allBIMObjects;
  // Dynamic columns preserve each IFC property group and its individual fields.
  const propertyColumns = Array.from(
    new Set(tableBIMObjects.flatMap(object =>
      object.propertyGroups.flatMap(group =>
        group.properties.map(property => `${group.name} / ${property.name}`)
      )
    ))
  ).sort((a, b) => a.localeCompare(b));
  const visiblePropertyColumns = propertyColumns.filter(column => !hiddenPropertyColumns.includes(column));
  const getGroupedProperty = (object: SelectedBIMObject, column: string): string => {
    const separator = column.indexOf(" / ");
    const groupName = column.slice(0, separator);
    const propertyName = column.slice(separator + 3);
    const group = object.propertyGroups.find(item => item.name === groupName);
    const property = group?.properties.find(item => item.name === propertyName);
    return property ? formatBIMValue(property.value) : "—";
  };
  const ifcClasses = Array.from(new Set(tableBIMObjects.map(object => object.ifcClass)))
    .sort((a, b) => a.localeCompare(b));
  const propertyValues = propertyColumnFilter
    ? Array.from(new Set(tableBIMObjects.map(object => getGroupedProperty(object, propertyColumnFilter))))
        .sort((a, b) => a.localeCompare(b))
    : [];
  const filteredBIMObjects = tableBIMObjects.filter(object => {
    if (showSelectedModelOnly && !selectedBIMObjects.some(selected => selected.modelId === object.modelId && selected.runtimeId === object.runtimeId)) return false;
    if (ifcClassFilter && object.ifcClass !== ifcClassFilter) return false;
    if (propertyColumnFilter && propertyValueFilter &&
        getGroupedProperty(object, propertyColumnFilter) !== propertyValueFilter) return false;
    const query = tableSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      object.runtimeId, object.name, object.ifcClass, object.description,
      object.modelId, ...propertyColumns.map(column => getGroupedProperty(object, column)),
    ].some(value => String(value).toLowerCase().includes(query));
  });
  // Stable primitive key: only send visibility changes when the actual matching IDs change.
  const hiddenObjectIds = showFilteredIn3D
    ? allBIMObjects.filter(object => !filteredBIMObjects.some(match =>
        match.modelId === object.modelId && match.runtimeId === object.runtimeId))
    : [];
  const hiddenObjectIdsKey = hiddenObjectIds
    .map(object => `${object.modelId}:${object.runtimeId}`)
    .sort()
    .join("|");
  const visibleObjectIdsKey = showFilteredIn3D
    ? filteredBIMObjects.map(object => `${object.modelId}:${object.runtimeId}`).sort().join("|")
    : "";
  const visibilityCommand = {
    enabled: showFilteredIn3D,
    hiddenObjectIdsKey,
    visibleObjectIdsKey,
  };

  const fullPourId = (object: SelectedBIMObject): string => {
    const match = object.propertyGroups.flatMap(group => group.properties)
      .find(property => property.name.replace(/[^a-z0-9]/gi, "").toLowerCase() === "fullpourid");
    return match ? String(match.value ?? "").trim().toUpperCase() : "";
  };
  // Preserve the three supplied demonstration links; generate additional *clearly
  // labelled* demo associations only for pour IDs actually found in the model.
  // These are NOT verified FieldView-to-BIM relationships.
  const pourIds = Array.from(new Set([
    ...allBIMObjects.map(fullPourId),
    ...selectedBIMObjects.map(fullPourId),
    ...inspectionIdentifiers.map(entry => entry.fullPourId),
  ].filter(Boolean))).sort();
  const existingPourIds = new Set(pourLinks.map(link => link.fullPourId));
  const itpForms = (fieldViewData?.forms ?? []).filter(form =>
    form.FormType === "Reinforced Concrete ITP Forms" && !!form.FormID);
  const completeItpForms = itpForms.filter(form => /^(complete|complete - archived|closed)$/i.test(form.Status ?? ""));
  const activeItpForms = itpForms.filter(form => !/^(complete|complete - archived|closed)$/i.test(form.Status ?? ""));
  const ncrForms = (fieldViewData?.forms ?? []).filter(form =>
    /ncr/i.test(form.FormType ?? "") && !!form.FormID);
  const generatedPourLinks: PourFormLink[] = pourIds.flatMap((pourId, index) => {
    if (existingPourIds.has(pourId) || !itpForms.length) return [];
    const candidates = index % 4 === 0 && completeItpForms.length ? completeItpForms : activeItpForms.length ? activeItpForms : itpForms;
    const itp = candidates[index % candidates.length];
    const links: PourFormLink[] = [{ fullPourId: pourId, formId: itp.FormID, recordType: "ITP", association: "generated-demo" }];
    // A minority of pours receive an additional NCR to demonstrate precedence.
    if (ncrForms.length && index % 7 === 3) {
      links.push({ fullPourId: pourId, formId: ncrForms[Math.floor(index / 7) % ncrForms.length].FormID,
        recordType: "NCR", association: "generated-demo" });
    }
    return links;
  });
  const effectivePourLinks = [...pourLinks, ...generatedPourLinks];
  const selectedPourId = realSelectedObject ? fullPourId(realSelectedObject) : "";
  const selectedPourLinks = effectivePourLinks.filter(link => link.fullPourId === selectedPourId);
  const formById = new Map((fieldViewData?.forms ?? []).map(form => [form.FormID, form]));
  const getInspectionState = (pourId: string): "NCR" | "Complete" | "In Progress" | "Unlinked" => {
    const links = effectivePourLinks.filter(link => link.fullPourId === pourId);
    if (!links.length) return "Unlinked";
    // Any NCR that is not closed takes precedence over the ITP completion.
    const openNcr = links.some(link => {
      const form = formById.get(link.formId);
      const isNcr = link.recordType === "NCR" || /ncr/i.test(form?.FormType ?? "") || /ncr created|non.conform/i.test(form?.Status ?? "");
      return isNcr && !/^(closed|complete|complete - archived|ncr qa accepted)/i.test(form?.Status ?? "");
    });
    if (openNcr) return "NCR";
    const itps = links.filter(link => link.recordType !== "NCR" && !/ncr/i.test(formById.get(link.formId)?.FormType ?? ""));
    return itps.length && itps.every(link => /^(complete|complete - archived|closed)$/i.test(formById.get(link.formId)?.Status ?? ""))
      ? "Complete" : "In Progress";
  };
  // Model-wide inspection summary, counted by distinct Full Pour ID rather than BIM object.
  // ITP completion is calculated independently of NCR precedence: a completed ITP
  // may still have an open NCR, which correctly takes priority in the 3D colours.
  const inspectionCounts = pourIds.reduce((counts, id) => {
    counts[getInspectionState(id)] += 1;
    return counts;
  }, { NCR: 0, Complete: 0, "In Progress": 0, Unlinked: 0 });
  const itpProgress = pourIds.reduce((counts, id) => {
    const itpLinks = effectivePourLinks.filter(link => link.fullPourId === id &&
      link.recordType !== "NCR" && !/ncr/i.test(formById.get(link.formId)?.FormType ?? ""));
    if (!itpLinks.length) return counts;
    counts.total += 1;
    if (itpLinks.every(link => /^(complete|complete - archived|closed)$/i.test(formById.get(link.formId)?.Status ?? ""))) {
      counts.complete += 1;
    }
    return counts;
  }, { complete: 0, total: 0 });
  const itpCompletionPercent = itpProgress.total ? Math.round(itpProgress.complete / itpProgress.total * 100) : null;
  // Export-wide completion is a separate, factual metric based on actual FieldView
  // ITP records; unlike the model-linked measure, it does not depend on demo links.
  const exportedItpComplete = completeItpForms.length;
  const exportedItpPercent = itpForms.length ? (exportedItpComplete / itpForms.length * 100) : null;
  const unresolvedItpLinks = effectivePourLinks.filter(link =>
    link.recordType !== "NCR" && !formById.has(link.formId));
  const objectsWithoutPourId = allBIMObjects.filter(object => !fullPourId(object)).length;
  const colourableObjects = [...new Map([...allBIMObjects, ...selectedBIMObjects].map(object =>
    [`${object.modelId}:${object.runtimeId}`, object] as const)).values()];
  const colourCandidates = [...new Map([
    ...inspectionIdentifiers.map(entry => ({...entry})),
    ...colourableObjects.map(object => ({modelId: object.modelId, runtimeId: object.runtimeId, fullPourId: fullPourId(object)})),
  ].map(entry => [`${entry.modelId}:${entry.runtimeId}`, entry] as const)).values()];
  const colourEntries = colourCandidates.flatMap(entry => {
    if (!entry.fullPourId) return [];
    const status = getInspectionState(entry.fullPourId);
    const color = status === "Complete" ? "#22C55E" : status === "In Progress" ? "#F59E0B" : status === "NCR" ? "#EF4444" : "";
    return color ? [{ modelId: entry.modelId, runtimeId: entry.runtimeId, color }] : [];
  });
  const colourCommand = { enabled: colourByFieldView, entriesKey: colourEntries
    .map(entry => `${entry.modelId}:${entry.runtimeId}:${entry.color}`).sort().join("|") };

  // Selected model quantities: use one consistent volume property per object,
  // avoid mixing gross and net, and report missing quantities explicitly.
  const selectedUnique = Array.from(new Map(selectedBIMObjects.map(object =>
    [`${object.modelId}:${object.runtimeId}`, object] as const)).values());
  const findVolume = (object: SelectedBIMObject): number | null => {
    const props = object.propertyGroups.flatMap(group => group.properties);
    for (const name of ["NetVolume", "GrossVolume", "Volume"]) {
      const prop = props.find(item => item.name.replace(/[^a-z0-9]/gi, "").toLowerCase() === name.toLowerCase());
      if (!prop) continue;
      const raw = String(prop.value ?? "").trim();
      const match = raw.match(/^(-?\d+(?:[.,]\d+)?)\s*(m³|m3|cubic metres|cubic meters)?$/i);
      if (match) {
        const value = Number(match[1].replace(",", "."));
        if (Number.isFinite(value) && value >= 0) return value;
      }
    }
    return null;
  };
  const volumeValues = selectedUnique.map(findVolume);
  const totalVolume = volumeValues.reduce<number>((sum, volume) => sum + (volume ?? 0), 0);
  const volumeMissing = volumeValues.filter(volume => volume === null).length;
  const typeCounts = Array.from(selectedUnique.reduce((map, object) => {
    map.set(object.ifcClass, (map.get(object.ifcClass) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries());
  const materialCounts = Array.from(selectedUnique.reduce((map, object) => {
    const material = getBIMProperty(object, "Material") || "Not specified";
    map.set(material, (map.get(material) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries());
  const selectedPourIds = Array.from(new Set(selectedUnique.map(fullPourId).filter(Boolean)));
  const selectedFormIds = new Set(effectivePourLinks.filter(link => selectedPourIds.includes(link.fullPourId)).map(link => link.formId));
  const clearSelection = () => { setSelectedBIMObjects([]); setRealSelectedObject(null); setShowSelectedModelOnly(false); setShowSelectedFormsOnly(false); };
  const selectedInspectionCounts = selectedPourIds.reduce((counts, id) => {
    counts[getInspectionState(id)]++;
    return counts;
  }, { NCR: 0, Complete: 0, "In Progress": 0, Unlinked: 0 });
  // Local natural-language search demonstrator. No external AI service or invented answers.
  const aiText = aiSubmitted.trim().toLowerCase();
  const aiPourMatch = aiSubmitted.match(/\b[0-9]+[a-z]+-[0-9]+\/[0-9]+\b/i)?.[0].toUpperCase() ?? "";
  const aiStatus = /ncr|non.conform|failed|red/i.test(aiText) ? "NCR Created"
    : /in.progress|ongoing|amber|outstanding|pending|incomplete|open/i.test(aiText) ? "In Progress"
    : /complete|completed|passed|green/i.test(aiText) ? "Complete" : "";
  const aiIfcMatch = ifcClasses.find(name => aiText.includes(name.toLowerCase()));
  const aiLinked = effectivePourLinks.map(link => ({
    ...link,
    form: fieldViewData?.forms.find(form => form.FormID === link.formId),
    objects: allBIMObjects.filter(object => fullPourId(object) === link.fullPourId),
  }));
  const aiResults = aiText ? aiLinked.filter(item =>
    (!aiPourMatch || item.fullPourId === aiPourMatch) &&
    (!aiStatus || item.form?.Status === aiStatus) &&
    (!aiIfcMatch || item.objects.some(object => object.ifcClass === aiIfcMatch))
  ) : [];
  const aiGeneralQuery = aiText && !aiPourMatch && !aiStatus && !aiIfcMatch
    ? aiText.replace(/^(show|find|list|highlight|what|which|all|me|the|are|is|of|for|with|about|status|pours|pour|elements|objects|inspections|records|forms|fieldview|field view|please|summarise|summarize)\s+/g, "").trim() : "";
  const aiForms = aiText && aiGeneralQuery && fieldViewData
    ? fieldViewData.forms.filter(form => [form.FormID, form.FormTitle, form.FormName, form.Location, form.Status]
        .some(value => (value ?? "").toLowerCase().includes(aiGeneralQuery))).slice(0, 30) : [];
  const aiUnlinked = aiText && !aiStatus && !aiPourMatch && aiIfcMatch
    ? allBIMObjects.filter(object => object.ifcClass === aiIfcMatch) : [];
  const openAiPour = (pourId: string) => {
    setTableSearch(pourId);
    setIfcClassFilter("");
    setPropertyColumnFilter("");
    setPropertyValueFilter("");
    setShowDataViewer(true);
    setActiveTab("data");
  };
  const showAiIn3D = () => {
    const ids = aiResults.map(item => item.fullPourId);
    // The existing spreadsheet search filters by one pour; multiple pours are
    // handled by the existing status-colouring control, not a new viewer API.
    if (ids.length === 1) {
      setTableSearch(ids[0]);
      setIfcClassFilter(""); setPropertyColumnFilter(""); setPropertyValueFilter("");
      setShowFilteredIn3D(true);
      setShowDataViewer(true);
      setActiveTab("data");
    } else {
      setColourByFieldView(true);
      setActiveTab("dashboard");
    }
  };
  const [excelExportBusy, setExcelExportBusy] = useState(false);
  const [excelExportMessage, setExcelExportMessage] = useState("");
  const [excelExportError, setExcelExportError] = useState("");
  const exportModelExcel = async () => {
    setExcelExportMessage("");
    setExcelExportError("");
    if (!filteredBIMObjects.length) {
      setExcelExportError(tableBIMObjects.length === 0
        ? "No BIM data is available. Select a loaded model above and click Load model data, or select objects in the viewer and enable Show selected only."
        : "No rows match the current filters. Clear the Model Data filters or turn off 'Show selected only', then export again.");
      return;
    }
    setExcelExportBusy(true);
    try {
      const XLSX = await import("xlsx");
      const headers = ["Runtime ID", "Object", "IFC Class", "Description", "Model ID", ...visiblePropertyColumns];
      const rows = filteredBIMObjects.map(object => [object.runtimeId, object.name, object.ifcClass, object.description, object.modelId, ...visiblePropertyColumns.map(column => getGroupedProperty(object, column))]);
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      sheet["!cols"] = headers.map((header, index) => ({ wch: Math.min(55, Math.max(14, header.length + 3, ...rows.slice(0, 100).map(row => String(row[index] ?? "").length + 2))) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Model Data");
      // Create a browser download explicitly so errors aren't swallowed by writeFile.
      const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "Trimble_Model_Data.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      setExcelExportMessage(`Download requested: ${rows.length} displayed BIM row(s) in Trimble_Model_Data.xlsx. Check your browser's Downloads if it does not appear.`);
    } catch (error) {
      setExcelExportError(`Excel export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExcelExportBusy(false);
    }
  };
  const clearTableFilters = () => {
    setShowSelectedModelOnly(false);
    setShowFilteredIn3D(false);
    setTableSearch("");
    setIfcClassFilter("");
    setPropertyColumnFilter("");
    setPropertyValueFilter("");
  };
  // -------------------------------------------------------
  // Filter Trimble models
  // -------------------------------------------------------
  const availableTags = [...new Set(models.flatMap(model => model.tags ?? []))].sort();
  const availableFolders = [...new Set(models.map(model => model.folder || "/"))].sort();
  const filteredModels = models.filter((model) => {
    const term = modelSearch.toLowerCase().trim();
    const matchesSearch = !term || [model.name, model.discipline, model.folder || "", ...(model.tags ?? [])]
      .some(value => value.toLowerCase().includes(term));
    const matchesDiscipline = disciplineFilter === "All disciplines" || model.discipline === disciplineFilter;
    const matchesTag = modelTagFilter === "All tags" || (model.tags ?? []).includes(modelTagFilter);
    const matchesFolder = modelFolderFilter === "All folders" || (model.folder || "/") === modelFolderFilter;
    return matchesSearch && matchesDiscipline && matchesTag && matchesFolder;
  });
  // Load the CSV when selected BIM elements, the Forms tab, search, or colouring needs it.
  // IMPORTANT: Do not cancel the in-flight request in this effect's cleanup. Setting
  // fieldViewLoading itself triggers a re-render; the previous cleanup invalidated
  // the request before it resolved, leaving BOTH Forms and selected-element links
  // permanently stuck on "Loading…". loadFieldViewCSV() already deduplicates
  // concurrent calls, and this guard prevents duplicate state requests.
  useEffect(() => {
    const needsFieldView = activeTab === "fieldview" || activeTab === "ai" ||
      allBIMObjects.length > 0 || selectedBIMObjects.length > 0 || colourByFieldView;
    if (!needsFieldView || fieldViewData || fieldViewLoading || fieldViewError) return;
    setFieldViewLoading(true);
    void loadFieldViewCSV()
      .then(data => setFieldViewData(data))
      .catch(error => setFieldViewError(error instanceof Error ? error.message : String(error)))
      .finally(() => setFieldViewLoading(false));
  }, [activeTab, allBIMObjects.length, selectedBIMObjects.length, colourByFieldView, fieldViewData, fieldViewLoading, fieldViewError]);
  const matchingForms = (fieldViewData?.forms ?? []).filter(form =>
    (!showSelectedFormsOnly || selectedFormIds.has(form.FormID)) &&
    (!formStatus || form.Status === formStatus) &&
    (!formSearch.trim() || [form.FormID, form.FormName, form.FormTitle, form.Location, form.OwnedBy, form.FormType]
      .some(value => (value ?? "").toLowerCase().includes(formSearch.trim().toLowerCase())))
  );
  const selectedForm = fieldViewData?.forms.find(form => form.FormID === selectedFormId);
  const selectedFormAnswers = [...(fieldViewData?.answersByForm.get(selectedFormId ?? "") ?? [])]
    .sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0));
  const selectedFormTables = getFormTables(fieldViewData?.tablesByForm.get(selectedFormId ?? "") ?? []);
  const selectedTask = selectedForm?.ParentProcessTaskID
    ? fieldViewData?.tasksById.get(selectedForm.ParentProcessTaskID) : undefined;
  // -------------------------------------------------------
  // -------------------------------------------------------
  // Load Trimble models
  // -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      setModelsLoading(true);
      setModelDiscoveryError("");
      try {
        const result = await getModels();
        if (cancelled) return;
        setModels(existing => result.models.map(model => ({
          ...model, loaded: existing.find(item => item.id === model.id)?.loaded ?? false,
        })));
        setModelDiscoveryWarnings(result.warnings ?? []);
        setModelScannedFolders(result.scannedFolders ?? 0);
      } catch (error) {
        if (!cancelled) {
          setModelDiscoveryError(error instanceof Error ? error.message : String(error));
          setModelDiscoveryWarnings([]);
          // Keep any previously loaded models on screen on a transient network failure.
        }
      } finally { if (!cancelled) setModelsLoading(false); }
    };
    void loadModels();
    return () => { cancelled = true; };
  }, [modelRefreshSequence, authStatus]);
  // Asite connection readiness; no credentials are sent from the browser.
  useEffect(() => {
    let cancelled = false;
    setAsiteConnection("checking");
    fetch("/api/asite/connection", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
        return response.json() as Promise<{ configured: boolean; message?: string }>;
      })
      .then(data => {
        if (cancelled) return;
        setAsiteConnection(data.configured ? "unavailable" : "not-configured");
        setAsiteMessage(data.message ?? "Asite OAuth integration has not been configured.");
      })
      .catch(error => {
        if (cancelled) return;
        setAsiteConnection("unavailable");
        setAsiteMessage(error instanceof Error ? error.message : "Backend unavailable");
      });
    return () => { cancelled = true; };
  }, [asiteCheckSequence]);
  // -------------------------------------------------------
  // Trimble OAuth callback
  // -------------------------------------------------------
  useEffect(() => {
    const handleTrimbleCallback = async () => {
      if (
        window.location.pathname !==
        "/auth/callback"
      ) {
        return;
      }
      const params = new URLSearchParams(
        window.location.search
      );
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      if (error) {
        console.error(
          "Trimble returned an OAuth error:",
          error
        );
        setAuthStatus("Login failed");
        return;
      }
      if (!code || !state) {
        console.error(
          "Missing code or state from Trimble callback"
        );
        setAuthStatus("Login failed");
        return;
      }
      try {
        setAuthStatus("Connecting...");
        const response = await fetch(
          "/api/auth/callback",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              code,
              state,
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          console.error(
            "Authentication failed:",
            data
          );
          setAuthStatus("Login failed");
          return;
        }
        console.log(
          "Trimble authentication successful:",
          data
        );
        setAuthStatus("Connected");
        window.history.replaceState(
          {},
          "",
          "/"
        );
      } catch (error) {
        console.error(
          "Callback failed:",
          error
        );
        setAuthStatus("Login failed");
      }
    };
    handleTrimbleCallback();
  }, []);
  // -------------------------------------------------------
  // Start Trimble login
  // -------------------------------------------------------
  const connectToTrimble = async () => {
    try {
      console.log(
        "Starting Trimble login..."
      );
      const response = await fetch(
        "/api/auth/login"
      );
      if (!response.ok) {
        throw new Error(
          "Could not start Trimble login"
        );
      }
      const data = await response.json();
      window.location.href =
        data.authorizationUrl;
    } catch (error) {
      console.error(
        "Trimble login failed:",
        error
      );
      alert(
        "Could not connect to Trimble"
      );
    }
  };
  // -------------------------------------------------------
  // Toggle Trimble model
  // -------------------------------------------------------
  const setModelsLoaded = (modelIds: string[], loaded: boolean) => {
    const ids = [...new Set(modelIds)].filter(id => models.some(model => model.id === id && model.loaded !== loaded));
    if (!ids.length) return;
    setModels(current => current.map(item => ids.includes(item.id) ? { ...item, loaded } : item));
    if (!loaded) {
      setInspectionIdentifiers(current => current.filter(entry => !ids.includes(entry.modelId)));
      setAllBIMObjects(current => current.filter(object => !ids.includes(object.modelId)));
      setCachedModelIds(current => current.filter(id => !ids.includes(id)));
      setShowFilteredIn3D(false);
    }
    setModelCommand(previous => ({ ids, loaded, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const toggleModel = (modelId: string) => {
    const model = models.find(item => item.id === modelId);
    if (model) setModelsLoaded([modelId], !model.loaded);
  };
  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------
  return (
    <div className="app">
      {/* HEADER */}
      <header className="app-header">
        <div>
          <h1>
            Project Model Intelligence
          </h1>
          <p>
            Trimble Connect + Asite +
            FieldView integration POC
          </p>
        </div>
        <div className="header-actions">
          <button
            className="trimble-connect-button"
            onClick={connectToTrimble}
          >
            Connect to Trimble
          </button>
          <div className="status">
            <span
              className={`status-dot ${
                authStatus === "Connected"
                  ? "connected"
                  : ""
              }`}
            />
            {authStatus}
          </div>
        </div>
      </header>
      <nav className="dashboard-tabs" aria-label="Dashboard views">
        <button
          type="button"
          className={activeTab === "dashboard" ? "dashboard-tab active" : "dashboard-tab"}
          aria-current={activeTab === "dashboard" ? "page" : undefined}
          onClick={() => setActiveTab("dashboard")}
        >
          3D Dashboard
        </button>
        <button
          type="button"
          className={activeTab === "data" ? "dashboard-tab active" : "dashboard-tab"}
          aria-current={activeTab === "data" ? "page" : undefined}
          onClick={() => setActiveTab("data")}
        >
          Model Data
        </button>
        <button type="button" className={activeTab === "fieldview" ? "dashboard-tab active" : "dashboard-tab"}
          aria-current={activeTab === "fieldview" ? "page" : undefined}
          onClick={() => setActiveTab("fieldview")}>FieldView Forms</button>
        <button type="button" className={activeTab === "ai" ? "dashboard-tab active" : "dashboard-tab"}
          aria-current={activeTab === "ai" ? "page" : undefined}
          onClick={() => setActiveTab("ai")}>AI Search (demo)</button>
        <button type="button" className={activeTab === "asite" ? "dashboard-tab active" : "dashboard-tab"}
          aria-current={activeTab === "asite" ? "page" : undefined}
          onClick={() => setActiveTab("asite")}>Asite Model Sync</button>
      </nav>

      {/* WORKSPACE */}
      <main className={`workspace ${activeTab === "data" ? "model-data-mode" : ""} ${showDataViewer ? "data-viewer-visible" : ""} ${activeTab === "dashboard" && viewerExpanded ? "viewer-expanded" : ""}`} style={(activeTab === "fieldview" || activeTab === "ai" || activeTab === "asite") ? { display: "none" } : activeTab === "data" ? { display: "flex", flexDirection: "column", width: "100%" } : undefined}>
        {/* LEFT COLUMN */}
        <div className="workspace-left" style={activeTab === "data" ? { display: showDataViewer ? "block" : "none", width: "100%" } : undefined}>
          {/* TRIMBLE VIEWER */}
          <section className="panel viewer-panel" style={activeTab === "data" ? { display: showDataViewer ? "flex" : "none", height: "55vh", minHeight: 400 } : undefined}>
            <div className="panel-header">
              <div>
                <h2>3D Model</h2>
                <span>
                  Trimble Connect
                </span>
              </div>
              <div className="viewer-header-actions">
                <span className="panel-badge">Structural</span>
                {activeTab === "dashboard" && <button type="button" className="panel-action viewer-expand-action" onClick={() => setViewerExpanded(value => !value)} aria-pressed={viewerExpanded} title={viewerExpanded ? "Restore dashboard panels" : "Expand 3D viewer"}>
                  {viewerExpanded ? "↙ Restore layout" : "⛶ Expand viewer"}
                </button>}
              </div>
            </div>
            <div className="viewer-container">
              <TrimbleViewer
                modelCommand={modelCommand}
                dataCommand={dataCommand}
                onDataProgress={setDataProgress}
                selectionCommand={selectionCommand}
                visibilityCommand={visibilityCommand}
                colourCommand={colourCommand}
                inspectionScanEnabled={colourByFieldView && Boolean(fieldViewData)}
                inspectionScanModelIds={models.filter(model => model.loaded).map(model => model.id)}
                inspectionScanRetry={inspectionScanRetry}
                onInspectionScanProgress={setInspectionScan}
                onInspectionIdentifiers={(modelId, identifiers) => {
                  setInspectionIdentifiers(current => [
                    ...current.filter(entry => entry.modelId !== modelId),
                    ...identifiers.map(entry => ({ modelId, ...entry })),
                  ]);
                }}
                onModelObjectsLoaded={(modelId, objects) => {
                  setAllBIMObjects(current => [...current.filter(object => object.modelId !== modelId), ...objects]);
                  setCachedModelIds(current => current.includes(modelId) ? current : [...current, modelId]);
                }}
                onObjectsSelected={(objects) => {
                  setSelectedBIMObjects(objects);
                  setRealSelectedObject(objects[0] ?? null);
                }}
              />
            </div>
          </section>
          <section className={`panel inspection-panel ${panelCollapsed.inspections ? "panel-collapsed" : ""}`} style={{ marginTop: 12 }} aria-label="FieldView pour inspection status">
            <div className="inspection-heading">
              <div><h2>FieldView Pour Inspection Status</h2><span>Inspection performance · model-linked associations are illustrative</span></div>
              <button type="button" className="panel-action" aria-expanded={!panelCollapsed.inspections} onClick={() => togglePanel("inspections")}>{panelCollapsed.inspections ? "+ Expand" : "− Minimise"}</button>
            </div>
            <div className="inspection-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: "0 0 5px", fontSize: 19 }}>FieldView Pour Inspection Status</h3>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>Model-wide status by unique Full Pour ID · demonstration associations</p>
              </div>
              <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={colourByFieldView} onChange={event => {
                  setColourByFieldView(event.target.checked);
                  if (event.target.checked) setInspectionScan(null);
                }} />
                Colour model by FieldView status
              </label>
              {colourByFieldView && <div role="status" style={{fontSize: 12, marginTop: 8}}>
                {fieldViewLoading ? "Loading FieldView records… " : !fieldViewData ? "Waiting for FieldView records… " :
                  inspectionScan?.status === "loading" ? (inspectionScan.message || `Scanning pour identifiers: ${inspectionScan.loaded}/${inspectionScan.total} elements… `) :
                  inspectionScan?.status === "error" ? `Identifier scan: ${inspectionScan.message} ` :
                  inspectionScan?.status === "complete" ? `Inspected ${inspectionScan.loaded} elements for pour IDs. ` :
                  "Preparing identifier-only scan… "}
                {inspectionScan?.status === "error" && <button type="button" onClick={() => setInspectionScanRetry(value => value + 1)}>Retry scan</button>}
                <span style={{marginLeft: 8, opacity: .75}}>The optional whole-model scan requests properties in batches; switch off to cancel. Selecting a single element remains on-demand.</span>
              </div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginTop: 17 }}>
              {([
                { label: "ITP Complete", count: inspectionCounts.Complete, colour: "#22C55E", detail: "No open NCR" },
                { label: "ITP In Progress", count: inspectionCounts["In Progress"], colour: "#F59E0B", detail: "Inspection outstanding" },
                { label: "Open NCR", count: inspectionCounts.NCR, colour: "#EF4444", detail: "Overrides ITP colour" },
                { label: "Unlinked", count: inspectionCounts.Unlinked, colour: "#94A3B8", detail: "No mapped record" },
              ] as const).map(item => (
                <div key={item.label} style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "13px 14px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span aria-hidden="true" style={{ display: "inline-block", width: 18, height: 18, flexShrink: 0, borderRadius: 5, background: item.colour, border: "1px solid #64748b55" }} />
                    <strong style={{ fontSize: 14 }}>{item.label}</strong>
                  </div>
                  <div style={{ fontSize: 29, fontWeight: 750, marginTop: 8, lineHeight: 1.2 }}>{item.count}</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 5 }}>{item.detail} · pours</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 17, borderTop: "1px solid #cbd5e1", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>FieldView export — ITP completion</strong>
                <strong style={{ fontSize: 17 }}>{exportedItpPercent === null ? "Not available" : `${exportedItpPercent.toFixed(1)}%`}</strong>
              </div>
              <div role="progressbar" aria-label="Exported ITP completion, read-only" aria-valuemin={0} aria-valuemax={100} aria-valuenow={exportedItpPercent ?? 0}
                style={{ height: 14, background: "#cbd5e1", borderRadius: 8, overflow: "hidden", marginTop: 9 }}>
                <div style={{ width: `${exportedItpPercent ?? 0}%`, height: "100%", minWidth: exportedItpPercent && exportedItpPercent > 0 ? 3 : 0, background: "#22C55E", borderRadius: 8 }} />
              </div>
              <p style={{ fontSize: 13, margin: "8px 0 0", opacity: 0.85 }}>
                <strong>{exportedItpComplete} of {itpForms.length}</strong> reinforced-concrete ITP forms in the CSV export are Complete, Complete - Archived or Closed.
                {fieldViewLoading ? " Loading export…" : ""}
              </p>
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>Model-linked pours — demonstration ITP completion</strong>
                <strong style={{ fontSize: 17 }}>{itpCompletionPercent === null ? "Not available" : `${itpCompletionPercent}%`}</strong>
              </div>
              <div role="progressbar" aria-label="Model-linked ITP completion, read-only" aria-valuemin={0} aria-valuemax={100} aria-valuenow={itpCompletionPercent ?? 0}
                style={{ height: 12, background: "#cbd5e1", borderRadius: 8, overflow: "hidden", marginTop: 9 }}>
                <div style={{ width: `${itpCompletionPercent ?? 0}%`, height: "100%", background: "#22C55E", borderRadius: 8 }} />
              </div>
              <p style={{ fontSize: 13, margin: "8px 0 0", opacity: 0.85 }}>
                <strong>{itpProgress.complete} of {itpProgress.total}</strong> model pours with linked ITP records have completed inspections. This uses illustrative BIM-to-form links and is independent of open NCRs.
              </p>
              {unresolvedItpLinks.length > 0 && <p style={{ color: "#b45309", fontSize: 12 }}>
                Data check: {unresolvedItpLinks.length} demonstration form links have no matching FormID in the loaded export; these cannot count as completed.
              </p>}
              <p style={{ fontSize: 12, opacity: 0.75, margin: "9px 0 0" }}>Both bars are read-only indicators, not adjustable sliders. The model status colours continue to give open NCRs precedence.</p>
            </div>
            <p style={{ fontSize: 12, margin: "13px 0 0", opacity: 0.8 }}>
              {pourIds.length} unique model pours · {colourEntries.length} colour-eligible BIM objects · {objectsWithoutPourId} BIM objects without a Full Pour ID.
              {" "}Grey indicates unlinked pours in this legend; the viewer retains their original colour.
              {" "}All BIM-to-FieldView links are illustrative and have not been verified.
            </p>
            {pourLinkError && <p style={{ color: "#b91c1c" }}>Could not load demo links: {pourLinkError}</p>}
            </div>
          </section>
          {/* MODEL MANAGEMENT */}
          <section className={`panel models-panel ${panelCollapsed.models ? "panel-collapsed" : ""}`} style={activeTab === "data" ? { display: "none" } : undefined}>
            <div className="panel-header">
              <div>
                <h2>Models</h2>
                <span>
                  Project model selection and document register
                </span>
              </div>
              <button type="button" className="panel-action" aria-expanded={!panelCollapsed.models} onClick={() => togglePanel("models")}>{panelCollapsed.models ? "+ Expand" : "− Minimise"}</button>
            </div>
            <div className="models-content">
              {/* SEARCH */}
              <div className="model-toolbar">
                <input
                  type="text"
                  placeholder="Search models..."
                  className="model-search"
                  value={modelSearch}
                  onChange={(event) =>
                    setModelSearch(
                      event.target.value
                    )
                  }
                />
                <select
                  className="discipline-filter"
                  value={
                    disciplineFilter
                  }
                  onChange={(event) =>
                    setDisciplineFilter(
                      event.target.value
                    )
                  }
                >
                  <option>
                    All disciplines
                  </option>
                  <option>
                    Structural
                  </option>
                  <option>
                    Architectural
                  </option>
                  <option>MEP</option>
                </select>
              </div>
              <div className="model-toolbar" style={{ marginTop: 10 }}>
                <select className="discipline-filter" aria-label="Filter models by Trimble Connect tag"
                  value={modelTagFilter} onChange={event => setModelTagFilter(event.target.value)}>
                  <option>All tags</option>
                  {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                <select className="discipline-filter" aria-label="Filter models by folder"
                  value={modelFolderFilter} onChange={event => setModelFolderFilter(event.target.value)}>
                  <option>All folders</option>
                  {availableFolders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
                </select>
              </div>
              <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", margin:"10px 0"}}>
                <button type="button" onClick={() => setModelRefreshSequence(value => value + 1)} disabled={modelsLoading}>Refresh models</button>
                <button type="button" onClick={() => setModelsLoaded(filteredModels.map(model => model.id), true)}
                  disabled={modelsLoading || !filteredModels.length}>Load filtered ({filteredModels.length})</button>
                <button type="button" onClick={() => setModelsLoaded(models.map(model => model.id), true)}
                  disabled={modelsLoading || !models.length}>Load all ({models.length})</button>
                <button type="button" onClick={() => setModelsLoaded(models.map(model => model.id), false)}
                  disabled={!models.some(model => model.loaded)}>Unload all</button>
              </div>
              <p style={{fontSize:12, margin:"6px 0", color:"#64748b"}}>
                {models.length} models discovered in {modelScannedFolders} folders · {filteredModels.length} shown · {models.filter(model => model.loaded).length} selected for loading.
                Loading every large model may take time.
              </p>
              {modelDiscoveryError && <p role="alert" style={{color:"#b42318", fontSize:12}}>{modelDiscoveryError}</p>}
              {modelDiscoveryWarnings.length > 0 && <p style={{fontSize:12, color:"#9a6700"}} title={modelDiscoveryWarnings.join("\n")}>{modelDiscoveryWarnings[0]}{modelDiscoveryWarnings.length > 1 ? ` (+${modelDiscoveryWarnings.length - 1} more warnings)` : ""}</p>}
              {/* TRIMBLE MODELS */}
              <div className="section-title">
                Trimble Connect Models
              </div>
              <div className="model-list">
                {modelsLoading && (
                  <div className="model-row">
                    Loading models...
                  </div>
                )}
                {!modelsLoading && !filteredModels.length && <div className="model-row">No models match the selected filters.</div>}
                {!modelsLoading &&
                  filteredModels.map(
                    (model) => (
                      <label
                        className="model-row"
                        key={model.id}
                      >
                        <input
                          type="checkbox"
                          checked={
                            model.loaded
                          }
                          onChange={() =>
                            toggleModel(
                              model.id
                            )
                          }
                        />
                        <div className="model-details">
                          <strong>
                            {model.name}
                          </strong>
                          <span>
                            {
                              model.discipline
                            }{" "}
                            · {model.source}
                          </span>
                          {model.folder && <span title="Trimble Connect folder" style={{overflowWrap:"anywhere"}}>Folder: {model.folder}</span>}
                          {(model.tags ?? []).length > 0 && <span title="Trimble Connect tags" style={{overflowWrap:"anywhere"}}>Tags: {model.tags.join(", ")}</span>}
                        </div>
                        {model.loaded && (
                          <span className="loaded-badge">
                            Loaded
                          </span>
                        )}
                      </label>
                    )
                  )}
              </div>
              {/* Documents are listed from Trimble Connect, not stored in this dashboard. */}
              <div className="section-title" style={{marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8}}>
                <span>Trimble Connect PDFs — XX Sandbox</span>
                <button type="button" onClick={() => void loadDashboardDocuments()} disabled={dashboardDocsLoading} style={{fontSize: 12}}>
                  {dashboardDocsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
              {dashboardDocsError && <p role="alert" style={{color: "#b42318", fontSize: 12}}>{dashboardDocsError}</p>}
              {!dashboardDocsLoading && !dashboardDocsError && tcDocuments.length === 0 && (
                <p style={{fontSize: 12, color: "#64748b"}}>No PDFs listed. Connect to Trimble, then click Refresh.</p>
              )}
              <div className="model-list" aria-label="Trimble Connect PDF documents">
                {tcDocuments.map(doc => (
                  <div className="model-row" key={doc.id} style={{display: "flex", alignItems: "center", gap: 10}}>
                    <span aria-hidden="true">📄</span>
                    <div className="model-details" style={{minWidth: 0, flex: 1}}>
                      <strong style={{overflowWrap: "anywhere"}}>{doc.name}</strong>
                      <span>PDF{doc.revision != null ? ` · Revision ${doc.revision}` : ""}</span>
                    </div>
                    <button type="button" onClick={() => setActiveTab("ai")} style={{fontSize: 12}} aria-label={`Search or index ${doc.name} in AI Search`}>
                      AI Search
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
        {/* RIGHT COLUMN */}
        <div className="workspace-right" style={activeTab === "data" ? { display: "none" } : undefined}>
          {/* MODEL INFORMATION */}
          <section className={`panel information-panel ${panelCollapsed.information ? "panel-collapsed" : ""}`}>
            <div className="panel-header">
              <div>
                <h2>
                  Model Information
                </h2>
                <span>
                  BIM object information
                </span>
              </div>
              <button type="button" className="panel-action" aria-expanded={!panelCollapsed.information} onClick={() => togglePanel("information")}>{panelCollapsed.information ? "+ Expand" : "− Minimise"}</button>
            </div>
            <div className="information-content">
              {/* Summary from the loaded Trimble model and exported FieldView CSVs. */}
              <div className="summary-grid">
                <div className="summary-card"><span>Loaded BIM elements</span><strong>{allBIMObjects.length}</strong></div>
                <div className="summary-card"><span>FieldView forms (CSV)</span><strong>{fieldViewData ? fieldViewData.forms.length : "…"}</strong></div>
                <div className="summary-card"><span>Demo-linked pours</span><strong>{new Set(effectivePourLinks.map(link => link.fullPourId)).size}</strong></div>
                <div className="summary-card"><span>Linked BIM elements</span><strong>{allBIMObjects.filter(object => effectivePourLinks.some(link => link.fullPourId === fullPourId(object))).length}</strong></div>
              </div>
              <p style={{ fontSize: 12, margin: "10px 0", color: "#64748b" }}>
                FieldView forms come from the CSV export. BIM-to-form links are demonstration-only mappings, including automatically generated associations for pours without supplied links.
              </p>
              {selectedUnique.length > 0 && <button type="button" onClick={clearSelection}>Clear selection</button>}
              <div className="selected-object" style={{ marginTop: 14, padding: 12 }}>
                <div className="section-title">Selected objects — combined quantities and inspections</div>
                <div className="summary-grid">
                  <div className="summary-card"><span>Selected objects</span><strong>{selectedUnique.length}</strong></div>
                  <div className="summary-card"><span>Volume (available m³)</span><strong>{volumeValues.every(v => v === null) ? "Not available" : totalVolume.toFixed(3)}</strong></div>
                  <div className="summary-card"><span>Unique pours</span><strong>{selectedPourIds.length}</strong></div>
                  <div className="summary-card"><span>Missing volume</span><strong>{volumeMissing} objects</strong></div>
                </div>
                {selectedUnique.length > 0 && <>
                  <p><strong>IFC types:</strong> {typeCounts.map(([type, count]) => `${type}: ${count}`).join(" · ")}</p>
                  <p><strong>Materials:</strong> {materialCounts.map(([material, count]) => `${material}: ${count}`).join(" · ")}</p>
                  <p><strong>Pour inspection summary:</strong> <span style={{ color: "#15803d" }}>{selectedInspectionCounts.Complete} complete</span> · <span style={{ color: "#b45309" }}>{selectedInspectionCounts["In Progress"]} in progress</span> · <span style={{ color: "#dc2626" }}>{selectedInspectionCounts.NCR} open NCR</span> · {selectedInspectionCounts.Unlinked} unlinked</p>
                  <small>Quantities are derived from available IFC NetVolume, GrossVolume or Volume properties, assumed m³ only when no unit is supplied. Missing values are excluded; totals may be partial. Inspection links are demonstration-only.</small>
                  {selectedPourIds.map(id => <div key={id} style={{ marginTop: 8 }}><strong>{id}</strong> — {getInspectionState(id)} {effectivePourLinks.filter(link => link.fullPourId === id).map(link =>
                    <button key={`${id}-${link.formId}`} type="button" style={{ marginLeft: 8 }} onClick={() => { setSelectedFormId(link.formId); setActiveTab("fieldview"); }}>{link.recordType || "Form"}: {link.formId}</button>)}</div>)}
                </>}
                {!selectedUnique.length && <p>Select one or multiple objects in the 3D viewer to see their combined quantities and inspection statuses.</p>}
              </div>
              {/* SELECTED OBJECT */}
              <div className="selected-object">
                <div className="section-title">
                  Selected Object
                  <span className="mock-label">
                    {realSelectedObject ? "Live Trimble data" : "Awaiting selection"}
                  </span>
                </div>
                {!realSelectedObject && (
                  <div className="empty-selection">
                    Select an object in
                    the 3D model to view
                    its BIM properties
                    and associated field
                    information.
                  </div>
                )}
                {realSelectedObject && (
                  <div className="model-list">
                    {[
                      ["Object", realSelectedObject.name],
                      ["IFC Class", realSelectedObject.ifcClass],
                      ["Description", realSelectedObject.description],
                      ["Model ID", realSelectedObject.modelId],
                      ["Runtime ID", String(realSelectedObject.runtimeId)],
                      ["IFC GUID", getBIMProperty(realSelectedObject, "GlobalId") ?? "Not available"],
                      ["Material", getBIMProperty(realSelectedObject, "Material") ?? "Not available"],
                      ["Position", realSelectedObject.position
                        ? `X: ${realSelectedObject.position.x}, Y: ${realSelectedObject.position.y}, Z: ${realSelectedObject.position.z}`
                        : "Not available"],
                    ].map(([label, value]) => (
                      <div className="model-row" key={label}>
                        <div className="model-details">
                          <span>{label}</span>
                          <strong style={{ overflowWrap: "anywhere" }}>{value}</strong>
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: 12, border: "1px solid #b7c7d9", borderRadius: 8, marginTop: 12 }}>
                      <strong>FieldView pour association (demonstration only)</strong>
                      <p style={{ margin: "8px 0" }}>Full Pour ID: <strong>{selectedPourId || "Not found on this element"}</strong></p>
                      {selectedPourId && !fieldViewData && fieldViewLoading && <p>Loading FieldView forms for the selected pour…</p>}
                      {selectedPourId && fieldViewError && <p role="alert">FieldView CSV could not be loaded: {fieldViewError}</p>}
                      {selectedPourLinks.length === 0 && !fieldViewLoading ? <p>No demonstration FieldView mapping for this pour.</p> : selectedPourLinks.map(link => {
                        const form = fieldViewData?.forms.find(item => item.FormID === link.formId);
                        return <div key={link.formId} style={{ marginTop: 8 }}>
                          <strong>{form?.FormName || link.formId}</strong> · {link.recordType || "Form"} · {form?.Status || "Loading form…"} · {link.association === "generated-demo" ? "Generated demonstration link" : "Supplied demonstration link"}
                          <div><button type="button" onClick={() => {
                            setSelectedFormId(link.formId); setActiveTab("fieldview");
                          }}>Open FieldView form {link.formId}</button></div>
                        </div>;
                      })}
                    </div>
                    {realSelectedObject.propertyGroups.map((group, index) => (
                      <details
                        key={`${group.name}-${index}`}
                        className="bim-property-group"
                      >
                        <summary className="bim-property-group-header">
                          <strong>{group.name}</strong>
                          <span>{group.properties.length} properties</span>
                        </summary>
                        <div className="bim-property-group-content">
                          {group.properties.map((property, propertyIndex) => (
                            <div
                              className="model-row"
                              key={`${property.name}-${propertyIndex}`}
                            >
                              <div className="model-details">
                                <span>{property.name}</span>
                                <strong style={{ overflowWrap: "anywhere" }}>
                                  {formatBIMValue(property.value)}
                                </strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
          {/* Exported FieldView forms associated with the selected BIM element. */}
          <section className={`panel field-panel ${panelCollapsed.field ? "panel-collapsed" : ""}`}>
            <div className="panel-header">
              <div>
                <h2>Field Information</h2>
                <span>{realSelectedObject ? `Selected pour: ${selectedPourId || "No Full Pour ID"}` : "Select a BIM element to see linked inspections"}</span>
              </div>
              <div className="panel-header-controls"><span className="mock-badge">DEMO LINKS</span>
                <button type="button" className="panel-action" aria-expanded={!panelCollapsed.field} onClick={() => togglePanel("field")}>{panelCollapsed.field ? "+ Expand" : "− Minimise"}</button>
              </div>
            </div>
            <div className="field-summary">
              <div><span>Exported forms</span><strong>{fieldViewData?.forms.length ?? "…"}</strong></div>
              <div><span>Linked forms</span><strong>{realSelectedObject ? selectedPourLinks.length : "—"}</strong></div>
              <div><span>Mock-linked pours</span><strong>{new Set(effectivePourLinks.map(link => link.fullPourId)).size}</strong></div>
            </div>
            <div className="field-records">
              {fieldViewError && <p style={{ color: "#b91c1c" }}>FieldView CSV load error: {fieldViewError}</p>}
              {!realSelectedObject && <div className="empty-selection">Select an element in Trimble 3D or the Model Data spreadsheet to view its associated inspection forms.</div>}
              {realSelectedObject && selectedPourLinks.length === 0 && <div className="empty-selection">No demonstration FieldView form is mapped to this element's Full Pour ID.</div>}
              {selectedPourLinks.map(link => {
                const form = fieldViewData?.forms.find(item => item.FormID === link.formId);
                return <button className="field-record" key={`${link.fullPourId}-${link.formId}`} type="button" onClick={() => { setSelectedFormId(link.formId); setActiveTab("fieldview"); }}>
                  <div className="record-type">{link.recordType || "FORM"}</div>
                  <div className="record-main"><strong>{form?.FormName || form?.FormTitle || link.formId}</strong><span>{link.formId} · Full Pour ID {link.fullPourId} · {link.association === "generated-demo" ? "Generated demonstration association" : "Supplied demonstration association"}</span></div>
                  <span className="record-status">{form?.Status || (fieldViewLoading ? "Loading…" : "View form")}</span>
                </button>;
              })}
            </div>
          </section>
        </div>

        {/* MODEL DATA TAB: first-stage layout. Full model extraction comes next. */}
        <section className="panel model-data-panel" style={{ display: activeTab === "data" ? "block" : "none", width: "100%" }}>
          <div className="panel-header model-data-header">
            <div>
              <h2>Model Data</h2>
              <span>On-demand BIM properties · select one model to extract its data</span>
            </div>
            <button
              type="button"
              className="trimble-connect-button"
              onClick={() => setShowDataViewer((current) => !current)}
            >
              {showDataViewer ? "Hide 3D" : "Show 3D"}
            </button>
          </div>
          <div className="model-data-content">
            <div style={{ padding: 14, marginBottom: 12, border: "1px solid #b9d8dc", background: "#f4fafb", borderRadius: 8 }}>
              <strong style={{display:"block",marginBottom:8}}>On-demand model data</strong>
              <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                <select aria-label="Select model for BIM data extraction" className="discipline-filter"
                  value={modelDataChoice} onChange={event => setModelDataChoice(event.target.value)}>
                  <option value="">Choose a loaded model…</option>
                  {models.filter(model => model.loaded).map(model =>
                    <option key={model.id} value={model.id}>{model.name}{cachedModelIds.includes(model.id) ? " (cached)" : ""}</option>)}
                </select>
                <button type="button" className="trimble-connect-button" disabled={!modelDataChoice || dataProgress?.status === "loading"}
                  onClick={() => requestModelData("load")}>{cachedModelIds.includes(modelDataChoice) ? "Reload model data" : "Load model data"}</button>
                <button type="button" disabled={dataProgress?.status !== "loading"}
                  onClick={() => requestModelData("cancel")}>Cancel extraction</button>
                <button type="button" disabled={!modelDataChoice || !cachedModelIds.includes(modelDataChoice)}
                  onClick={() => requestModelData("clear")}>Clear cached model data</button>
              </div>
              <p style={{fontSize:12,color:"#526878",margin:"8px 0 4px"}}>
                Models remain in the 3D viewer without bulk property requests. Clicking a viewer element retrieves its properties immediately.
                For a spreadsheet or Excel export, load a chosen model here. {cachedModelIds.length} model dataset(s) cached in this browser session.
              </p>
              {dataProgress && <div role="status" style={{fontSize:12,marginTop:8}}>
                {dataProgress.status === "loading" ? `Extracting ${dataProgress.loaded.toLocaleString()} / ${dataProgress.total ? dataProgress.total.toLocaleString() : "…"} elements` :
                 dataProgress.status === "complete" ? `Extraction complete: ${dataProgress.loaded.toLocaleString()} elements` :
                 dataProgress.status === "cancelled" ? "Extraction cancelled" : `Extraction failed: ${dataProgress.message || "Unknown error"}`}
                {dataProgress.status === "loading" && dataProgress.total > 0 &&
                  <progress value={dataProgress.loaded} max={dataProgress.total} style={{display:"block",width:"min(100%,500px)",marginTop:5}} />}
              </div>}
              <p style={{fontSize:12,color:"#795a13",margin:"8px 0 0"}}>
                FieldView colour mapping and 3D spreadsheet isolation apply to extracted model datasets; unextracted models are not treated as having no inspections.
              </p>
            </div>
            <div style={{ padding: 14, marginBottom: 12, border: "1px solid #cbd5e1", borderRadius: 8 }}>
              <strong>Selected elements: {selectedUnique.length}</strong>
              <span style={{ marginLeft: 16 }}>Unique pours: {selectedPourIds.length}</span>
              <span style={{ marginLeft: 16 }}>Combined volume: {volumeValues.every(v => v === null) ? "Not available" : `${totalVolume.toFixed(3)} m³`}</span>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                <label><input type="checkbox" checked={showSelectedModelOnly} onChange={event => setShowSelectedModelOnly(event.target.checked)} /> Show selected only</label>
                <button type="button" onClick={clearSelection} disabled={!selectedUnique.length}>Clear selection</button>
                <button type="button" onClick={() => void exportModelExcel()} disabled={excelExportBusy}>{excelExportBusy ? "Preparing Excel…" : "Export displayed rows to Excel (.xlsx)"}</button>
              </div>
              {excelExportError && <p role="alert" style={{ fontSize: 12, color: "#b42318", margin: "8px 0 0" }}>{excelExportError}</p>}
              {excelExportMessage && <p role="status" style={{ fontSize: 12, color: "#08746d", margin: "8px 0 0" }}>{excelExportMessage}</p>}
              {selectedUnique.length > 0 && <p style={{ fontSize: 12, margin: "8px 0 0" }}>Selected: {selectedUnique.map(object => object.name || `${object.modelId}:${object.runtimeId}`).join(" · ")}</p>}
            </div>
            <div className="model-data-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <input
                className="model-search"
                type="search"
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Search all BIM properties..."
                aria-label="Search model data"
              />
              <select
                className="discipline-filter"
                aria-label="Filter by IFC class"
                value={ifcClassFilter}
                onChange={(event) => setIfcClassFilter(event.target.value)}
              >
                <option value="">All IFC classes</option>
                {ifcClasses.map(ifcClass => <option key={ifcClass} value={ifcClass}>{ifcClass}</option>)}
              </select>
              <select
                className="discipline-filter"
                aria-label="Choose IFC property column"
                value={propertyColumnFilter}
                onChange={(event) => {
                  setPropertyColumnFilter(event.target.value);
                  setPropertyValueFilter("");
                }}
              >
                <option value="">All property columns</option>
                {propertyColumns.map(column => <option key={column} value={column}>{column}</option>)}
              </select>
              <select
                className="discipline-filter"
                aria-label="Filter by property value"
                value={propertyValueFilter}
                onChange={(event) => setPropertyValueFilter(event.target.value)}
                disabled={!propertyColumnFilter}
              >
                <option value="">All values</option>
                {propertyValues.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              <button type="button" onClick={clearTableFilters}
                disabled={!tableSearch && !ifcClassFilter && !propertyColumnFilter && !propertyValueFilter}>
                Reset filters
              </button>
              <details style={{ position: "relative" }}>
                <summary style={{ cursor: "pointer", padding: "7px 10px", border: "1px solid #ccc", borderRadius: 4 }}>
                  Choose columns ({visiblePropertyColumns.length}/{propertyColumns.length})
                </summary>
                <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, width: 330, maxWidth: "85vw", maxHeight: 360, overflowY: "auto", background: "white", color: "#222", border: "1px solid #ccc", borderRadius: 4, boxShadow: "0 4px 12px #0002", padding: 12 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button type="button" onClick={() => setHiddenPropertyColumns([])}>Select all</button>
                    <button type="button" onClick={() => setHiddenPropertyColumns(propertyColumns)}>Clear all</button>
                    <button type="button" onClick={() => setHiddenPropertyColumns([])}>Reset to default</button>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>The five main columns remain visible. Search and filters still use all properties.</div>
                  {propertyColumns.map(column => (
                    <label key={column} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", cursor: "pointer", overflowWrap: "anywhere" }}>
                      <input type="checkbox" checked={!hiddenPropertyColumns.includes(column)}
                        onChange={event => setHiddenPropertyColumns(current => event.target.checked
                          ? current.filter(item => item !== column)
                          : [...current, column])} />
                      <span>{column}</span>
                    </label>
                  ))}
                </div>
              </details>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={showFilteredIn3D}
                  onChange={event => setShowFilteredIn3D(event.target.checked)}
                  disabled={allBIMObjects.length === 0}
                />
                Show filtered elements only in 3D
              </label>
              <span>{filteredBIMObjects.length} of {tableBIMObjects.length} BIM objects · {propertyColumns.length} IFC property columns</span>
              {filteredBIMObjects.length > 300 && <span role="status">Showing first 300 rows for responsiveness; Excel exports all {filteredBIMObjects.length} matching rows.</span>}
            </div>
            <div className="model-data-scroll">
              <table className="model-data-table">
                <thead>
                  <tr>
                    <th>Runtime ID</th>
                    <th>Object</th>
                    <th>IFC Class</th>
                    <th>Description</th>
                    <th>Model ID</th>
                    {visiblePropertyColumns.map(column => {
                      const separator = column.indexOf(" / ");
                      const group = column.slice(0, separator);
                      const property = column.slice(separator + 3);
                      return <th key={column} title={column}>
                        <span className="bim-column-name">{property}</span>
                        <span className="bim-column-group">{group}</span>
                      </th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredBIMObjects.slice(0, 300).map(object => (
                    <tr
                      key={`${object.modelId}-${object.runtimeId}`}
                       onClick={() => {
                        setRealSelectedObject(object);
                        setSelectedBIMObjects([object]);
                        
                        setSelectionCommand(previous => ({
                          modelId: object.modelId,
                          runtimeId: object.runtimeId,
                          sequence: (previous?.sequence ?? 0) + 1,
                        }));
                      }}
                      style={{
                        cursor: "pointer",
                        background: realSelectedObject?.modelId === object.modelId &&
                          realSelectedObject?.runtimeId === object.runtimeId ? "#e7f1ff" : undefined,
                      }}
                      title="Select this BIM element to inspect its property groups on the 3D Dashboard"
                    >
                      <td>{object.runtimeId}</td>
                      <td>{object.name}</td>
                      <td>{object.ifcClass}</td>
                      <td>{object.description || "—"}</td>
                      <td>{object.modelId}</td>
                      {visiblePropertyColumns.map(column => (
                        <td key={column}>{getGroupedProperty(object, column)}</td>
                      ))}
                    </tr>
                  ))}
                  {filteredBIMObjects.length === 0 && (
                    <tr><td colSpan={5 + visiblePropertyColumns.length} className="model-data-empty">
                      {allBIMObjects.length === 0
                        ? "No model objects loaded yet. Open 3D Dashboard and tick the IFC model checkbox."
                        : "No BIM objects match your search."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
      {activeTab === "asite" && (
        <section className="panel" style={{ margin: 20, padding: 24, maxWidth: 1100 }}>
          <h2>Asite Model Sync</h2>
          <p>Read-only integration setup for <strong>adoddleak.asite.com</strong>. This tab does not transfer, upload, or modify models.</p>
          <div style={{ padding: 16, border: "1px solid #d1d5db", borderRadius: 8, marginBottom: 20 }}>
            <h3>API connection</h3>
            <p><strong>Status:</strong> {asiteConnection === "checking" ? "Checking backend…" : asiteConnection === "not-configured" ? "Not connected — Asite OAuth access required" : "Connection not available"}</p>
            <p>{asiteMessage}</p>
            <button type="button" onClick={() => setAsiteCheckSequence(n => n + 1)}>Check connection again</button>
          </div>
          <h3>Initial test documents</h3>
          <p>These two records were transcribed from your Asite screenshot, <strong>not retrieved through the API</strong>. They are shown only to define and test the approval rule.</p>
          <div style={{ overflowX: "auto" }}>
            <table className="model-data-table" style={{ width: "100%" }}>
              <thead><tr><th>Document reference</th><th>Revision</th><th>Purpose of issue</th><th>Asite status</th><th>Sync eligibility</th><th>Trimble comparison</th></tr></thead>
              <tbody>
                <tr><td>02_BIMcollab_Example_STR_optimized</td><td>1</td><td>S2 – For Information</td><td>A – Approved</td><td>Eligible for comparison</td><td>Awaiting live Asite file metadata</td></tr>
                <tr><td>0001</td><td>1</td><td>A2 – Authorised Concept Design</td><td>Prepublished</td><td>Blocked</td><td>Not applicable</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 20 }}><strong>Next step:</strong> Register or enable an Asite API client for Microsoft SSO, then securely connect the backend to list documents and retrieve revision/status metadata. We will compare actual Asite file identities against Trimble Connect before enabling manual sync.</p>
          <p><strong>Approval rule:</strong> Only <em>A – Approved</em> documents are candidates. Purpose of Issue is displayed separately and does not override the approval status.</p>
        </section>
      )}
      {activeTab === "ai" && (
        <section className="panel" style={{ margin: 16, padding: 20, minWidth: 0 }}>
          <div className="panel-header"><div><h2>Project Information Search</h2>
            <span>BIM + FieldView + indexed Trimble Connect PDFs · keyword and demonstration search, not generative AI</span></div></div>
          <p>Use the search box below to search BIM/FieldView demonstration records and indexed PDF text together. For drawings and general notes, try a distinctive word or exact phrase (for example, concrete or padstone). PDFs must be indexed first.</p>
          <form onSubmit={event => { event.preventDefault(); runProjectSearch(aiQuery); }}
            style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <input className="model-search" style={{ flex: "1 1 320px" }} value={aiQuery}
              onChange={event => setAiQuery(event.target.value)}
              placeholder="e.g. concrete, padstone, or 9HG-47/4" aria-label="Search project information" />
            <button type="submit" className="trimble-connect-button" disabled={tcDocSearchBusy}>{tcDocSearchBusy ? "Searching…" : "Search all sources"}</button>
            <button type="button" onClick={clearProjectSearch}>Clear search</button>
          </form>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {[
              "What is the status of pour 9HG-47/4?",
              "Show completed pours",
              "Show pours with NCR",
              "Show outstanding inspections",
            ].map(example => <button key={example} type="button" onClick={() => { setAiQuery(example); runProjectSearch(example); }}>{example}</button>)}
          </div>
          <div style={{ border: "1px solid #d6dbe0", borderRadius: 8, padding: 16, marginBottom: 18 }}>
            <h3 style={{marginTop: 0}}>Trimble Connect PDF drawing and notes index (read-only)</h3>
            <p>List PDFs from the configured Trimble folder, index each PDF by page, and search extracted text. Index is held in backend memory until server restart. Drawings without searchable text may require OCR later. No BIM-to-drawing links are assumed.</p>
            <div style={{display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10}}>
              <button type="button" onClick={() => void refreshTcDocuments()}>Find PDFs in Trimble Connect</button>
            </div>
            {tcDocMessage && <p role="status">{tcDocMessage}</p>}
            {tcDocError && <p role="alert" style={{color: "#b42318"}}>{tcDocError}</p>}
            {tcDocuments.map(doc => <div key={doc.id} style={{display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "8px 0", borderTop: "1px solid #eee"}}>
              <span><strong>{doc.name}</strong>{doc.revision != null ? ` · revision ${doc.revision}` : ""}</span>
              <button type="button" disabled={Boolean(tcDocBusy)} onClick={() => void indexTcDocument(doc.id)}>{tcDocBusy === doc.id ? "Indexing…" : "Index PDF"}</button>
            </div>)}
            {tcDocIndexed > 0 && <p>{tcDocIndexed} document(s) indexed in the current backend session.</p>}
            {tcDocSearched && !tcDocSearchBusy && !tcDocError && <p role="status" style={{fontWeight: 600}}>
              PDF results for “{tcDocLastQuery}”: {tcDocResults.length} matching page(s) across {tcDocIndexed} indexed document(s).
              {tcDocIndexed === 0 ? " Index a PDF above before searching its contents." : tcDocResults.length === 0 ? " Try a shorter keyword or a phrase copied from the PDF." : ""}
            </p>}
            {tcDocResults.length > 0 && <div><h4>Trimble Connect PDF results</h4>{tcDocResults.map((result, index) => <div key={`${result.id}-${result.page}-${index}`} style={{borderTop: "1px solid #eee", padding: "10px 0"}}>
              <strong>{result.name}</strong> · page {result.page}{result.revision != null ? ` · revision ${result.revision}` : ""}
              <p style={{margin: "5px 0"}}>{result.excerpt}</p>
              <small>Extracted text · source: Trimble Connect · page reference only (direct file link pending API verification)</small>
            </div>)}</div>}
          </div>
          {fieldViewLoading && <p>Loading FieldView exports…</p>}
          {fieldViewError && <p role="alert">FieldView data unavailable: {fieldViewError}</p>}
          {aiText && <>
            <h3>Search results</h3>
            <p>{aiResults.length} matching demonstration pour links
              {aiStatus ? ` · Status: ${aiStatus}` : ""}{aiPourMatch ? ` · Pour: ${aiPourMatch}` : ""}.
              {allBIMObjects.length === 0 ? " Load a model in 3D Dashboard to match BIM elements." : ""}</p>
            {aiResults.length > 0 && <button type="button" onClick={showAiIn3D} style={{ marginBottom: 12 }}>
              {aiResults.length === 1 ? "Show matching pour in spreadsheet and 3D" : "Colour linked pours in 3D"}
            </button>}
            <div style={{ display: "grid", gap: 10 }}>
              {aiResults.map(item => <div key={`${item.fullPourId}-${item.formId}`}
                style={{ border: "1px solid #d6dbe0", borderRadius: 8, padding: 14 }}>
                <strong>{item.fullPourId}</strong> · {item.form?.Status || "Status unavailable"}
                <p style={{ margin: "6px 0" }}>{item.form?.FormTitle || item.form?.FormName || item.formId}
                  {` · ${item.objects.length} matching BIM elements`}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => openAiPour(item.fullPourId)}>View BIM elements</button>
                  <button type="button" onClick={() => { setSelectedFormId(item.formId); setActiveTab("fieldview"); }}>Open FieldView form {item.formId}</button>
                </div>
              </div>)}
              {aiUnlinked.length > 0 && <p>{aiUnlinked.length} loaded BIM elements match IFC class {aiIfcMatch}. Use Model Data for the complete property view.</p>}
              {aiForms.length > 0 && <div><h3>Matching exported forms</h3>{aiForms.map(form =>
                <div key={form.FormID} style={{ padding: "7px 0", borderBottom: "1px solid #eee" }}>
                  <button type="button" onClick={() => { setSelectedFormId(form.FormID); setActiveTab("fieldview"); }}>
                    {form.FormID} · {form.FormTitle || form.FormName || "Untitled"} · {form.Status}
                  </button>
                </div>)}</div>}
              {aiResults.length === 0 && aiForms.length === 0 && aiUnlinked.length === 0 &&
                <p>No matching records found in the available data. Try a known Full Pour ID or one of the example questions. This demo supports a limited set of natural-language patterns.</p>}
            </div>
            <p style={{ fontSize: 12, color: "#666", marginTop: 16 }}>
              Associations between Full Pour IDs and FieldView forms are demonstration-only, not verified project links. Search does not generate AI-written answers.
            </p>
          </>}
        </section>
      )}
      {activeTab === "fieldview" && (
        <section className="panel" style={{ margin: 16, padding: 20, minWidth: 0 }}>
          <div className="panel-header"><div><h2>FieldView Form Explorer</h2>
            <span>Read-only reconstruction from four exported CSV tables · no live FieldView connection</span></div></div>
          {fieldViewLoading && <p>Loading exported forms and answers…</p>}
          {fieldViewError && <div role="alert"><p>Could not load CSV data: {fieldViewError}</p>
            <button type="button" onClick={() => { setFieldViewError(""); setFieldViewData(null); }}>Retry</button></div>}
          <div style={{ padding: 14, margin: "12px 0", border: "1px solid #cbd5e1", borderRadius: 8 }}>
            <strong>Selected BIM elements: {selectedUnique.length}</strong> · {selectedPourIds.length} unique pours · {selectedFormIds.size} linked forms (demonstration mappings)
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              <label><input type="checkbox" checked={showSelectedFormsOnly} onChange={event => { setShowSelectedFormsOnly(event.target.checked); setSelectedFormId(null); setFormPage(0); }} /> Show forms for selected elements only</label>
              <button type="button" onClick={clearSelection} disabled={!selectedUnique.length}>Clear selection</button>
              <button type="button" onClick={() => { setFormSearch(""); setFormStatus(""); setShowSelectedFormsOnly(false); setFormPage(0); }}>Clear filters</button>
            </div>
            {selectedUnique.length > 0 && <p style={{ margin: "8px 0 0", fontSize: 12 }}>Pours: {selectedPourIds.join(" · ") || "No Full Pour IDs"}</p>}
          </div>
          {fieldViewData && <>
            <p style={{ margin: "12px 0" }}>{fieldViewData.forms.length.toLocaleString()} forms loaded · {fieldViewData.answersByForm.size.toLocaleString()} forms with answers · {fieldViewData.tablesByForm.size.toLocaleString()} forms with checklist tables</p>
            {!selectedForm ? <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <input className="model-search" aria-label="Search FieldView forms" placeholder="Search form title, ID, location, owner…"
                  value={formSearch} onChange={event => { setFormSearch(event.target.value); setFormPage(0); }} />
                <select className="discipline-filter" aria-label="Filter form status" value={formStatus}
                  onChange={event => { setFormStatus(event.target.value); setFormPage(0); }}>
                  <option value="">All statuses</option>
                  {[...new Set(fieldViewData.forms.map(form => form.Status).filter(Boolean))].sort().map(status => <option key={status} value={status}>{status}</option>)}
                </select>
                <button type="button" onClick={() => { setFormSearch(""); setFormStatus(""); setShowSelectedFormsOnly(false); setFormPage(0); }}>Clear filters</button>
                <span style={{ alignSelf: "center" }}>{matchingForms.length.toLocaleString()} matches</span>
              </div>
              <div style={{ overflowX: "auto" }}><table className="model-data-table" style={{ width: "100%" }}>
                <thead><tr><th>Form ID</th><th>Form</th><th>Status</th><th>Location</th><th>Owner</th><th>Created</th></tr></thead>
                <tbody>{matchingForms.slice(formPage * 40, formPage * 40 + 40).map(form => <tr key={form.FormID}
                  onClick={() => setSelectedFormId(form.FormID)} style={{ cursor: "pointer" }} title="Open reconstructed form">
                  <td>{form.FormID}</td><td>{form.FormTitle || form.FormName || "Untitled form"}</td><td>{form.Status}</td>
                  <td>{form.Location || "—"}</td><td>{form.OwnedBy || "—"}</td><td>{form.CreatedDate?.slice(0, 10) || "—"}</td>
                </tr>)}</tbody>
              </table></div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
                <button type="button" disabled={formPage === 0} onClick={() => setFormPage(page => page - 1)}>Previous</button>
                <span>Page {formPage + 1} of {Math.max(1, Math.ceil(matchingForms.length / 40))}</span>
                <button type="button" disabled={(formPage + 1) * 40 >= matchingForms.length} onClick={() => setFormPage(page => page + 1)}>Next</button>
              </div>
            </> : <>
              <button type="button" onClick={() => setSelectedFormId(null)} style={{ margin: "12px 0" }}>← Back to forms</button>
              <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 18 }}>
                <h2 style={{ marginTop: 0 }}>{selectedForm.FormTitle || selectedForm.FormName || "Untitled form"}</h2>
                <p><strong>{selectedForm.FormID}</strong> · {selectedForm.Status} · {selectedForm.FormType}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 16 }}>
                  <span><strong>Location:</strong> {selectedForm.Location || "—"}</span>
                  <span><strong>Owner:</strong> {selectedForm.OwnedBy || "—"}</span>
                  <span><strong>Created:</strong> {selectedForm.CreatedDate || "—"}</span>
                  <span><strong>Updated:</strong> {selectedForm.LastModified || "—"}</span>
                </div>
                {selectedForm.ParentProcessTaskID && <div style={{ padding: 12, background: "#f3f5f7", marginBottom: 18 }}>
                  <strong>Related process task:</strong> {selectedForm.ParentProcessTaskID}
                  {selectedTask ? <p>{selectedTask.ProcessName} / {selectedTask.TaskDescription} · {selectedTask.Status} · {selectedTask.LocationPath}</p>
                    : <p>Task is not present in the supplied Process Details export.</p>}
                </div>}
                <h3>Questions and answers ({selectedFormAnswers.length})</h3>
                {selectedFormAnswers.length === 0 && <p>No question records in this export.</p>}
                {selectedFormAnswers.map((answer, index) => <div key={`${answer.FormAnswerID}-${index}`}
                  style={{ borderBottom: "1px solid #e4e4e4", padding: "12px 0" }}>
                  <div style={{ fontWeight: 600 }}>{answer.Question || answer.QuestionType || `Question ${index + 1}`}</div>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {answer.Answer || <em style={{ color: "#777" }}>Not answered</em>}</div>
                  <small style={{ color: "#666" }}>{answer.QuestionType}{answer.AnsweredBy ? ` · ${answer.AnsweredBy}` : ""}
                    {answer.AnsweredDateTime ? ` · ${answer.AnsweredDateTime}` : ""}</small>
                </div>)}
                {selectedFormTables.map(table => <section key={table.name} style={{ marginTop: 24 }}>
                  <h3>{table.name} ({table.rows.length} rows)</h3>
                  <div style={{ overflowX: "auto" }}><table className="model-data-table" style={{ width: "100%" }}>
                    <thead><tr><th>Row</th>{table.columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{table.rows.map((row, index) => <tr key={`${row.rowNo}-${index}`}>
                      <td>{row.rowNo}</td>{table.columns.map(column => <td key={column} style={{ whiteSpace: "pre-wrap" }}>{row[column] || "—"}</td>)}
                    </tr>)}</tbody>
                  </table></div>
                </section>)}
              </div>
            </>}
          </>}
        </section>
      )}

    </div>
  );
}
export default App;
