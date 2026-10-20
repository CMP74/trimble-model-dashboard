import { useEffect, useState } from "react";
import "./App.css";
import { loadFieldViewCSV, loadPourFormLinks, getFormTables, type PourFormLink, type FieldViewData } from "./fieldviewService";
import TrimbleViewer, {
  type SelectedBIMObject,
} from "./components/TrimbleViewer";
import {
  getFieldViewRecords,
  type FieldViewRecord,
} from "./services/fieldViewService";
import {
  getModels,
  type ModelItem,
} from "./services/modelService";
import {
  getAsiteModels,
  type AsiteModel,
} from "./services/asiteService";
type ModelObject = {
  guid: string;
  modelId: string;
  type: string;
  name: string;
  level: string;
  material: string;
  discipline: string;
};
function App() {
  // -------------------------------------------------------
  // Authentication
  // -------------------------------------------------------
  // Layout only: keep the Trimble viewer mounted across tab changes.
  const [activeTab, setActiveTab] = useState<"dashboard" | "data" | "fieldview">("dashboard");
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [ifcClassFilter, setIfcClassFilter] = useState("");
  const [propertyColumnFilter, setPropertyColumnFilter] = useState("");
  const [propertyValueFilter, setPropertyValueFilter] = useState("");
  const [showFilteredIn3D, setShowFilteredIn3D] = useState(false);
  const [hiddenPropertyColumns, setHiddenPropertyColumns] = useState<string[]>([]);
  const [allBIMObjects, setAllBIMObjects] = useState<SelectedBIMObject[]>([]);

  const [authStatus, setAuthStatus] =
    useState("Not connected");
  // -------------------------------------------------------
  // FieldView
  // -------------------------------------------------------
  const [fieldViewRecords, setFieldViewRecords] =
    useState<FieldViewRecord[]>([]);
  const [fieldViewData, setFieldViewData] = useState<FieldViewData | null>(null);
  const [fieldViewError, setFieldViewError] = useState("");
  const [fieldViewLoading, setFieldViewLoading] = useState(false);
  const [formSearch, setFormSearch] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [formPage, setFormPage] = useState(0);
  const [pourLinks, setPourLinks] = useState<PourFormLink[]>([]);
  const [colourByFieldView, setColourByFieldView] = useState(false);
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
    id: string;
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
  const [disciplineFilter, setDisciplineFilter] =
    useState("All disciplines");
  // -------------------------------------------------------
  // Asite models
  // -------------------------------------------------------
  const [asiteModels, setAsiteModels] = useState<
    AsiteModel[]
  >([]);
  const [asiteLoading, setAsiteLoading] =
    useState(true);
  // -------------------------------------------------------
  // Selected BIM object
  // -------------------------------------------------------
  const [selectedObject, setSelectedObject] =
    useState<ModelObject | null>(null);
  const [objectLoading, setObjectLoading] =
    useState(false);
  const [realSelectedObject, setRealSelectedObject] =
    useState<SelectedBIMObject | null>(null);
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
  // Dynamic columns preserve each IFC property group and its individual fields.
  const propertyColumns = Array.from(
    new Set(allBIMObjects.flatMap(object =>
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
  const ifcClasses = Array.from(new Set(allBIMObjects.map(object => object.ifcClass)))
    .sort((a, b) => a.localeCompare(b));
  const propertyValues = propertyColumnFilter
    ? Array.from(new Set(allBIMObjects.map(object => getGroupedProperty(object, propertyColumnFilter))))
        .sort((a, b) => a.localeCompare(b))
    : [];
  const filteredBIMObjects = allBIMObjects.filter(object => {
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
  const selectedPourId = realSelectedObject ? fullPourId(realSelectedObject) : "";
  const selectedPourLinks = pourLinks.filter(link => link.fullPourId === selectedPourId);
  const colourEntries = allBIMObjects.flatMap(object => {
    const pourId = fullPourId(object);
    const link = pourLinks.find(item => item.fullPourId === pourId);
    if (!link) return [];
    const status = fieldViewData?.forms.find(form => form.FormID === link.formId)?.Status ?? "";
    const color = status === "Complete" ? "#22C55E" : status === "In Progress" ? "#F59E0B" : status === "NCR Created" ? "#EF4444" : "";
    return color ? [{ modelId: object.modelId, runtimeId: object.runtimeId, color }] : [];
  });
  const colourCommand = { enabled: colourByFieldView, entriesKey: colourEntries
    .map(entry => `${entry.modelId}:${entry.runtimeId}:${entry.color}`).sort().join("|") };

  const clearTableFilters = () => {
    setTableSearch("");
    setIfcClassFilter("");
    setPropertyColumnFilter("");
    setPropertyValueFilter("");
  };
  // -------------------------------------------------------
  // Filter Trimble models
  // -------------------------------------------------------
  const filteredModels = models.filter((model) => {
    const matchesSearch = model.name
      .toLowerCase()
      .includes(modelSearch.toLowerCase());
    const matchesDiscipline =
      disciplineFilter === "All disciplines" ||
      model.discipline === disciplineFilter;
    return matchesSearch && matchesDiscipline;
  });
  // -------------------------------------------------------
  // Load FieldView records
  // -------------------------------------------------------
  useEffect(() => {
    const loadFieldViewData = async () => {
      try {
        const records =
          await getFieldViewRecords();
        setFieldViewRecords(records);
      } catch (error) {
        console.error(
          "Could not load FieldView records:",
          error
        );
      }
    };
    loadFieldViewData();
  }, []);
  // Load the exported CSVs only when the Form Explorer is opened.
  useEffect(() => {
    if ((activeTab !== "fieldview" && allBIMObjects.length === 0) || fieldViewData || fieldViewLoading || fieldViewError) return;
    let active = true;
    setFieldViewLoading(true);
    loadFieldViewCSV().then(data => { if (active) setFieldViewData(data); })
      .catch(error => { if (active) setFieldViewError(String(error)); })
      .finally(() => { if (active) setFieldViewLoading(false); });
    return () => { active = false; };
  }, [activeTab, allBIMObjects.length, fieldViewData, fieldViewError]);
  const matchingForms = (fieldViewData?.forms ?? []).filter(form =>
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
    const loadModels = async () => {
      try {
        setModelsLoading(true);
        const modelData = await getModels();
        setModels(modelData);
      } catch (error) {
        console.error(
          "Could not load models:",
          error
        );
        // Temporary real model confirmed by the Trimble viewer event.
        // Used only while the project-folder listing endpoint is unavailable.
        setModels([{
          id: "WnC-a6wV27I",
          name: "SZC-MW0900-CWA-U9-HPL-01XXXX-MDL-CBF-100001_Galleries Pour Model HPL_Ver8_P04.ifc",
          discipline: "Unclassified",
          loaded: false,
          source: "Trimble Connect (verified test model)",
        }]);
      } finally {
        setModelsLoading(false);
      }
    };
    loadModels();
  }, []);
  // -------------------------------------------------------
  // Load Asite models
  // -------------------------------------------------------
  useEffect(() => {
    const loadAsiteModels = async () => {
      try {
        setAsiteLoading(true);
        const data = await getAsiteModels();
        setAsiteModels(data);
      } catch (error) {
        console.error(
          "Could not load Asite models:",
          error
        );
      } finally {
        setAsiteLoading(false);
      }
    };
    loadAsiteModels();
  }, []);
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
  const toggleModel = (modelId: string) => {
    const model = models.find((item) => item.id === modelId);
    if (!model) return;
    const loaded = !model.loaded;
    setModels((currentModels) =>
      currentModels.map((item) =>
        item.id === modelId ? { ...item, loaded } : item
      )
    );
    if (!loaded) setAllBIMObjects(current => current.filter(object => object.modelId !== modelId));
    setModelCommand((previous) => ({
      id: modelId,
      loaded,
      sequence: (previous?.sequence ?? 0) + 1,
    }));
  };
  // -------------------------------------------------------
  // Select mock BIM object
  // -------------------------------------------------------
  const selectModelObject = async (
    guid: string
  ) => {
    setRealSelectedObject(null);
    try {
      setObjectLoading(true);
      const objectResponse = await fetch(
        `/api/model-objects/${encodeURIComponent(
          guid
        )}`
      );
      if (!objectResponse.ok) {
        throw new Error(
          `Model object request failed: ${objectResponse.status}`
        );
      }
      const objectData =
        await objectResponse.json();
      setSelectedObject(
        objectData.object
      );
      const relatedRecords =
        await getFieldViewRecords(guid);
      setFieldViewRecords(
        relatedRecords
      );
    } catch (error) {
      console.error(
        "Could not select model object:",
        error
      );
    } finally {
      setObjectLoading(false);
    }
  };
  // -------------------------------------------------------
  // Clear BIM selection
  // -------------------------------------------------------
  const clearObjectSelection =
    async () => {
      try {
        setSelectedObject(null);
        const records =
          await getFieldViewRecords();
        setFieldViewRecords(records);
      } catch (error) {
        console.error(
          "Could not reload FieldView records:",
          error
        );
      }
    };
  // -------------------------------------------------------
  // Mock Asite import
  // -------------------------------------------------------
  const importAsiteModel = (
    model: AsiteModel
  ) => {
    alert(
      `Asite → Trimble import placeholder\n\n` +
        `${model.name}\n` +
        `Revision: ${model.revision}\n` +
        `Discipline: ${model.discipline}\n\n` +
        `The next step will send this request to our backend and simulate transferring the IFC into Trimble Connect.`
    );
  };
  // -------------------------------------------------------
  // FieldView placeholder
  // -------------------------------------------------------
  const openFieldView = (
    record: FieldViewRecord
  ) => {
    alert(
      `FieldView integration placeholder\n\n` +
        `${record.id} - ${record.title}\n\n` +
        `This will open the real FieldView record when the API integration is connected.`
    );
  };
  // -------------------------------------------------------
  // Dashboard calculations
  // -------------------------------------------------------
  const openNcrCount =
    fieldViewRecords.filter(
      (record) =>
        record.type === "NCR" &&
        record.status === "Open"
    ).length;
  const passedItpCount =
    fieldViewRecords.filter(
      (record) =>
        record.type === "ITP" &&
        record.status === "Passed"
    ).length;
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
      </nav>

      {/* WORKSPACE */}
      <main className={`workspace ${activeTab === "data" ? "model-data-mode" : ""} ${showDataViewer ? "data-viewer-visible" : ""}`} style={activeTab === "fieldview" ? { display: "none" } : activeTab === "data" ? { display: "flex", flexDirection: "column", width: "100%" } : undefined}>
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
              <div className="panel-badge">
                Structural
              </div>
            </div>
            <div className="viewer-container">
              <TrimbleViewer
                modelCommand={modelCommand}
                selectionCommand={selectionCommand}
                visibilityCommand={visibilityCommand}
                colourCommand={colourCommand}
                onModelObjectsLoaded={(modelId, objects) => {
                  setAllBIMObjects(current => [...current.filter(object => object.modelId !== modelId), ...objects]);
                }}
                onObjectSelected={(object) => {
                  setRealSelectedObject(object);
                  if (object) setSelectedObject(null);
                }}
              />
            </div>
          </section>
          <section className="panel" style={{ padding: 14, marginTop: 12 }}>
            <h3 style={{ margin: "0 0 8px" }}>FieldView pour status — mock associations</h3>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={colourByFieldView} onChange={event => setColourByFieldView(event.target.checked)} />
              Colour model by linked FieldView status
            </label>
            <p style={{ margin: "8px 0", fontSize: 13 }}>
              <span style={{ color: "#15803d" }}>● Complete</span> · <span style={{ color: "#b45309" }}>● In Progress</span> · <span style={{ color: "#dc2626" }}>● NCR Created</span>
            </p>
            <small>{colourEntries.length} model objects match the demonstration mappings. Unmapped elements retain their original appearance.</small>
            {pourLinkError && <p style={{ color: "#b91c1c" }}>Could not load mock links: {pourLinkError}</p>}
          </section>
          {/* MODEL MANAGEMENT */}
          <section className="panel models-panel" style={activeTab === "data" ? { display: "none" } : undefined}>
            <div className="panel-header">
              <div>
                <h2>Models</h2>
                <span>
                  Project model selection
                </span>
              </div>
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
              {/* ASITE MODELS */}
              <div
                style={{
                  marginTop: "22px",
                  paddingTop: "18px",
                  borderTop:
                    "1px solid #dddddd",
                }}
              >
                <div className="section-title">
                  Available from Asite
                  <span className="mock-label">
                    MOCK DATA
                  </span>
                </div>
                <div className="model-list">
                  {asiteLoading && (
                    <div className="model-row">
                      Loading Asite
                      models...
                    </div>
                  )}
                  {!asiteLoading &&
                    asiteModels.length ===
                      0 && (
                      <div className="model-row">
                        No Asite models
                        available.
                      </div>
                    )}
                  {!asiteLoading &&
                    asiteModels.map(
                      (model) => (
                        <div
                          className="model-row"
                          key={model.id}
                        >
                          <div className="model-details">
                            <strong>
                              {model.name}
                            </strong>
                            <span>
                              {
                                model.discipline
                              }{" "}
                              · Rev{" "}
                              {model.revision} ·{" "}
                              {model.size}
                            </span>
                            <span>
                              {
                                model.status
                              }{" "}
                              · Modified{" "}
                              {
                                model.modifiedDate
                              }
                            </span>
                          </div>
                          <button
                            className="trimble-connect-button"
                            onClick={() =>
                              importAsiteModel(
                                model
                              )
                            }
                          >
                            Import
                          </button>
                        </div>
                      )
                    )}
                </div>
              </div>
            </div>
          </section>
        </div>
        {/* RIGHT COLUMN */}
        <div className="workspace-right" style={activeTab === "data" ? { display: "none" } : undefined}>
          {/* MODEL INFORMATION */}
          <section className="panel information-panel">
            <div className="panel-header">
              <div>
                <h2>
                  Model Information
                </h2>
                <span>
                  BIM object information
                </span>
              </div>
            </div>
            <div className="information-content">
              {/* MODEL COUNTS */}
              <div className="summary-grid">
                <div className="summary-card">
                  <span>Elements</span>
                  <strong>16</strong>
                </div>
                <div className="summary-card">
                  <span>Walls</span>
                  <strong>4</strong>
                </div>
                <div className="summary-card">
                  <span>Beams</span>
                  <strong>6</strong>
                </div>
                <div className="summary-card">
                  <span>
                    Footings
                  </span>
                  <strong>1</strong>
                </div>
              </div>
              {/* TEMPORARY OBJECT SELECTION */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "14px",
                  marginBottom: "14px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="trimble-connect-button"
                  onClick={() =>
                    selectModelObject(
                      "demo-wall-001"
                    )
                  }
                >
                  Demo Select Wall
                </button>
                <button
                  className="trimble-connect-button"
                  onClick={() =>
                    selectModelObject(
                      "demo-beam-001"
                    )
                  }
                >
                  Demo Select Beam
                </button>
                {(selectedObject || realSelectedObject) && (
                  <button
                    onClick={() => {
                      setRealSelectedObject(null);
                      void clearObjectSelection();
                    }}
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              {/* SELECTED OBJECT */}
              <div className="selected-object">
                <div className="section-title">
                  Selected Object
                  <span className="mock-label">
                    {realSelectedObject
                      ? "Live Trimble data"
                      : objectLoading
                        ? "Loading..."
                        : selectedObject
                          ? "Demo selection"
                          : "Awaiting selection"}
                  </span>
                </div>
                {!selectedObject && !realSelectedObject && (
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
                      {selectedPourLinks.length === 0 ? <p>No mock FieldView mapping for this pour.</p> : selectedPourLinks.map(link => {
                        const form = fieldViewData?.forms.find(item => item.FormID === link.formId);
                        return <div key={link.formId} style={{ marginTop: 8 }}>
                          <strong>{form?.FormName || link.formId}</strong> · {form?.Status || "Loading form…"}
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
                {selectedObject && (
                  <div className="model-list">
                    <div className="model-row">
                      <div className="model-details">
                        <span>
                          Object
                        </span>
                        <strong>
                          {
                            selectedObject.name
                          }
                        </strong>
                      </div>
                    </div>
                    <div className="model-row">
                      <div className="model-details">
                        <span>
                          IFC Type
                        </span>
                        <strong>
                          {
                            selectedObject.type
                          }
                        </strong>
                      </div>
                    </div>
                    <div className="model-row">
                      <div className="model-details">
                        <span>GUID</span>
                        <strong>
                          {
                            selectedObject.guid
                          }
                        </strong>
                      </div>
                    </div>
                    <div className="model-row">
                      <div className="model-details">
                        <span>Level</span>
                        <strong>
                          {
                            selectedObject.level
                          }
                        </strong>
                      </div>
                    </div>
                    <div className="model-row">
                      <div className="model-details">
                        <span>
                          Material
                        </span>
                        <strong>
                          {
                            selectedObject.material
                          }
                        </strong>
                      </div>
                    </div>
                    <div className="model-row">
                      <div className="model-details">
                        <span>
                          Discipline
                        </span>
                        <strong>
                          {
                            selectedObject.discipline
                          }
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
          {/* FIELDVIEW */}
          <section className="panel field-panel">
            <div className="panel-header">
              <div>
                <h2>
                  Field Information
                </h2>
                <span>
                  {realSelectedObject
                    ? "Trimble FieldView (mock records, not linked to selected IFC object)"
                    : selectedObject
                      ? `Records linked to ${selectedObject.name}`
                      : "Trimble FieldView"}
                </span>
              </div>
              <span className="mock-badge">
                MOCK DATA
              </span>
            </div>
            <div className="field-summary">
              <div>
                <span>
                  ITPs Passed
                </span>
                <strong>
                  {passedItpCount}
                </strong>
              </div>
              <div>
                <span>
                  Open NCRs
                </span>
                <strong>
                  {openNcrCount}
                </strong>
              </div>
              <div>
                <span>
                  Total Records
                </span>
                <strong>
                  {
                    fieldViewRecords.length
                  }
                </strong>
              </div>
            </div>
            <div className="field-records">
              {fieldViewRecords.length ===
                0 && (
                <div className="empty-selection">
                  No FieldView records
                  are associated with this
                  BIM object.
                </div>
              )}
              {fieldViewRecords.map(
                (record) => (
                  <button
                    className="field-record"
                    key={record.id}
                    onClick={() =>
                      openFieldView(
                        record
                      )
                    }
                  >
                    <div className="record-type">
                      {record.type}
                    </div>
                    <div className="record-main">
                      <strong>
                        {record.title}
                      </strong>
                      <span>
                        {record.id} ·{" "}
                        {record.date}
                      </span>
                    </div>
                    <span
                      className={`record-status ${record.status.toLowerCase()}`}
                    >
                      {record.status}
                    </span>
                  </button>
                )
              )}
            </div>
          </section>
        </div>

        {/* MODEL DATA TAB: first-stage layout. Full model extraction comes next. */}
        <section className="panel model-data-panel" style={{ display: activeTab === "data" ? "block" : "none", width: "100%" }}>
          <div className="panel-header model-data-header">
            <div>
              <h2>Model Data</h2>
              <span>Spreadsheet view · all loaded BIM objects</span>
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
              <span>{filteredBIMObjects.length} of {allBIMObjects.length} BIM objects · {propertyColumns.length} IFC property columns</span>
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
                  {filteredBIMObjects.map(object => (
                    <tr
                      key={`${object.modelId}-${object.runtimeId}`}
                      onClick={() => {
                        setRealSelectedObject(object);
                        setSelectedObject(null);
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
      {activeTab === "fieldview" && (
        <section className="panel" style={{ margin: 16, padding: 20, minWidth: 0 }}>
          <div className="panel-header"><div><h2>FieldView Form Explorer</h2>
            <span>Read-only reconstruction from four exported CSV tables · no live FieldView connection</span></div></div>
          {fieldViewLoading && <p>Loading exported forms and answers…</p>}
          {fieldViewError && <div role="alert"><p>Could not load CSV data: {fieldViewError}</p>
            <button type="button" onClick={() => { setFieldViewError(""); setFieldViewData(null); }}>Retry</button></div>}
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
