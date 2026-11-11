import { useEffect, useRef, useState } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";

export type BIMProperty = { name: string; value: unknown; type?: number };
export type BIMPropertyGroup = { name: string; properties: BIMProperty[] };
export type SelectedBIMObject = {
  modelId: string;
  runtimeId: number;
  name: string;
  ifcClass: string;
  description: string;
  position?: { x: number; y: number; z: number };
  propertyGroups: BIMPropertyGroup[];
};
type ModelCommand = { ids: string[]; loaded: boolean; sequence: number };
type ObjectSelectionCommand = {
  modelId: string;
  runtimeId: number;
  sequence: number;
};
type ColourCommand = { enabled: boolean; entriesKey: string };
type DataCommand = { modelId: string; action: "load" | "cancel" | "clear"; sequence: number };
type DataProgress = { modelId: string; loaded: number; total: number; status: "loading" | "complete" | "cancelled" | "error"; message?: string };
type VisibilityCommand = { enabled: boolean; hiddenObjectIdsKey: string; visibleObjectIdsKey: string };
type TrimbleViewerProps = {
  visibilityCommand?: VisibilityCommand;
  colourCommand?: ColourCommand;
  modelCommand?: ModelCommand;
  dataCommand?: DataCommand;
  onDataProgress?: (progress: DataProgress) => void;
  selectionCommand?: ObjectSelectionCommand;
  onObjectSelected?: (object: SelectedBIMObject | null) => void;
  onObjectsSelected?: (objects: SelectedBIMObject[]) => void;
  onModelObjectsLoaded?: (modelId: string, objects: SelectedBIMObject[]) => void;
  inspectionScanEnabled?: boolean;
  inspectionScanModelIds?: string[];
  inspectionScanRetry?: number;
  onInspectionIdentifiers?: (modelId: string, identifiers: {runtimeId: number; fullPourId: string}[]) => void;
  onInspectionScanProgress?: (progress: {loaded: number; total: number; status: "loading" | "complete" | "error"; message?: string}) => void;
};
type TrimbleAPI = Awaited<ReturnType<typeof WorkspaceAPI.connect>>;
type SelectionEvent = { data?: { modelId: string; objectRuntimeIds: number[] }[] };

function TrimbleViewer({
  modelCommand,
  dataCommand,
  onDataProgress,
  selectionCommand,
  visibilityCommand,
  colourCommand,
  onObjectSelected,
  onObjectsSelected,
  onModelObjectsLoaded,
  inspectionScanEnabled = false,
  inspectionScanModelIds = [],
  inspectionScanRetry = 0,
  onInspectionIdentifiers,
  onInspectionScanProgress,
}: TrimbleViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const apiRef = useRef<TrimbleAPI | null>(null);
  const pendingCommandRef = useRef<ModelCommand | null>(null);
  const lastCommandSequenceRef = useRef<number | null>(null);
  const onObjectSelectedRef = useRef(onObjectSelected);
  const onObjectsSelectedRef = useRef(onObjectsSelected);
  const onModelObjectsLoadedRef = useRef(onModelObjectsLoaded);
  const onDataProgressRef = useRef(onDataProgress);
  onDataProgressRef.current = onDataProgress;
  onObjectSelectedRef.current = onObjectSelected;
  onObjectsSelectedRef.current = onObjectsSelected;
  onModelObjectsLoadedRef.current = onModelObjectsLoaded;
  const selectionSequenceRef = useRef(0);
  const modelRequestSequenceRef = useRef(new Map<string, number>());
  const pendingDataCommandRef = useRef<DataCommand | null>(null);
  const lastDataSequenceRef = useRef<number | null>(null);
  const visibilityQueueRef = useRef<Promise<void>>(Promise.resolve());
  const colouredObjectIdsRef = useRef<Map<string, number[]>>(new Map());
  const allModelEntityIdsRef = useRef<Map<string, number[]>>(new Map());
  const identifierCacheRef = useRef(new Set<string>());
  const identifierRunRef = useRef(0);
  const identifierCallbacksRef = useRef({ onInspectionIdentifiers, onInspectionScanProgress });
  identifierCallbacksRef.current = { onInspectionIdentifiers, onInspectionScanProgress };
  const inspectionModelKey = [...new Set(inspectionScanModelIds)].sort().join("|");


  const mapObject = (modelId: string, object: Awaited<ReturnType<TrimbleAPI["viewer"]["getObjectProperties"]>>[number]): SelectedBIMObject => ({
    modelId,
    runtimeId: object.id,
    name: object.product?.name ?? "Unnamed object",
    ifcClass: object.class ?? "Unknown",
    description: object.product?.description ?? "",
    position: object.position,
    propertyGroups: object.properties?.map(group => ({
      name: group.name ?? "Other Properties",
      properties: (group.properties ?? []).map(property => ({
        name: property.name,
        value: property.value,
        type: property.type,
      })),
    })) ?? [],
  });

  // Full element-property extraction is NEVER triggered by geometry loading.
  // It is only run on an explicit Model Data command. One model at a time.
  const collectModelObjects = async (API: TrimbleAPI, modelId: string) => {
    const requestSequence = (modelRequestSequenceRef.current.get(modelId) ?? 0) + 1;
    modelRequestSequenceRef.current.set(modelId, requestSequence);
    const valid = () => modelRequestSequenceRef.current.get(modelId) === requestSequence;
    let count = 0;
    let total = 0;
    try {
      onDataProgressRef.current?.({ modelId, loaded: 0, total: 0, status: "loading", message: "Finding elements in the selected model…" });
      const groups = await API.viewer.getObjects();
      if (!valid()) return;
      const group = groups.find(item => item.modelId === modelId);
      if (!group) throw new Error("Model elements are not available yet. Load the model in the 3D viewer first.");
      const runtimeIds = group.objects.map(item => item.id);
      total = runtimeIds.length;
      allModelEntityIdsRef.current.set(modelId, runtimeIds);
      const objects: SelectedBIMObject[] = [];
      const batchSize = 50;
      for (let index = 0; index < runtimeIds.length; index += batchSize) {
        if (!valid()) return;
        const batch = await API.viewer.getObjectProperties(modelId, runtimeIds.slice(index, index + batchSize));
        if (!valid()) return;
        objects.push(...batch.map(object => mapObject(modelId, object)));
        count += Math.min(batchSize, runtimeIds.length - index);
        onDataProgressRef.current?.({ modelId, loaded: count, total, status: "loading" });
        // Yield to the browser between API batches so controls remain responsive.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      if (!valid()) return;
      onModelObjectsLoadedRef.current?.(modelId, objects);
      onDataProgressRef.current?.({ modelId, loaded: count, total, status: "complete" });
    } catch (error) {
      if (!valid()) return;
      onDataProgressRef.current?.({ modelId, loaded: count, total, status: "error", message: error instanceof Error ? error.message : String(error) });
      console.error("Could not retrieve model data:", error);
    }
  };

  const handleDataCommand = (API: TrimbleAPI, command: DataCommand) => {
    if (command.action !== "load") {
      modelRequestSequenceRef.current.set(command.modelId, (modelRequestSequenceRef.current.get(command.modelId) ?? 0) + 1);
      if (command.action === "clear") allModelEntityIdsRef.current.delete(command.modelId);
      onDataProgressRef.current?.({ modelId: command.modelId, loaded: 0, total: 0, status: "cancelled" });
      return;
    }
    void collectModelObjects(API, command.modelId);
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    const initializeViewer = async () => {
      try {
        const API = await WorkspaceAPI.connect(iframe, (event: string, data: unknown) => {
          if (event !== "viewer.onSelectionChanged") return;
          const selection = data as SelectionEvent;
          const selectedGroups = (selection.data ?? []).filter(item => item.objectRuntimeIds?.length);
          const requestSequence = ++selectionSequenceRef.current;
          if (!selectedGroups.length) {
            onObjectsSelectedRef.current?.([]);
            onObjectSelectedRef.current?.(null);
            return;
          }
          const currentAPI = apiRef.current;
          if (!currentAPI) return;
          void Promise.all(selectedGroups.map(async group => {
            const objects: SelectedBIMObject[] = [];
            for (let index = 0; index < group.objectRuntimeIds.length; index += 100) {
              const batch = await currentAPI.viewer.getObjectProperties(group.modelId, group.objectRuntimeIds.slice(index, index + 100));
              objects.push(...batch.map(object => mapObject(group.modelId, object)));
            }
            return objects;
          })).then(groups => {
            if (cancelled || requestSequence !== selectionSequenceRef.current) return;
            const objects = groups.flat();
            onObjectsSelectedRef.current?.(objects);
            onObjectSelectedRef.current?.(objects[0] ?? null);
          }).catch(error => console.error("Could not retrieve selected BIM properties:", error));
        }, 30000);
        if (cancelled) return;
        const response = await fetch("/api/auth/viewer-token", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error(`Viewer authentication failed: ${response.status}`);
        const { accessToken } = await response.json();
        if (cancelled) return;
        const tokenAccepted = await API.embed.setTokens({ accessToken });
        if (!tokenAccepted) throw new Error("Trimble did not accept the viewer token");
        const initialized = await API.embed.init3DViewer({ projectId: "7nAFSwau0CI" });
        if (!initialized || cancelled) return;
        apiRef.current = API;
        setViewerReady(true);
        const pendingCommand = pendingCommandRef.current;
        if (pendingCommand) {
          pendingCommandRef.current = null;
          await API.viewer.toggleModel(pendingCommand.ids, pendingCommand.loaded);
          lastCommandSequenceRef.current = pendingCommand.sequence;

        }
        const pendingData = pendingDataCommandRef.current;
        if (pendingData) {
          pendingDataCommandRef.current = null;
          handleDataCommand(API, pendingData);
        }
      } catch (error) {
        if (!cancelled) console.error("Trimble viewer error:", error);
      }
    };
    const handleLoad = () => { void initializeViewer(); };
    iframe.addEventListener("load", handleLoad);
    return () => {
      cancelled = true;
      selectionSequenceRef.current++;
      modelRequestSequenceRef.current.clear();
      apiRef.current = null;
      // Viewer readiness is reset when the component is mounted again.
      iframe.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!modelCommand) return;
    if (lastCommandSequenceRef.current === modelCommand.sequence) return;
    const API = apiRef.current;
    if (!API) {
      pendingCommandRef.current = modelCommand;
      return;
    }
    lastCommandSequenceRef.current = modelCommand.sequence;
    if (!modelCommand.loaded) {
      for (const id of modelCommand.ids) {
        modelRequestSequenceRef.current.set(id, (modelRequestSequenceRef.current.get(id) ?? 0) + 1);
        allModelEntityIdsRef.current.delete(id);
        identifierCacheRef.current.delete(id);
      }
    }
    void API.viewer.toggleModel(modelCommand.ids, modelCommand.loaded)
      .catch(error => console.error("Failed to toggle Trimble model:", error));
  }, [modelCommand]);

  useEffect(() => {
    if (!dataCommand || lastDataSequenceRef.current === dataCommand.sequence) return;
    lastDataSequenceRef.current = dataCommand.sequence;
    const API = apiRef.current;
    if (!API) {
      pendingDataCommandRef.current = dataCommand;
      return;
    }
    handleDataCommand(API, dataCommand);
  }, [dataCommand]);

  useEffect(() => {
    if (!selectionCommand) return;
    const API = apiRef.current;
    if (!API) return;
    void API.viewer.setSelection(
      {
        modelObjectIds: [{
          modelId: selectionCommand.modelId,
          objectRuntimeIds: [selectionCommand.runtimeId],
        }],
      },
      "set"
    ).catch(error => console.error("Could not select BIM object in 3D:", error));
  }, [selectionCommand]);

  useEffect(() => {
    const API = apiRef.current;
    if (!API || !visibilityCommand) return;

    const parseIds = (key: string): Map<string, number[]> => {
      const grouped = new Map<string, number[]>();
      for (const entry of key.split("|")) {
        if (!entry) continue;
        const separator = entry.lastIndexOf(":");
        if (separator < 0) continue;
        const modelId = entry.slice(0, separator);
        const runtimeId = Number(entry.slice(separator + 1));
        if (!Number.isInteger(runtimeId)) continue;
        const ids = grouped.get(modelId) ?? [];
        ids.push(runtimeId);
        grouped.set(modelId, ids);
      }
      return grouped;
    };

    const matching = visibilityCommand.enabled
      ? parseIds(visibilityCommand.visibleObjectIdsKey)
      : new Map<string, number[]>();
    const enabled = visibilityCommand.enabled;
    const entities = [...matching].map(([modelId, entityIds]) => ({ modelId, entityIds }));

    // Serialize isolation changes to avoid overlapping viewer commands.
    visibilityQueueRef.current = visibilityQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!enabled) {
          // An empty list isolates nothing; it does not restore visibility.
          // Isolating every loaded runtime ID restores the complete model.
          const allEntities = [...allModelEntityIdsRef.current].map(([modelId, entityIds]) => ({ modelId, entityIds }));
          const total = allEntities.reduce((sum, item) => sum + item.entityIds.length, 0);
          if (!total) return;
          await API.viewer.isolateEntities(allEntities);
          return;
        }
        // Native viewer "Show only selected objects"; do not hide non-matches.
        await API.viewer.isolateEntities(entities);
      })
      .catch(error => console.error("[3D filter] Native isolation failed:", error));
  }, [visibilityCommand?.enabled, visibilityCommand?.visibleObjectIdsKey]);

  // Colouring scans only lightweight Full Pour ID metadata, not the complete Model Data dataset.
  // The Trimble API still returns full properties per requested batch; only the identifier is
  // retained. The scan is opt-in, cancellable, and cached until each model is unloaded.
  useEffect(() => {
    const run = ++identifierRunRef.current;
    if (!inspectionScanEnabled || !inspectionModelKey || !viewerReady) return;
    const ids = inspectionModelKey.split("|").filter(id => !identifierCacheRef.current.has(id));
    if (!ids.length) return;
    const API = apiRef.current;
    if (!API) return;
    const isCurrent = () => run === identifierRunRef.current;
    void (async () => {
      let processed = 0;
      let total = 0;
      try {
        // Models may still be streaming into the viewer after a bulk toggle.
        // Wait for their entity lists rather than incorrectly recording a zero-item scan.
        let groups = await API.viewer.getObjects();
        for (let attempt = 0; attempt < 20 && isCurrent() && ids.some(modelId => !groups.some(group => group.modelId === modelId)); attempt++) {
          identifierCallbacksRef.current.onInspectionScanProgress?.({ loaded: 0, total: 0, status: "loading", message: "Waiting for model geometry…" });
          await new Promise<void>(resolve => setTimeout(resolve, 750));
          if (!isCurrent()) return;
          groups = await API.viewer.getObjects();
        }
        if (!isCurrent()) return;
        const missing = ids.filter(modelId => !groups.some(group => group.modelId === modelId));
        if (missing.length) throw new Error(`${missing.length} model(s) are not yet ready in the viewer. Retry the identifier scan once loading finishes.`);
        const targets = ids.map(modelId => ({modelId, runtimeIds: (groups.find(group => group.modelId === modelId)?.objects ?? []).map(object => object.id)}));
        total = targets.reduce((sum, target) => sum + target.runtimeIds.length, 0);
        identifierCallbacksRef.current.onInspectionScanProgress?.({loaded: 0, total, status: "loading"});
        for (const target of targets) {
          if (!isCurrent()) return;
          if (!target.runtimeIds.length) continue;
          const identifiers: {runtimeId: number; fullPourId: string}[] = [];
          for (let index = 0; index < target.runtimeIds.length; index += 50) {
            if (!isCurrent()) return;
            const properties = await API.viewer.getObjectProperties(target.modelId, target.runtimeIds.slice(index, index + 50));
            if (!isCurrent()) return;
            for (const object of properties) {
              const pourProp = object.properties?.flatMap(group => group.properties ?? []).find(property =>
                String(property.name ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "fullpourid");
              const fullPourId = pourProp ? String(pourProp.value ?? "").trim().toUpperCase() : "";
              if (fullPourId) identifiers.push({runtimeId: object.id, fullPourId});
            }
            processed += Math.min(50, target.runtimeIds.length - index);
            identifierCallbacksRef.current.onInspectionScanProgress?.({loaded: processed, total, status: "loading"});
            await new Promise<void>(resolve => setTimeout(resolve, 0));
          }
          if (!isCurrent()) return;
          identifierCacheRef.current.add(target.modelId);
          identifierCallbacksRef.current.onInspectionIdentifiers?.(target.modelId, identifiers);
        }
        if (isCurrent()) identifierCallbacksRef.current.onInspectionScanProgress?.({loaded: processed, total, status: "complete"});
      } catch (error) {
        if (!isCurrent()) return;
        identifierCallbacksRef.current.onInspectionScanProgress?.({loaded: processed, total, status: "error", message: error instanceof Error ? error.message : String(error)});
        console.error("FieldView identifier scan failed:", error);
      }
    })();
    return () => { identifierRunRef.current++; };
  }, [inspectionScanEnabled, inspectionModelKey, inspectionScanRetry, viewerReady]);

  useEffect(() => {
    const API = apiRef.current;
    if (!API || !colourCommand) return;
    const grouped = new Map<string, Map<string, number[]>>();
    if (colourCommand.enabled) {
      for (const item of colourCommand.entriesKey.split("|")) {
        if (!item) continue;
        const last = item.lastIndexOf(":");
        const first = item.lastIndexOf(":", last - 1);
        if (first < 0 || last < 0) continue;
        const modelId = item.slice(0, first);
        const runtimeId = Number(item.slice(first + 1, last));
        const color = item.slice(last + 1);
        if (!Number.isInteger(runtimeId) || !/^#[0-9a-f]{6}$/i.test(color)) continue;
        const byColor = grouped.get(modelId) ?? new Map<string, number[]>();
        const ids = byColor.get(color) ?? [];
        ids.push(runtimeId);
        byColor.set(color, ids);
        grouped.set(modelId, byColor);
      }
    }
    visibilityQueueRef.current = visibilityQueueRef.current.catch(() => undefined).then(async () => {
      // Reset previously coloured objects first, including when the toggle is disabled.
      for (const [modelId, ids] of colouredObjectIdsRef.current) {
        if (!ids.length) continue;
        await API.viewer.setObjectState({ modelObjectIds: [{ modelId, objectRuntimeIds: ids }] },
          { color: "reset" } as Parameters<typeof API.viewer.setObjectState>[1]);
      }
      colouredObjectIdsRef.current = new Map();
      if (!colourCommand.enabled) return;
      for (const [modelId, byColor] of grouped) {
        const coloured: number[] = [];
        for (const [color, ids] of byColor) {
          // Object colour only; do not change visibility or isolation.
          await API.viewer.setObjectState({ modelObjectIds: [{ modelId, objectRuntimeIds: ids }] },
            { color } as Parameters<typeof API.viewer.setObjectState>[1]);
          coloured.push(...ids);
        }
        colouredObjectIdsRef.current.set(modelId, coloured);
      }
    }).catch(error => console.error("Could not apply FieldView model colours:", error));
  }, [colourCommand?.enabled, colourCommand?.entriesKey]);

  return <iframe ref={iframeRef} src={WorkspaceAPI.getConnectEmbedUrl()} title="Trimble Connect 3D Viewer" className="trimble-viewer" />;
}

export default TrimbleViewer;
