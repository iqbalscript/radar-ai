import { NextResponse } from "next/server";

/**
 * OAuth2 popup callback receiver that extracts fragment parameters on the client
 * and posts them back exclusively to `window.opener` on the same origin.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Menyelesaikan Login OAuth — RADAR AI</title>
</head>
<body style="background:#0b1220;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>Memverifikasi kredensial OAuth…</p>
  <script>
    (function () {
      try {
        var hash = window.location.hash ? window.location.hash.substring(1) : "";
        var params = new URLSearchParams(hash || window.location.search);
        var payload = {
          type: "RADAR_GOOGLE_OAUTH_RESULT",
          state: params.get("state") || "",
          idToken: params.get("id_token") || "",
          accessToken: params.get("access_token") || "",
          error: params.get("error") || ""
        };
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(payload, window.location.origin);
        }
      } finally {
        window.close();
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

