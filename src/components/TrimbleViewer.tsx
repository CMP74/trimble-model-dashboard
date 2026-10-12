import { useEffect, useRef } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";

function TrimbleViewer() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      iframe.removeEventListener("load", handleLoad);
    };
  }, []);

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