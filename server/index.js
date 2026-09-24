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
});

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});