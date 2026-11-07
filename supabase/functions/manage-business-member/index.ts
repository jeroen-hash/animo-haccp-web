import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_URL =
  (Deno.env.get("APP_URL") ?? "https://app.animo-apps.com/").replace(/\/?$/, "/");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Alleen POST-verzoeken zijn toegestaan." },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "De serverconfiguratie ontbreekt." },
        500,
      );
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Je moet aangemeld zijn." },
        401,
      );
    }

    const accessToken = authorization
      .replace("Bearer ", "")
      .trim();

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      data: { user: requestingUser },
      error: requestingUserError,
    } = await adminClient.auth.getUser(accessToken);

    if (requestingUserError || !requestingUser) {
      return jsonResponse(
        { error: "De aanmelding is ongeldig of verlopen." },
        401,
      );
    }

    const body = await req.json();

    const action = String(body.action ?? "").trim();
    const targetUserId = String(
      body.userId ?? "",
    ).trim();
    const businessId = String(body.businessId ?? "").trim();
    if (!businessId) return jsonResponse({ error: "De actieve horecazaak ontbreekt. Meld opnieuw aan." }, 400);

    if (!targetUserId) {
      return jsonResponse(
        { error: "De gebruiker ontbreekt." },
        400,
      );
    }

    const allowedActions = [
      "update_name",
      "update_role",
      "set_active",
      "remove_membership",
      "send_password_reset",
    ];

    if (!allowedActions.includes(action)) {
      return jsonResponse(
        { error: "Deze beheeractie is niet toegestaan." },
        400,
      );
    }

    const {
      data: requesterMembership,
      error: requesterMembershipError,
    } = await adminClient
      .from("business_members")
      .select("business_id, role, active")
      .eq("user_id", requestingUser.id)
      .eq("business_id", businessId)
      .eq("active", true)
      .maybeSingle();

    if (requesterMembershipError) {
      console.error(
        "Requester membership error:",
        requesterMembershipError,
      );

      return jsonResponse(
        {
          error:
            "De rechten van de aangemelde gebruiker konden niet worden gecontroleerd.",
        },
        500,
      );
    }

    if (!requesterMembership) {
      return jsonResponse(
        { error: "Er is geen actieve zaak gekoppeld." },
        403,
      );
    }
    const { data: accessBusiness, error: accessBusinessError } = await adminClient
      .from("businesses")
      .select("trial_started_at, trial_ends_at, lifetime_free")
      .eq("id", requesterMembership.business_id)
      .maybeSingle();
    if (accessBusinessError) throw accessBusinessError;

    const { data: accessSubscription, error: accessSubscriptionError } = await adminClient
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("business_id", requesterMembership.business_id)
      .maybeSingle();
    if (accessSubscriptionError) throw accessSubscriptionError;

    const now = Date.now();
    const trialAllowed = !!accessBusiness?.trial_started_at &&
      new Date(accessBusiness.trial_started_at).getTime() <= now &&
      !!accessBusiness?.trial_ends_at &&
      new Date(accessBusiness.trial_ends_at).getTime() > now;
    const paidAllowed = accessSubscription?.status === "active" &&
      !!accessSubscription?.current_period_end &&
      new Date(accessSubscription.current_period_end).getTime() > now;

    if (!(accessBusiness?.lifetime_free === true || trialAllowed || paidAllowed)) {
      return jsonResponse(
        { error: "De proefperiode is afgelopen. Activeer eerst een ANIMO HACCP-abonnement." },
        402,
      );
    }


    if (
      !["owner", "manager"].includes(
        requesterMembership.role,
      )
    ) {
      return jsonResponse(
        {
          error:
            "Alleen een eigenaar of manager kan gebruikers beheren.",
        },
        403,
      );
    }

    const {
      data: targetMembership,
      error: targetMembershipError,
    } = await adminClient
      .from("business_members")
      .select("business_id, user_id, role, active")
      .eq(
        "business_id",
        requesterMembership.business_id,
      )
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetMembershipError) {
      console.error(
        "Target membership error:",
        targetMembershipError,
      );

      return jsonResponse(
        {
          error:
            "De geselecteerde gebruiker kon niet worden gecontroleerd.",
        },
        500,
      );
    }

    if (!targetMembership) {
      return jsonResponse(
        {
          error:
            "Deze gebruiker behoort niet tot dezelfde zaak.",
        },
        404,
      );
    }

    if (
      requesterMembership.role === "manager" &&
      targetMembership.role !== "employee"
    ) {
      return jsonResponse(
        {
          error:
            "Een manager kan alleen medewerkers beheren.",
        },
        403,
      );
    }

    if (
      targetMembership.role === "owner" &&
      action !== "send_password_reset" &&
      action !== "update_name"
    ) {
      return jsonResponse(
        {
          error:
            "De eigenaar kan niet worden gedeactiveerd, verwijderd of van rol gewijzigd.",
        },
        403,
      );
    }

    if (
      targetUserId === requestingUser.id &&
      [
        "update_role",
        "set_active",
        "remove_membership",
      ].includes(action)
    ) {
      return jsonResponse(
        {
          error:
            "Je kunt je eigen toegang niet via Beheer wijzigen of verwijderen.",
        },
        403,
      );
    }

    if (action === "update_name") {
      const fullName = String(
        body.fullName ?? "",
      ).trim();

      if (fullName.length < 2 || fullName.length > 100) {
        return jsonResponse(
          { error: "Vul een geldige naam in." },
          400,
        );
      }

      const {
        data: currentTarget,
        error: currentTargetError,
      } = await adminClient.auth.admin.getUserById(
        targetUserId,
      );

      if (
        currentTargetError ||
        !currentTarget.user
      ) {
        return jsonResponse(
          {
            error:
              "Het Auth-account kon niet worden gevonden.",
          },
          404,
        );
      }

      const existingMetadata =
        currentTarget.user.user_metadata ?? {};

      const { error } =
        await adminClient.auth.admin.updateUserById(
          targetUserId,
          {
            user_metadata: {
              ...existingMetadata,
              full_name: fullName,
            },
          },
        );

      if (error) {
        throw error;
      }

      return jsonResponse({
        success: true,
        message: "De naam is aangepast.",
      });
    }

    if (action === "update_role") {
      const newRole = String(
        body.role ?? "",
      ).trim();

      if (!["employee", "manager"].includes(newRole)) {
        return jsonResponse(
          {
            error:
              "De rol moet medewerker of manager zijn.",
          },
          400,
        );
      }

      if (
        requesterMembership.role === "manager" &&
        newRole === "manager"
      ) {
        return jsonResponse(
          {
            error:
              "Alleen een eigenaar kan een manager aanstellen.",
          },
          403,
        );
      }

      const { error } = await adminClient
        .from("business_members")
        .update({ role: newRole })
        .eq(
          "business_id",
          requesterMembership.business_id,
        )
        .eq("user_id", targetUserId);

      if (error) {
        throw error;
      }

      return jsonResponse({
        success: true,
        message: "De rol is aangepast.",
      });
    }

    if (action === "set_active") {
      const active = body.active === true;

      const { error } = await adminClient
        .from("business_members")
        .update({ active })
        .eq(
          "business_id",
          requesterMembership.business_id,
        )
        .eq("user_id", targetUserId);

      if (error) {
        throw error;
      }

      return jsonResponse({
        success: true,
        message: active
          ? "De gebruiker is opnieuw geactiveerd."
          : "De gebruiker is gedeactiveerd.",
      });
    }

    if (action === "remove_membership") {
      const { error } = await adminClient
        .from("business_members")
        .update({ active: false })
        .eq("business_id", requesterMembership.business_id)
        .eq("user_id", targetUserId);

      if (error) throw error;

      return jsonResponse({
        success: true,
        message: "De gebruiker is uit deze zaak verwijderd. Het account blijft bestaan en kan later opnieuw worden uitgenodigd.",
      });
    }

    if (action === "send_password_reset") {
      const {
        data: targetUserData,
        error: targetUserError,
      } = await adminClient.auth.admin.getUserById(
        targetUserId,
      );

      if (
        targetUserError ||
        !targetUserData.user?.email
      ) {
        return jsonResponse(
          {
            error:
              "Voor deze gebruiker werd geen geldig e-mailadres gevonden.",
          },
          404,
        );
      }

      const { error } =
        await adminClient.auth.resetPasswordForEmail(
          targetUserData.user.email,
          {
            redirectTo: APP_URL,
          },
        );

      if (error) {
        throw error;
      }

      return jsonResponse({
        success: true,
        message:
          "De e-mail voor wachtwoordherstel is verstuurd.",
      });
    }

    return jsonResponse(
      { error: "De beheeractie kon niet worden uitgevoerd." },
      400,
    );
  } catch (error) {
    console.error("Manage member error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Er is een onverwachte fout opgetreden.",
      },
      500,
    );
  }
});