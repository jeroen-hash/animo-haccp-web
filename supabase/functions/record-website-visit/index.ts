const ALLOWED_ORIGINS = new Set([
  "https://www.animo-apps.com",
  "https://start.animo-apps.com",
]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") {
    if (!allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!allowedOrigin) {
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Alleen de publieke startpagina tellen; geen querystrings of persoonsgegevens bewaren.
    if (body?.path !== "/") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Analytics unavailable", { status: 503, headers: corsHeaders });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/website_visit_events`,
      {
        method: "POST",
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ page_path: "/" }),
      },
    );

    if (!response.ok) {
      return new Response("Could not record visit", { status: 502, headers: corsHeaders });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  } catch {
    return new Response("Invalid request", { status: 400, headers: corsHeaders });
  }
});
