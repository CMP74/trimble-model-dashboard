
import { useEffect, useRef } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";

type ModelCommand = {
  id: string;
  loaded: boolean;
  sequence: number;
};

type TrimbleViewerProps = {
  modelCommand?: ModelCommand;
};

type TrimbleAPI = Awaited<ReturnType<typeof WorkspaceAPI.connect>>;

function TrimbleViewer({ modelCommand }: TrimbleViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<TrimbleAPI | null>(null);

  // Remember commands until the viewer is ready.
  const pendingCommandRef = useRef<ModelCommand | null>(null);
  const lastCommandSequenceRef = useRef<number | null>(null);

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
          },
          30000
        );

        if (cancelled) return;

        console.log("2. Workspace API connected");

        const response = await fetch("/api/auth/viewer-token", {
          credentials: "same-origin",
          cache: "no-store",
        });

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
          throw new Error("Trimble did not accept the viewer token");
        }

        const initialized = await API.embed.init3DViewer({
          projectId: "7nAFSwau0CI",
        });

        console.log("4. Viewer initialized:", initialized);

        if (!initialized || cancelled) return;

        apiRef.current = API;

        // Process a command received while the viewer was starting.
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
          console.error("Trimble viewer error:", error);
        }
      }
    };

    const handleLoad = () => {
      void initializeViewer();
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      cancelled = true;
      apiRef.current = null;
      iframe.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!modelCommand) return;

    // Avoid processing the same command twice.
    if (
      lastCommandSequenceRef.current === modelCommand.sequence
    ) {
      return;
    }

    const API = apiRef.current;

    if (!API) {
      pendingCommandRef.current = modelCommand;
      return;
    }

    lastCommandSequenceRef.current = modelCommand.sequence;

    void API.viewer
      .toggleModel(modelCommand.id, modelCommand.loaded)
      .catch((error) => {
        console.error("Failed to toggle Trimble model:", error);
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
