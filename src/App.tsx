import { useEffect, useState } from "react";
import "./App.css";
import TrimbleViewer from "./components/TrimbleViewer";

function App() {
  const [authStatus, setAuthStatus] = useState("Not connected");

  // -------------------------------------------------------
  // Handle return from Trimble OAuth
  // -------------------------------------------------------

  useEffect(() => {
    const handleTrimbleCallback = async () => {
      // Only run this code on /auth/callback
      if (window.location.pathname !== "/auth/callback") {
        return;
      }

      const params = new URLSearchParams(window.location.search);

      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      if (error) {
        console.error("Trimble returned an OAuth error:", error);
        setAuthStatus("Login failed");
        return;
      }

      if (!code || !state) {
        console.error("Missing code or state from Trimble callback");
        setAuthStatus("Login failed");
        return;
      }

      try {
        setAuthStatus("Connecting...");

        const response = await fetch("/api/auth/callback", {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            code,
            state,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error("Authentication failed:", data);
          setAuthStatus("Login failed");
          return;
        }

        console.log("Trimble authentication successful:", data);

        setAuthStatus("Connected");

        // Remove the OAuth code/state from the browser URL
        window.history.replaceState({}, "", "/");
      } catch (error) {
        console.error("Callback failed:", error);
        setAuthStatus("Login failed");
      }
    };

    handleTrimbleCallback();
  }, []);

  // -------------------------------------------------------
  // Start Trimble OAuth
  // -------------------------------------------------------

  const connectToTrimble = async () => {
    try {
      console.log("Starting Trimble login...");

      const response = await fetch("/api/auth/login");

      if (!response.ok) {
        throw new Error("Could not start Trimble login");
      }

      const data = await response.json();

      console.log("Trimble authorization URL received");

      window.location.href = data.authorizationUrl;
    } catch (error) {
      console.error("Trimble login failed:", error);
      alert("Could not connect to Trimble");
    }
  };

  return (
    <div className="app">

      {/* HEADER */}

      <header className="app-header">
        <div>
          <h1>Trimble Model Dashboard</h1>
          <p>Model intelligence and visualisation</p>
        </div>

        <div className="header-actions">

          <button
            className="trimble-connect-button"
            onClick={connectToTrimble}
          >
            Connect to Trimble
          </button>

          <div className="status">
            <span className="status-dot"></span>
            {authStatus}
          </div>

        </div>
      </header>

      {/* MAIN CONTENT */}

      <main className="dashboard-layout">

        {/* TRIMBLE VIEWER */}

        <section className="viewer-panel">

          <div className="panel-header">
            <div>
              <h2>3D Model</h2>
              <span>Trimble Connect</span>
            </div>
          </div>

          <div className="viewer-container">
            <TrimbleViewer />
          </div>

        </section>

        {/* DASHBOARD */}

        <section className="dashboard-panel">

          <div className="panel-header">
            <div>
              <h2>Model Dashboard</h2>
              <span>BIM model information</span>
            </div>
          </div>

          <div className="dashboard-content">

            {/* MODEL SUMMARY */}

            <div className="dashboard-section">

              <h3>Model Summary</h3>

              <div className="summary-grid">

                <div className="summary-card">
                  <span className="summary-label">
                    Models
                  </span>
                  <strong>1</strong>
                </div>

                <div className="summary-card">
                  <span className="summary-label">
                    Elements
                  </span>
                  <strong>16</strong>
                </div>

                <div className="summary-card">
                  <span className="summary-label">
                    Doors
                  </span>
                  <strong>0</strong>
                </div>

                <div className="summary-card">
                  <span className="summary-label">
                    Windows
                  </span>
                  <strong>0</strong>
                </div>

              </div>
            </div>

            {/* ELEMENT TYPES */}

            <div className="dashboard-section">

              <h3>Element Types</h3>

              <div className="element-list">

                <div className="element-row">
                  <span>Walls</span>
                  <strong>4</strong>
                </div>

                <div className="element-row">
                  <span>Beams</span>
                  <strong>6</strong>
                </div>

                <div className="element-row">
                  <span>Footings</span>
                  <strong>1</strong>
                </div>

                <div className="element-row">
                  <span>Roofs</span>
                  <strong>1</strong>
                </div>

              </div>
            </div>

            {/* SELECTED OBJECT */}

            <div className="dashboard-section">

              <h3>Selected Object</h3>

              <div className="selected-object">
                <p className="empty-selection">
                  Select an object in the 3D viewer to view
                  its properties.
                </p>
              </div>

            </div>

          </div>
        </section>

      </main>
    </div>
  );
}

export default App;