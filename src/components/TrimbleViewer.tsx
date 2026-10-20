import { useEffect, useRef } from "react";
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
type ModelCommand = { id: string; loaded: boolean; sequence: number };
type ObjectSelectionCommand = {
  modelId: string;
  runtimeId: number;
  sequence: number;
};
type ColourCommand = { enabled: boolean; entriesKey: string };
type VisibilityCommand = { enabled: boolean; hiddenObjectIdsKey: string; visibleObjectIdsKey: string };
type TrimbleViewerProps = {
  visibilityCommand?: VisibilityCommand;
  colourCommand?: ColourCommand;
  modelCommand?: ModelCommand;
  selectionCommand?: ObjectSelectionCommand;
  onObjectSelected?: (object: SelectedBIMObject | null) => void;
  onModelObjectsLoaded?: (modelId: string, objects: SelectedBIMObject[]) => void;
};
type TrimbleAPI = Awaited<ReturnType<typeof WorkspaceAPI.connect>>;
type SelectionEvent = { data?: { modelId: string; objectRuntimeIds: number[] }[] };

function TrimbleViewer({
  modelCommand,
  selectionCommand,
  visibilityCommand,
  colourCommand,
  onObjectSelected,
  onModelObjectsLoaded,
}: TrimbleViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<TrimbleAPI | null>(null);
  const pendingCommandRef = useRef<ModelCommand | null>(null);
  const lastCommandSequenceRef = useRef<number | null>(null);
  const onObjectSelectedRef = useRef(onObjectSelected);
  const onModelObjectsLoadedRef = useRef(onModelObjectsLoaded);
  onObjectSelectedRef.current = onObjectSelected;
  onModelObjectsLoadedRef.current = onModelObjectsLoaded;
  const selectionSequenceRef = useRef(0);
  const modelRequestSequenceRef = useRef(0);
  const visibilityQueueRef = useRef<Promise<void>>(Promise.resolve());
  const colouredObjectIdsRef = useRef<Map<string, number[]>>(new Map());
  const allModelEntityIdsRef = useRef<Map<string, number[]>>(new Map());


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

  const collectModelObjects = async (API: TrimbleAPI, modelId: string) => {
    const requestSequence = ++modelRequestSequenceRef.current;
    try {
      const groups = await API.viewer.getObjects();
      const group = groups.find(item => item.modelId === modelId);
      if (!group) {
        console.warn("No objects returned for loaded model:", modelId);
        return;
      }
      const runtimeIds = group.objects.map(item => item.id);
      // Keep requests reasonably sized for larger IFC models.
      const allObjects: SelectedBIMObject[] = [];
      for (let index = 0; index < runtimeIds.length; index += 100) {
        const batch = await API.viewer.getObjectProperties(modelId, runtimeIds.slice(index, index + 100));
        if (requestSequence !== modelRequestSequenceRef.current) return;
        allObjects.push(...batch.map(object => mapObject(modelId, object)));
      }
      if (requestSequence === modelRequestSequenceRef.current) {
        allModelEntityIdsRef.current.set(modelId, allObjects.map(object => object.runtimeId));
        onModelObjectsLoadedRef.current?.(modelId, allObjects);
      }
    } catch (error) {
      console.error("Could not retrieve model data:", error);
    }
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
          const selected = selection.data?.[0];
          const requestSequence = ++selectionSequenceRef.current;
          if (!selected || !selected.objectRuntimeIds?.length) {
            onObjectSelectedRef.current?.(null);
            return;
          }
          const currentAPI = apiRef.current;
          if (!currentAPI) return;
          void currentAPI.viewer.getObjectProperties(selected.modelId, selected.objectRuntimeIds)
            .then(objects => {
              if (cancelled || requestSequence !== selectionSequenceRef.current) return;
              const object = objects[0];
              onObjectSelectedRef.current?.(object ? mapObject(selected.modelId, object) : null);
            })
            .catch(error => console.error("Could not retrieve BIM properties:", error));
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
        const pendingCommand = pendingCommandRef.current;
        if (pendingCommand) {
          pendingCommandRef.current = null;
          await API.viewer.toggleModel(pendingCommand.id, pendingCommand.loaded);
          lastCommandSequenceRef.current = pendingCommand.sequence;
          if (pendingCommand.loaded && !cancelled) void collectModelObjects(API, pendingCommand.id);
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
      modelRequestSequenceRef.current++;
      apiRef.current = null;
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
      modelRequestSequenceRef.current++;
      allModelEntityIdsRef.current.delete(modelCommand.id);
    }
    void API.viewer.toggleModel(modelCommand.id, modelCommand.loaded)
      .then(() => {
        if (modelCommand.loaded) return collectModelObjects(API, modelCommand.id);
      })
      .catch(error => console.error("Failed to toggle Trimble model:", error));
  }, [modelCommand]);

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
