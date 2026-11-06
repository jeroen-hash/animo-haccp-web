import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.animo-apps.com/").replace(/\/?$/, "/");

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(request) {
  const authorization =
    request.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

function safeFileName(fileName) {
  return String(fileName || "document")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
}

async function findUserByEmail(adminClient, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } =
      await adminClient.auth.admin.listUsers({
        page,
        perPage: 100,
      });

    if (error) {
      throw error;
    }

    const user = data.users.find(
      (item) =>
        String(item.email || "").toLowerCase() ===
        email.toLowerCase()
    );

    if (user) {
      return user;
    }

    if (data.users.length < 100) {
      break;
    }
  }

  return null;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Alleen POST-aanvragen zijn toegestaan.",
      },
      405
    );
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !anonKey
    ) {
      return jsonResponse(
        {
          error:
            "De Supabase-serverconfiguratie is onvolledig.",
        },
        500
      );
    }

    const accessToken =
      getBearerToken(request);

    if (!accessToken) {
      return jsonResponse(
        {
          error:
            "Je moet als platformbeheerder aangemeld zijn.",
        },
        401
      );
    }

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const actingClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: authenticatedUser,
      error: authenticationError,
    } = await actingClient.auth.getUser(
      accessToken
    );

    if (
      authenticationError ||
      !authenticatedUser.user
    ) {
      console.error(
        "Authenticatiefout:",
        authenticationError
      );

      return jsonResponse(
        {
          error:
            "De beheerderssessie is ongeldig of verlopen.",
        },
        401
      );
    }

    const platformAdminUser =
      authenticatedUser.user;

    const {
      data: platformAdmin,
      error: platformAdminError,
    } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq(
        "user_id",
        platformAdminUser.id
      )
      .maybeSingle();

    if (platformAdminError) {
      console.error(
        "Controle platformbeheerder mislukt:",
        platformAdminError
      );

      return jsonResponse(
        {
          error:
            "De beheerdersrechten konden niet worden gecontroleerd.",
        },
        500
      );
    }

    if (!platformAdmin) {
      return jsonResponse(
        {
          error:
            "Alleen een platformbeheerder mag een aanvraag activeren.",
        },
        403
      );
    }

    let requestBody;

    try {
      requestBody = await request.json();
    } catch {
      return jsonResponse(
        {
          error:
            "De aanvraag bevat geen geldige JSON.",
        },
        400
      );
    }

    const leadId =
      typeof requestBody.lead_id === "string"
        ? requestBody.lead_id.trim()
        : "";

    if (!leadId) {
      return jsonResponse(
        {
          error:
            "De aanvraag-ID ontbreekt.",
        },
        400
      );
    }

    const {
      data: lead,
      error: leadError,
    } = await adminClient
      .from("onboarding_leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      console.error(
        "Aanvraag niet gevonden:",
        leadError
      );

      return jsonResponse(
        {
          error:
            "De onboardingaanvraag is niet gevonden.",
        },
        404
      );
    }

    const allowedStatuses = [
      "in_review",
      "approved",
      "activated",
    ];

    if (
      !allowedStatuses.includes(lead.status)
    ) {
      return jsonResponse(
        {
          error:
            "Plaats de aanvraag eerst in beoordeling of keur de aanvraag goed.",
        },
        400
      );
    }

    /*
     * Als deze aanvraag al werd omgezet,
     * gebruiken we de bestaande onboarding.
     */
    if (
      lead.converted_intake_id &&
      lead.business_id
    ) {
      const {
        data: repeatedActivation,
        error: repeatedActivationError,
      } = await actingClient.rpc(
        "activate_platform_onboarding_complete",
        {
          p_intake_id:
            lead.converted_intake_id,
        }
      );

      if (repeatedActivationError) {
        console.error(
          "Herhaalde activatie mislukt:",
          repeatedActivationError
        );

        return jsonResponse(
          {
            error:
              repeatedActivationError.message ||
              "De bestaande onboarding kon niet opnieuw worden geactiveerd.",
          },
          500
        );
      }

      await adminClient
        .from("onboarding_leads")
        .update({
          status: "activated",
          activated_at:
            new Date().toISOString(),
        })
        .eq("id", lead.id);

      return jsonResponse({
        ok: true,
        repeated: true,
        business_id: lead.business_id,
        intake_id:
          lead.converted_intake_id,
        activation: repeatedActivation,
      });
    }

    const contactEmail = String(
      lead.contact_email || ""
    )
      .trim()
      .toLowerCase();

    const contactName = String(
      lead.contact_name || ""
    ).trim();

    const businessName = String(
      lead.business_name || ""
    ).trim();

    const enterpriseNumber =
      String(
        lead.enterprise_number || ""
      ).trim() ||
      `LEAD-${String(lead.id)
        .slice(0, 8)
        .toUpperCase()}`;

    if (!contactEmail) {
      return jsonResponse(
        {
          error:
            "De aanvraag bevat geen e-mailadres.",
        },
        400
      );
    }

    if (!businessName) {
      return jsonResponse(
        {
          error:
            "De aanvraag bevat geen naam van de horecazaak.",
        },
        400
      );
    }

    /*
     * Controleer of het ondernemingsnummer
     * al bij een zaak bestaat.
     */
    const {
      data: existingBusiness,
      error: existingBusinessError,
    } = await adminClient
      .from("businesses")
      .select("id, name")
      .eq(
        "enterprise_number",
        enterpriseNumber
      )
      .maybeSingle();

    if (existingBusinessError) {
      throw existingBusinessError;
    }

    if (existingBusiness) {
      return jsonResponse(
        {
          error:
            "Dit ondernemingsnummer is al geregistreerd bij een bestaande zaak.",
        },
        409
      );
    }

    /*
     * Zoek of de toekomstige eigenaar
     * al een Supabase-account heeft.
     */
    let ownerUser = await findUserByEmail(
      adminClient,
      contactEmail
    );

    let invitationSent = false;

    /*
     * Als de gebruiker niet bestaat,
     * versturen we een uitnodiging.
     */
    if (!ownerUser) {
      const {
        data: invitationData,
        error: invitationError,
      } =
        await adminClient.auth.admin.inviteUserByEmail(
          contactEmail,
          {
            redirectTo: APP_URL,
            data: {
              full_name: contactName,
              onboarding_lead_id:
                lead.id,
            },
          }
        );

      if (
        invitationError ||
        !invitationData.user
      ) {
        console.error(
          "Uitnodiging mislukt:",
          invitationError
        );

        return jsonResponse(
          {
            error:
              invitationError?.message ||
              "De klantuitnodiging kon niet worden verstuurd.",
          },
          500
        );
      }

      ownerUser =
        invitationData.user;

      invitationSent = true;
    }

    /*
     * Controleer of de eigenaar al aan
     * een actieve zaak gekoppeld is.
     */
    const {
      data: existingMemberships,
      error: membershipError,
    } = await adminClient
      .from("business_members")
      .select("business_id")
      .eq("user_id", ownerUser.id)
      .eq("active", true);

    if (membershipError) {
      throw membershipError;
    }

    if (
      Array.isArray(existingMemberships) &&
      existingMemberships.length > 0
    ) {
      return jsonResponse(
        {
          error:
            "Dit e-mailadres is al aan een actieve zaak gekoppeld. Gebruik voor de test een ander e-mailadres.",
        },
        409
      );
    }

    /*
     * Maak de nieuwe zaak aan.
     */
    const {
      data: business,
      error: businessError,
    } = await adminClient
      .from("businesses")
      .insert({
        name: businessName,
        enterprise_number:
          enterpriseNumber,
        owner_user_id: ownerUser.id,
      })
      .select("id")
      .single();

    if (businessError || !business) {
      console.error(
        "Zaak aanmaken mislukt:",
        businessError
      );

      return jsonResponse(
        {
          error:
            businessError?.message ||
            "De horecazaak kon niet worden aangemaakt.",
        },
        500
      );
    }

    /*
     * Koppel de eigenaar aan de zaak.
     */
    const {
      error: memberInsertError,
    } = await adminClient
      .from("business_members")
      .insert({
        business_id: business.id,
        user_id: ownerUser.id,
        role: "owner",
        active: true,
      });

    if (memberInsertError) {
      console.error(
        "Eigenaar koppelen mislukt:",
        memberInsertError
      );

      throw memberInsertError;
    }

    /*
     * Kopieer documenten naar de
     * bestaande klantbucket.
     */
    const originalDocuments =
      Array.isArray(lead.documents)
        ? lead.documents
        : [];

    const convertedDocuments = [];
    const documentWarnings = [];

    for (
      const document of originalDocuments
    ) {
      const sourcePath =
        document &&
        typeof document.path === "string"
          ? document.path
          : "";

      if (!sourcePath) {
        continue;
      }

      try {
        const {
          data: downloadedFile,
          error: downloadError,
        } = await adminClient.storage
          .from(
            "onboarding-lead-documents"
          )
          .download(sourcePath);

        if (
          downloadError ||
          !downloadedFile
        ) {
          throw (
            downloadError ||
            new Error(
              "Het document kon niet worden gedownload."
            )
          );
        }

        const originalFileName =
          String(
            document.name ||
              sourcePath
                .split("/")
                .pop() ||
              "document"
          );

        const targetPath =
          `${business.id}/` +
          `${crypto.randomUUID()}-` +
          safeFileName(originalFileName);

        const contentType =
          String(
            document.type ||
              downloadedFile.type ||
              "application/octet-stream"
          );

        const {
          error: documentUploadError,
        } = await adminClient.storage
          .from("onboarding-documents")
          .upload(
            targetPath,
            downloadedFile,
            {
              contentType,
              upsert: false,
            }
          );

        if (documentUploadError) {
          throw documentUploadError;
        }

        convertedDocuments.push({
          ...document,
          path: targetPath,
          source_path: sourcePath,
        });
      } catch (documentError) {
        console.error(
          "Documentconversie mislukt:",
          documentError
        );

        documentWarnings.push(
          `${sourcePath}: ${
            documentError instanceof Error
              ? documentError.message
              : String(documentError)
          }`
        );
      }
    }

    /*
     * Neem de publieke aanvraag en de
     * voorbereide inrichting over.
     */
    const leadPayload =
      lead.payload &&
      typeof lead.payload === "object" &&
      !Array.isArray(lead.payload)
        ? lead.payload
        : {};

    const intakePayload = {
      ...leadPayload,
      documents: convertedDocuments,
      public_lead_id: lead.id,
      contact: {
        name: contactName,
        email: contactEmail,
        phone:
          lead.contact_phone || null,
      },
    };

    /*
     * Maak de echte onboarding aan.
     */
    const {
      data: intake,
      error: intakeError,
    } = await adminClient
      .from("onboarding_intakes")
      .insert({
        business_id: business.id,
        created_by: ownerUser.id,
        status: "approved",
        payload: intakePayload,
        review_notes:
          leadPayload.review_notes ||
          null,
        reviewed_by:
          platformAdminUser.id,
        reviewed_at:
          new Date().toISOString(),
        submitted_at:
          lead.submitted_at ||
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      })
      .select("id")
      .single();

    if (intakeError || !intake) {
      console.error(
        "Klantonboarding maken mislukt:",
        intakeError
      );

      throw (
        intakeError ||
        new Error(
          "De klantonboarding kon niet worden aangemaakt."
        )
      );
    }

    /*
     * Koppel de lead aan de zaak en
     * de echte onboarding.
     */
    const {
      error: leadConversionError,
    } = await adminClient
      .from("onboarding_leads")
      .update({
        business_id: business.id,
        converted_intake_id:
          intake.id,
        status: "approved",
        reviewed_at:
          lead.reviewed_at ||
          new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (leadConversionError) {
      throw leadConversionError;
    }

    /*
     * Activeer de bestaande onboarding.
     * Deze RPC verwerkt de voorbereiding.
     */
    const {
      data: activationResult,
      error: activationError,
    } = await actingClient.rpc(
      "activate_platform_onboarding_complete",
      {
        p_intake_id: intake.id,
      }
    );

    if (activationError) {
      console.error(
        "Volledige activatie mislukt:",
        activationError
      );

      /*
       * De zaak en intake zijn al gemaakt.
       * De volgende poging gebruikt daarom
       * converted_intake_id en maakt geen
       * tweede zaak aan.
       */
      return jsonResponse(
        {
          error:
            activationError.message ||
            "De klant werd aangemaakt, maar de voorbereide inrichting kon niet worden geactiveerd.",
          partial: true,
          business_id: business.id,
          intake_id: intake.id,
        },
        500
      );
    }

    /*
     * Zet de publieke aanvraag op
     * definitief geactiveerd.
     */
    const {
      error: finalLeadError,
    } = await adminClient
      .from("onboarding_leads")
      .update({
        status: "activated",
        activated_at:
          new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (finalLeadError) {
      console.error(
        "Leadstatus bijwerken mislukt:",
        finalLeadError
      );

      return jsonResponse(
        {
          error:
            "De klantomgeving is geactiveerd, maar de status van de aanvraag kon niet worden bijgewerkt.",
          partial: true,
          business_id: business.id,
          intake_id: intake.id,
          activation: activationResult,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      business_id: business.id,
      intake_id: intake.id,
      owner_user_id: ownerUser.id,
      invitation_sent:
        invitationSent,
      documents_copied:
        convertedDocuments.length,
      document_warnings:
        documentWarnings,
      activation:
        activationResult,
    });
  } catch (error) {
    console.error(
      "Activatiefout:",
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "De aanvraag kon niet worden geactiveerd.",
      },
      500
    );
  }
});