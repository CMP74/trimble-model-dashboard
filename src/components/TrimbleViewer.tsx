
import { useEffect, useRef } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";

export type BIMProperty = {
  name: string;
  value: unknown;
  type?: number;
};

export type BIMPropertyGroup = {
  name: string;
  properties: BIMProperty[];
};

export type SelectedBIMObject = {
  modelId: string;
  runtimeId: number;
  name: string;
  ifcClass: string;
  description: string;
  position?: {
    x: number;
    y: number;
    z: number;
  };
  propertyGroups: BIMPropertyGroup[];
};

type ModelCommand = {
  id: string;
  loaded: boolean;
  sequence: number;
};

type TrimbleViewerProps = {
  modelCommand?: ModelCommand;
  onObjectSelected?: (object: SelectedBIMObject | null) => void;
};

type TrimbleAPI = Awaited<
  ReturnType<typeof WorkspaceAPI.connect>
>;

type SelectionEvent = {
  data?: {
    modelId: string;
    objectRuntimeIds: number[];
  }[];
};

function TrimbleViewer({
  modelCommand,
  onObjectSelected,
}: TrimbleViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<TrimbleAPI | null>(null);

  const pendingCommandRef = useRef<ModelCommand | null>(null);
  const lastCommandSequenceRef = useRef<number | null>(null);

  // Keep the latest callback without reconnecting the viewer.
  const onObjectSelectedRef = useRef(onObjectSelected);
  onObjectSelectedRef.current = onObjectSelected;

  // Prevent slower property requests from overwriting newer selections.
  const selectionSequenceRef = useRef(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;

    const initializeViewer = async () => {
      try {
        console.log("1. Connecting to Trimble Workspace API...");

        const API = await WorkspaceAPI.connect(
          iframe,
          (event: string, data: unknown) => {
            console.log("Trimble event:", event, data);

            if (event !== "viewer.onSelectionChanged") {
              return;
            }

            const selection = data as SelectionEvent;
            const selected = selection.data?.[0];

            const requestSequence =
              ++selectionSequenceRef.current;

            if (
              !selected ||
              !selected.objectRuntimeIds?.length
            ) {
              onObjectSelectedRef.current?.(null);
              return;
            }

            const currentAPI = apiRef.current;

            if (!currentAPI) return;

            void currentAPI.viewer
              .getObjectProperties(
                selected.modelId,
                selected.objectRuntimeIds
              )
              .then((objects) => {
                if (
                  cancelled ||
                  requestSequence !==
                    selectionSequenceRef.current
                ) {
                  return;
                }

                const object = objects[0];

                if (!object) {
                  onObjectSelectedRef.current?.(null);
                  return;
                }

                const selectedObject: SelectedBIMObject = {
                  modelId: selected.modelId,
                  runtimeId: object.id,
                  name:
                    object.product?.name ??
                    "Unnamed object",
                  ifcClass: object.class ?? "Unknown",
                  description:
                    object.product?.description ?? "",
                  position: object.position,
                  propertyGroups:
                    object.properties?.map((group) => ({
                      name: group.name ?? "Other Properties",
                      properties: (group.properties ?? []).map(
                        (property) => ({
                          name: property.name,
                          value: property.value,
                          type: property.type,
                        })
                      ),
                    })) ?? [],
                };

                console.log(
                  "Selected real BIM object:",
                  selectedObject
                );

                onObjectSelectedRef.current?.(
                  selectedObject
                );
              })
              .catch((error) => {
                console.error(
                  "Could not retrieve BIM properties:",
                  error
                );
              });
          },
          30000
        );

        if (cancelled) return;

        console.log("2. Workspace API connected");

        const response = await fetch(
          "/api/auth/viewer-token",
          {
            credentials: "same-origin",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Viewer authentication failed: ${response.status}`
          );
        }

        const { accessToken } = await response.json();

        if (cancelled) return;

        const tokenAccepted = await API.embed.setTokens({
          accessToken,
        });

        console.log("3. Token accepted:", tokenAccepted);

        if (!tokenAccepted) {
          throw new Error(
            "Trimble did not accept the viewer token"
          );
        }

        const initialized = await API.embed.init3DViewer({
          projectId: "7nAFSwau0CI",
        });

        console.log("4. Viewer initialized:", initialized);

        if (!initialized || cancelled) return;

        apiRef.current = API;

        const pendingCommand = pendingCommandRef.current;

        if (pendingCommand) {
          pendingCommandRef.current = null;

          await API.viewer.toggleModel(
            pendingCommand.id,
            pendingCommand.loaded
          );

          lastCommandSequenceRef.current =
            pendingCommand.sequence;
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Trimble viewer error:",
            error
          );
        }
      }
    };

    const handleLoad = () => {
      void initializeViewer();
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      cancelled = true;
      selectionSequenceRef.current++;
      apiRef.current = null;
      iframe.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!modelCommand) return;

    if (
      lastCommandSequenceRef.current ===
      modelCommand.sequence
    ) {
      return;
    }

    const API = apiRef.current;

    if (!API) {
      pendingCommandRef.current = modelCommand;
      return;
    }

    lastCommandSequenceRef.current =
      modelCommand.sequence;

    void API.viewer
      .toggleModel(
        modelCommand.id,
        modelCommand.loaded
      )
      .catch((error) => {
        console.error(
          "Failed to toggle Trimble model:",
          error
        );
      });
  }, [modelCommand]);

  return (
    <iframe
      ref={iframeRef}
      src={WorkspaceAPI.getConnectEmbedUrl()}
      title="Trimble Connect 3D Viewer"
      className="trimble-viewer"
    />
  );
}

export default TrimbleViewer;
