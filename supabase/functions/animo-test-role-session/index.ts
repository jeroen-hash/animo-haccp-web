import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEST_BUSINESS_ID = "6d2b1a98-a382-49a9-9a76-5ec6021f8851";
const TEST_BUSINESS_NAME = "Test onbaording";
const TEST_ORIGIN = "https://test.animo-apps.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLISHABLE_KEY = "sb_publishable_Cgh3XIJouxoWHgwWCT84rA_jkZMU14k";

const corsHeaders = {
  "Access-Control-Allow-Origin": TEST_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin !== TEST_ORIGIN) {
    return new Response("Forbidden origin", { status: 403 });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Alleen POST is toegestaan." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return respond({ error: "De beveiligde testconfiguratie ontbreekt." }, 500);
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return respond({ error: "Meld eerst aan met het eigenaar-testaccount." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const accessToken = authorization.slice(7).trim();
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    const caller = authData?.user;
    if (authError || !caller) return respond({ error: "De testsessie is ongeldig of verlopen." }, 401);

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id, name")
      .eq("id", TEST_BUSINESS_ID)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business || business.name !== TEST_BUSINESS_NAME) {
      return respond({ error: "De vaste testzaak kon niet veilig worden bevestigd." }, 404);
    }

    const { data: callerMembership, error: membershipError } = await admin
      .from("business_members")
      .select("role, active")
      .eq("business_id", TEST_BUSINESS_ID)
      .eq("user_id", caller.id)
      .maybeSingle();
    if (membershipError) throw membershipError;

    const isHarnessUser =
      caller.app_metadata?.animo_test_harness === true &&
      caller.app_metadata?.animo_test_business_id === TEST_BUSINESS_ID;
    const isInitialOwner =
      callerMembership?.active === true && callerMembership?.role === "owner";

    if (!isHarnessUser && !isInitialOwner) {
      return respond({ error: "Alleen de eigenaar van de testzaak kan de testrollen openen." }, 403);
    }
    if (!callerMembership?.active) {
      return respond({ error: "Het testaccount is niet actief gekoppeld aan de testzaak." }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const role = String(payload?.role ?? "").trim().toLowerCase();
    const roleNames: Record<string, string> = {
      owner: "Eigenaar",
      manager: "Manager",
      employee: "Medewerker",
    };
    if (!Object.hasOwn(roleNames, role)) {
      return respond({ error: "Kies Eigenaar, Manager of Medewerker." }, 400);
    }

    const email = `animo-test-${role}@example.invalid`;
    const fullName = `ANIMO test - ${roleNames[role]}`;
    const password = `${crypto.randomUUID()}-${crypto.randomUUID()}-Aa9!`;

    const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;
    let targetUser = (usersPage.users ?? []).find(
      (candidate) => String(candidate.email ?? "").toLowerCase() === email,
    );

    if (!targetUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: {
          animo_test_harness: true,
          animo_test_business_id: TEST_BUSINESS_ID,
          animo_test_role: role,
        },
      });
      if (error) throw error;
      targetUser = data.user;
    } else {
      const { data, error } = await admin.auth.admin.updateUserById(targetUser.id, {
        password,
        user_metadata: { ...(targetUser.user_metadata ?? {}), full_name: fullName },
        app_metadata: {
          ...(targetUser.app_metadata ?? {}),
          animo_test_harness: true,
          animo_test_business_id: TEST_BUSINESS_ID,
          animo_test_role: role,
        },
      });
      if (error) throw error;
      targetUser = data.user;
    }

    const { error: linkError } = await admin
      .from("business_members")
      .upsert(
        { business_id: TEST_BUSINESS_ID, user_id: targetUser.id, role, active: true },
        { onConflict: "business_id,user_id" },
      );
    if (linkError) throw linkError;

    const loginClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: loginData, error: loginError } = await loginClient.auth.signInWithPassword({
      email,
      password,
    });
    if (loginError || !loginData.session) {
      throw loginError ?? new Error("De testaanmelding gaf geen geldige sessie terug.");
    }

    return respond({
      success: true,
      role,
      roleLabel: roleNames[role],
      session: {
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
      },
    });
  } catch (error) {
    console.error("ANIMO testrol wisselen mislukt:", error);
    return respond({
      error: error instanceof Error ? error.message : "De testrol kon niet worden geopend.",
    }, 500);
  }
});
