import "./App.css";

function App() {
  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Trimble Model Dashboard</h1>
          <p>Model intelligence and visualisation</p>
        </div>

        <div className="status">
          <span className="status-dot"></span>
          Connected
        </div>
      </header>

      <main className="workspace">
        <section className="viewer-panel">
          <div className="panel-header">
            <h2>3D Model</h2>
            <span>Trimble Connect</span>
          </div>

          <div className="viewer-placeholder">
            <div className="viewer-message">
              <div className="viewer-icon">3D</div>
              <h3>Trimble Connect Viewer</h3>
              <p>
                The Trimble Connect viewer will be embedded here.
              </p>
            </div>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-header">
            <h2>Model Dashboard</h2>
            <span>POC</span>
          </div>

          <div className="dashboard">
            <div className="summary-grid">
              <div className="card">
                <span>Models</span>
                <strong>—</strong>
              </div>

              <div className="card">
                <span>Elements</span>
                <strong>—</strong>
              </div>

              <div className="card">
                <span>Doors</span>
                <strong>—</strong>
              </div>

              <div className="card">
                <span>Windows</span>
                <strong>—</strong>
              </div>
            </div>

            <div className="dashboard-card">
              <h3>Element Types</h3>

              <div className="empty-state">
                Model data will appear here.
              </div>
            </div>

            <div className="dashboard-card">
              <h3>Selected Object</h3>

              <div className="empty-state">
                Select an object in the 3D viewer.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;