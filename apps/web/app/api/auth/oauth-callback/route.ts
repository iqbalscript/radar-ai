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
<body style="background:#0b1220;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:1.5rem;">
  <div id="status-container">
    <div style="font-size:2.5rem;margin-bottom:0.75rem;">⚡</div>
    <h3 style="margin:0 0 0.5rem;font-size:1.25rem;">Memverifikasi Kredensial OAuth…</h3>
    <p style="color:#94a3b8;font-size:0.9rem;margin:0;">Jendela ini akan menutup secara otomatis dalam sekejap.</p>
  </div>
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
          error: params.get("error") || "",
          errorDescription: params.get("error_description") || "",
          timestamp: Date.now()
        };

        // 1. BroadcastChannel (modern across-tab/popup IPC)
        try {
          if (typeof BroadcastChannel !== "undefined") {
            var channel = new BroadcastChannel("RADAR_GOOGLE_OAUTH_CHANNEL");
            channel.postMessage(payload);
          }
        } catch (e) {}

        // 2. localStorage event fallback
        try {
          localStorage.setItem("RADAR_GOOGLE_OAUTH_RESULT", JSON.stringify(payload));
        } catch (e) {}

        // 3. window.opener.postMessage (classic popup IPC)
        try {
          if (window.opener && window.opener !== window) {
            window.opener.postMessage(payload, window.location.origin);
          }
        } catch (e) {}

        if (payload.error) {
          var container = document.getElementById("status-container");
          if (container) {
            container.innerHTML = '<div style="font-size:2.5rem;margin-bottom:0.75rem;">⚠️</div>' +
              '<h3 style="color:#f87171;margin:0 0 0.5rem;">Google OAuth Error: ' + payload.error + '</h3>' +
              '<p style="color:#94a3b8;font-size:0.85rem;max-width:380px;line-height:1.4;">' +
              (payload.errorDescription || "Silakan tutup jendela ini dan ulangi login pada tab utama.") +
              '</p>' +
              '<button onclick="window.close()" style="margin-top:1.25rem;padding:0.6rem 1.25rem;background:#334155;color:#f8fafc;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Tutup Jendela</button>';
          }
          setTimeout(function() { window.close(); }, 5000);
          return;
        }

        setTimeout(function () {
          window.close();
        }, 350);
      } catch (err) {
        setTimeout(function () {
          window.close();
        }, 1200);
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
      "Cross-Origin-Opener-Policy": "unsafe-none",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

