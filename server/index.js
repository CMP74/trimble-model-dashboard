import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// Temporary POC storage
// Later we will replace this with proper session storage.
// ---------------------------------------------------------

const authSessions = new Map();

let trimbleAuth = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  user: null,
};

// ---------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function createCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(64));
}

function createCodeChallenge(verifier) {
  return base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest()
  );
}

// ---------------------------------------------------------
// Basic test routes
// ---------------------------------------------------------

app.get("/", (req, res) => {
  res.send("Backend is working");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Trimble dashboard backend is running",
  });
});

// ---------------------------------------------------------
// 1. Start Trimble login
// ---------------------------------------------------------

app.get("/api/auth/login", (req, res) => {
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = base64UrlEncode(crypto.randomBytes(32));

  authSessions.set(state, {
    codeVerifier,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: process.env.TRIMBLE_CLIENT_ID,
    response_type: "code",
    scope: `openid ${process.env.TRIMBLE_APPLICATION_NAME}`,
    redirect_uri: process.env.TRIMBLE_CALLBACK_URL,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authorizationUrl =
    `https://id.trimble.com/oauth/authorize?${params.toString()}`;

  res.json({
    authorizationUrl,
  });
});

// ---------------------------------------------------------
// 2. Exchange authorization code for Trimble token
// ---------------------------------------------------------

app.post("/api/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({
        error: "Missing authorization code or state",
      });
    }

    const session = authSessions.get(state);

    if (!session) {
      return res.status(400).json({
        error: "Invalid or expired authentication state",
      });
    }

    const tokenResponse = await fetch(
      "https://id.trimble.com/oauth/token",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },

        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.TRIMBLE_CLIENT_ID,
          code,
          redirect_uri: process.env.TRIMBLE_CALLBACK_URL,
          code_verifier: session.codeVerifier,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Trimble token error:", tokenData);

      return res.status(tokenResponse.status).json({
        error: "Trimble token exchange failed",
        details: tokenData,
      });
    }

    authSessions.delete(state);

    trimbleAuth.accessToken = tokenData.access_token;
    trimbleAuth.refreshToken = tokenData.refresh_token || null;

    trimbleAuth.expiresAt = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null;

    console.log("Trimble access token received");

    // -----------------------------------------------------
    // Test the token against Trimble Connect
    // -----------------------------------------------------

    const userResponse = await fetch(
      "https://app.connect.trimble.com/tc/api/2.0/users/me",
      {
        headers: {
          Authorization: `Bearer ${trimbleAuth.accessToken}`,
        },
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error("Trimble user request failed:", userData);

      return res.status(userResponse.status).json({
        error: "Authenticated, but could not retrieve Trimble user",
        details: userData,
      });
    }

    trimbleAuth.user = userData;

    console.log("Trimble user retrieved successfully");

    res.json({
      success: true,
      user: userData,
    });
  } catch (error) {
    console.error("Authentication callback error:", error);

    res.status(500).json({
      error: "Authentication callback failed",
    });
  }
});

// ---------------------------------------------------------
// 3. Authentication status
// ---------------------------------------------------------

app.get("/api/auth/status", (req, res) => {
  res.json({
    authenticated: Boolean(trimbleAuth.accessToken),
    user: trimbleAuth.user,
  });
  
 app.get("/api/auth/viewer-token", (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!trimbleAuth.accessToken) {
    return res.status(401).json({
      error: "Not connected to Trimble",
    });
  }

  res.json({
    accessToken: trimbleAuth.accessToken,
  });
}); 

  if (
    !trimbleAuth.accessToken ||
    (trimbleAuth.expiresAt && Date.now() >= trimbleAuth.expiresAt)
  ) {
    return res.status(401).json({
      error: "Trimble session missing or expired",
    });
  }

  res.set("Cache-Control", "no-store");

  res.json({
    accessToken: trimbleAuth.accessToken,
  });
});


// ---------------------------------------------------------
// Mock FieldView API
// ---------------------------------------------------------

const mockFieldViewRecords = [
  {
    id: "ITP-001",
    type: "ITP",
    title: "Structural concrete inspection",
    status: "Passed",
    date: "24 Sep 2026",
    modelGuid: "demo-wall-001",
  },
  {
    id: "NCR-014",
    type: "NCR",
    title: "Concrete finish NCR",
    status: "Open",
    date: "25 Sep 2026",
    modelGuid: "demo-wall-001",
  },
  {
    id: "ITP-002",
    type: "Inspection",
    title: "Structural element inspection",
    status: "Closed",
    date: "26 Sep 2026",
    modelGuid: "demo-beam-001",
  },
];

app.get("/api/fieldview/records", (req, res) => {
  const { modelGuid } = req.query;

  // If a model GUID is supplied, return records linked
  // to that particular BIM object.
  if (modelGuid) {
    const records = mockFieldViewRecords.filter(
      (record) => record.modelGuid === modelGuid
    );

    return res.json({
      source: "mock-fieldview",
      count: records.length,
      records,
    });
  }

  // Otherwise return all FieldView records.
  res.json({
    source: "mock-fieldview",
    count: mockFieldViewRecords.length,
    records: mockFieldViewRecords,
  });
});

// ---------------------------------------------------------
// Mock Trimble model API
// ---------------------------------------------------------

const mockModels = [
  {
    id: "model-001",
    name: "Building-Structural.ifc",
    discipline: "Structural",
    loaded: true,
    source: "Trimble Connect",
  },
  {
    id: "model-002",
    name: "Architecture.ifc",
    discipline: "Architectural",
    loaded: false,
    source: "Trimble Connect",
  },
  {
    id: "model-003",
    name: "MEP.ifc",
    discipline: "MEP",
    loaded: false,
    source: "Trimble Connect",
  },
];

app.get("/api/models", async (req, res) => {
  if (!trimbleAuth.accessToken) {
    return res.status(401).json({
      error: "Connect to Trimble first",
    });
  }

  try {
    const projectId = "7nAFSwau0CI";

    const response = await fetch(
      `https://app22.connect.trimble.com/tc/api/2.0/folders/KVqla3gS1XY/items`,
      {
        headers: {
          Authorization: `Bearer ${trimbleAuth.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Trimble models API failed:",
        response.status,
        errorText
      );

      return res.status(502).json({
        error: "Could not retrieve Trimble Connect models",
        trimbleStatus: response.status,
      });
    }

    const data = await response.json();

    console.log(
  "Trimble models response:",
  JSON.stringify(data, null, 2).slice(0, 3000)
);

    const rawModels = Array.isArray(data)
      ? data
      : Array.isArray(data.models)
        ? data.models
        : Array.isArray(data.items)
          ? data.items
          : [];

    const models = rawModels.map((model) => ({
      id: String(model.id),
      name: model.name || "Unnamed model",
      discipline: "Unclassified",
      loaded: false,
      source: "Trimble Connect",
    }));

    return res.json({
      source: "trimble-connect",
      count: models.length,
      models,
    });
  } catch (error) {
    console.error("Trimble models request failed:", error);

    return res.status(500).json({
      error: "Could not retrieve Trimble Connect models",
    });
  }
});

// ---------------------------------------------------------
// Mock BIM object data
// ---------------------------------------------------------

const mockModelObjects = [
  {
    guid: "demo-wall-001",
    modelId: "model-001",
    type: "IfcWall",
    name: "External Concrete Wall",
    level: "Ground Floor",
    material: "Concrete",
    discipline: "Structural",
  },
  {
    guid: "demo-beam-001",
    modelId: "model-001",
    type: "IfcBeam",
    name: "Primary Structural Beam",
    level: "Level 01",
    material: "Steel",
    discipline: "Structural",
  },
];

app.get("/api/model-objects", (req, res) => {
  res.json({
    source: "mock-model-data",
    count: mockModelObjects.length,
    objects: mockModelObjects,
  });
});

app.get("/api/model-objects/:guid", (req, res) => {
  const object = mockModelObjects.find(
    (item) => item.guid === req.params.guid
  );

  if (!object) {
    return res.status(404).json({
      error: "Model object not found",
    });
  }

  res.json({
    source: "mock-model-data",
    object,
  });
});


// ---------------------------------------------------------
// Mock Asite model data
// ---------------------------------------------------------

const mockAsiteModels = [
  {
    id: "asite-model-001",
    name: "Structural_Model_Rev_P03.ifc",
    revision: "P03",
    discipline: "Structural",
    status: "Published",
    size: "48.2 MB",
    modifiedDate: "27 Sep 2026",
    source: "Asite",
  },
  {
    id: "asite-model-002",
    name: "Architectural_Model_Rev_P05.ifc",
    revision: "P05",
    discipline: "Architectural",
    status: "Published",
    size: "62.7 MB",
    modifiedDate: "26 Sep 2026",
    source: "Asite",
  },
  {
    id: "asite-model-003",
    name: "MEP_Coordination_Rev_P02.ifc",
    revision: "P02",
    discipline: "MEP",
    status: "Published",
    size: "37.4 MB",
    modifiedDate: "25 Sep 2026",
    source: "Asite",
  },
];

app.get("/api/asite/models", (req, res) => {
  res.json({
    source: "mock-asite",
    count: mockAsiteModels.length,
    models: mockAsiteModels,
  });
});

// Asite OAuth integration readiness only. No browser-held Asite credentials,
// session-cookie reuse, or unauthenticated document proxying.
app.get("/api/asite/connection", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    configured: false,
    message: "Asite Microsoft SSO API access requires an approved OAuth client registration. Live document listing is not yet enabled.",
  });
});


// -------------------------------------------------------------------
// Trimble Connect PDF indexing (read-only, per server session)
// Folder defaults to the model folder; change TRIMBLE_DOCUMENT_FOLDER_ID
// in the backend environment to point at the folder containing the PDF.
// -------------------------------------------------------------------
const documentIndex = new Map();
const TC_API = "https://app22.connect.trimble.com/tc/api/2.0";
const DOCUMENT_FOLDER_NAME = process.env.TRIMBLE_DOCUMENT_FOLDER_NAME || "XX Sandbox";
const DOCUMENT_FOLDER_OVERRIDE = process.env.TRIMBLE_DOCUMENT_FOLDER_ID || "";
const DOCUMENT_PROJECT_ID = process.env.TRIMBLE_PROJECT_ID || "7nAFSwau0CI";
let folderCache = null;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
function tokenIsValid() {
  return Boolean(trimbleAuth.accessToken) && (!trimbleAuth.expiresAt || Date.now() < trimbleAuth.expiresAt);
}
function tcHeaders() {
  return { Authorization: `Bearer ${trimbleAuth.accessToken}`, Accept: "application/json" };
}
function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["items", "files", "results", "data"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}
function folderIdFromProject(project) {
  return project?.rootId ?? project?.rootFolderId ?? project?.rootFolder?.id ?? project?.root?.id ?? null;
}
async function resolveDocumentFolder({ refresh = false } = {}) {
  if (DOCUMENT_FOLDER_OVERRIDE) return { id: DOCUMENT_FOLDER_OVERRIDE, name: DOCUMENT_FOLDER_NAME, mode: "explicit-id" };
  if (!refresh && folderCache) return folderCache;
  const project = await tcJson(`${TC_API}/projects/${encodeURIComponent(DOCUMENT_PROJECT_ID)}`);
  const rootId = folderIdFromProject(project);
  if (!rootId) throw new Error("Project metadata did not contain a root folder ID. Check the Trimble project API response.");
  const entries = extractItems(await tcJson(`${TC_API}/folders/${encodeURIComponent(rootId)}/items`));
  const folder = entries.find(item => String(item.name ?? "").trim().toLowerCase() === DOCUMENT_FOLDER_NAME.trim().toLowerCase() &&
    (String(item.type ?? item.itemType ?? item.objectType ?? "").toLowerCase().includes("folder") || !/\.[^./]+$/.test(String(item.name ?? ""))));
  if (!folder?.id) {
    const available = entries.filter(item => String(item.type ?? item.itemType ?? item.objectType ?? "").toLowerCase().includes("folder") || !/\.[^./]+$/.test(String(item.name ?? ""))).map(item => item.name).filter(Boolean).slice(0, 20);
    throw new Error(`Folder "${DOCUMENT_FOLDER_NAME}" was not found at the project root. Visible folders: ${available.join(", ") || "none"}.`);
  }
  folderCache = { id: String(folder.id), name: String(folder.name), mode: "project-root-discovery" };
  return folderCache;
}
function docRecord(item) {
  return {
    id: String(item.id ?? item.fileId ?? ""),
    name: String(item.name ?? item.fileName ?? ""),
    revision: item.revision ?? item.version ?? item.versionNumber ?? null,
    modified: item.modified ?? item.modifiedAt ?? item.updatedAt ?? null,
    source: "Trimble Connect",
  };
}
function isPdf(item) {
  return /\.pdf$/i.test(String(item.name ?? item.fileName ?? "")) || /application\/pdf/i.test(String(item.mimeType ?? item.contentType ?? ""));
}
async function tcJson(url) {
  const response = await fetch(url, { headers: tcHeaders(), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Trimble Connect returned HTTP ${response.status}`);
  return response.json();
}
app.get("/api/documents/status", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!tokenIsValid()) return res.json({ authenticated: false, folderName: DOCUMENT_FOLDER_NAME, indexed: documentIndex.size });
  try {
    const folder = await resolveDocumentFolder();
    res.json({ authenticated: true, folderName: folder.name, folderId: folder.id, resolution: folder.mode, indexed: documentIndex.size });
  } catch (error) {
    res.json({ authenticated: true, folderName: DOCUMENT_FOLDER_NAME, folderId: null, indexed: documentIndex.size, error: error.message });
  }
});
app.get("/api/documents", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!tokenIsValid()) return res.status(401).json({ error: "Connect to Trimble first (or renew your session)." });
  try {
    const folder = await resolveDocumentFolder({ refresh: req.query.refresh === "1" });
    const data = await tcJson(`${TC_API}/folders/${encodeURIComponent(folder.id)}/items`);
    const documents = extractItems(data).filter(isPdf).map(docRecord).filter(x => x.id);
    res.json({ source: "trimble-connect", folderId: folder.id, folderName: folder.name, documents });
  } catch (error) {
    res.status(502).json({ error: `Could not list PDF files: ${error.message}` });
  }
});
// Only file IDs from the configured folder can be indexed. No arbitrary URLs.
app.post("/api/documents/:id/index", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!tokenIsValid()) return res.status(401).json({ error: "Connect to Trimble first (or renew your session)." });
  try {
    const folder = await resolveDocumentFolder();
    const items = extractItems(await tcJson(`${TC_API}/folders/${encodeURIComponent(folder.id)}/items`));
    const item = items.find(x => String(x.id ?? x.fileId) === req.params.id && isPdf(x));
    if (!item) return res.status(404).json({ error: "PDF not found in the selected Trimble Connect document folder." });
    const meta = docRecord(item);
    // Trimble Connect legacy Core API provides a short-lived, preauthorised
    // download URL via /files/fs/{fileId}/downloadurl. The former
    // /files/{fileId}/download route is not supported here (HTTP 404).
    const downloadEndpoint = `${TC_API}/files/fs/${encodeURIComponent(meta.id)}/downloadurl`;
    const downloadInfoResponse = await fetch(downloadEndpoint, {
      headers: tcHeaders(),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (!downloadInfoResponse.ok) {
      throw new Error(`Trimble download-link request returned HTTP ${downloadInfoResponse.status}. Confirm this file ID and download permissions.`);
    }
    const downloadInfoText = await downloadInfoResponse.text();
    let downloadInfo;
    try { downloadInfo = JSON.parse(downloadInfoText); }
    catch { downloadInfo = downloadInfoText.trim(); }
    // Trimble API versions can return either a URL string or a JSON object.
    const downloadLink = typeof downloadInfo === "string" ? downloadInfo :
      (downloadInfo?.url ?? downloadInfo?.downloadUrl ?? downloadInfo?.downloadURL ??
       downloadInfo?.href ?? downloadInfo?.link ?? downloadInfo?.data?.url ??
       downloadInfo?.data?.downloadUrl ?? downloadInfo?.result?.url);
    if (typeof downloadLink !== "string" || !downloadLink.trim()) {
      const keys = downloadInfo && typeof downloadInfo === "object" ? Object.keys(downloadInfo).join(", ") : "none";
      throw new Error(`Trimble returned a download-link response without a recognised URL (fields: ${keys}).`);
    }
    const signedUrl = new URL(downloadLink);
    if (signedUrl.protocol !== "https:") throw new Error("Trimble returned a non-HTTPS download URL.");
    // Download URLs are short-lived and preauthorised. Never send the Trimble
    // OAuth bearer token to a signed storage URL.
    const pdfResponse = await fetch(signedUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(60000),
    });
    if (!pdfResponse.ok) throw new Error(`PDF download returned HTTP ${pdfResponse.status}. Check the Trimble file download API/permissions.`);
    const size = Number(pdfResponse.headers.get("content-length") || 0);
    if (size > MAX_PDF_BYTES) throw new Error("PDF exceeds the 30 MB indexing limit.");
    const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF exceeds the 30 MB indexing limit.");
    if (String.fromCharCode(...bytes.slice(0,5)) !== "%PDF-") throw new Error("Trimble returned a non-PDF response. File download endpoint may need adjustment.");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(x => typeof x.str === "string" ? x.str : "").join(" ").replace(/\s+/g, " ").trim();
      pages.push({ page: number, text, searchable: Boolean(text), characters: text.length });
      page.cleanup();
    }
    const result = { ...meta, indexedAt: new Date().toISOString(), pageCount: pages.length, pages };
    documentIndex.set(meta.id, result);
    res.json({ document: result });
  } catch (error) {
    console.error("PDF indexing failed:", error);
    res.status(502).json({ error: `Could not index PDF: ${error.message}` });
  }
});
app.get("/api/documents/search", (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!tokenIsValid()) return res.status(401).json({ error: "Connect to Trimble first." });
  const query = String(req.query.q || "").trim().toLowerCase().slice(0, 150);
  if (!query) return res.json({ results: [], indexed: documentIndex.size });
  const terms = query.split(/\s+/).filter(x => x.length > 2);
  const results = [];
  for (const document of documentIndex.values()) {
    for (const page of document.pages) {
      const lower = page.text.toLowerCase();
      if (!terms.length || !terms.every(term => lower.includes(term))) continue;
      const first = lower.indexOf(terms[0]);
      const start = Math.max(0, first - 120);
      results.push({ id: document.id, name: document.name, revision: document.revision, page: page.page, excerpt: page.text.slice(start, start + 440), source: "Trimble Connect PDF", matchedBy: "text" });
    }
  }
  res.json({ results: results.slice(0, 50), indexed: documentIndex.size });
});

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------

const PORT = 3000;

app.get("/api/auth/viewer-token", (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!trimbleAuth.accessToken) {
    return res.status(401).json({
      error: "Not connected to Trimble",
    });
  }

  return res.json({
    accessToken: trimbleAuth.accessToken,
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});