
import { useEffect, useRef } from "react";
import * as WorkspaceAPI from "trimble-connect-workspace-api";

function TrimbleViewer() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;

    if (!iframe) {
      console.error("Trimble iframe not found");
      return;
    }

    const connectToTrimble = async () => {
      try {
        console.log("1. Connecting to Trimble...");

        const API = await WorkspaceAPI.connect(
          iframe,
          (event: string, data: unknown) => {
            console.log("Trimble event:", event, data);
          },
          30000
        );

        console.log("2. Trimble Workspace API connected");

        // Test initializing the actual Trimble project.
        const initialized = await API.embed.init3DViewer({
          projectId: "7nAFSwau0CI",
        });

        console.log(
          "3. Viewer initialization result:",
          initialized
        );

      } catch (error) {
        console.error(
          "Trimble viewer initialization failed:",
          error
        );
      }
    };

    const handleLoad = () => {
      console.log("0. Trimble iframe loaded");
      void connectToTrimble();
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
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
