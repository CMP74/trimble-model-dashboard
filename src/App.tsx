import { useEffect, useState } from "react";
import "./App.css";
import TrimbleViewer from "./components/TrimbleViewer";
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
  const [authStatus, setAuthStatus] =
    useState("Not connected");
  // -------------------------------------------------------
  // FieldView
  // -------------------------------------------------------
  const [fieldViewRecords, setFieldViewRecords] =
    useState<FieldViewRecord[]>([]);
  // -------------------------------------------------------
  // Trimble models
  // -------------------------------------------------------
  const [models, setModels] = useState<ModelItem[]>([]);

  const [modelCommand, setModelCommand] = useState<{
    id: string;
    loaded: boolean;
    sequence: number;
  } | undefined>(undefined);
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
      {/* WORKSPACE */}
      <main className="workspace">
        {/* LEFT COLUMN */}
        <div className="workspace-left">
          {/* TRIMBLE VIEWER */}
          <section className="panel viewer-panel">
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
              <TrimbleViewer modelCommand={modelCommand} />
            </div>
          </section>
          {/* MODEL MANAGEMENT */}
          <section className="panel models-panel">
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
        <div className="workspace-right">
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
                {selectedObject && (
                  <button
                    onClick={
                      clearObjectSelection
                    }
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
                    {objectLoading
                      ? "Loading..."
                      : selectedObject
                        ? "Demo selection"
                        : "Awaiting selection"}
                  </span>
                </div>
                {!selectedObject && (
                  <div className="empty-selection">
                    Select an object in
                    the 3D model to view
                    its BIM properties
                    and associated field
                    information.
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
                  {selectedObject
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
      </main>
    </div>
  );
}
export default App;
