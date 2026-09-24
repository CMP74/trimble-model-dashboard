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
          (event, data) => {
            console.log("Trimble event:", event, data);
          },
          30000
        );

        console.log("2. Trimble Workspace API connected");
        console.log("Trimble API:", API);

      } catch (error) {
        console.error("3. Trimble connection failed:", error);
      }
    };

    const handleLoad = () => {
      console.log("0. Trimble iframe loaded");
      connectToTrimble();
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