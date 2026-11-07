import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedTypes = new Set([
  "application/pdf",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function safeFileName(fileName: string): string {
  return fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
}

serve(async (request: Request) => {
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
    const formData = await request.formData();

    const leadId = String(
      formData.get("lead_id") || ""
    ).trim();

    const uploadToken = String(
      formData.get("upload_token") || ""
    ).trim();

    const file = formData.get("file");

    if (!leadId || !uploadToken) {
      return jsonResponse(
        {
          error: "De aanvraaggegevens ontbreken.",
        },
        400
      );
    }

    if (!(file instanceof File)) {
      return jsonResponse(
        {
          error: "Er werd geen geldig bestand ontvangen.",
        },
        400
      );
    }

    if (file.size === 0) {
      return jsonResponse(
        {
          error: "Het bestand is leeg.",
        },
        400
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return jsonResponse(
        {
          error: "Het bestand is groter dan 10 MB.",
        },
        400
      );
    }

    if (!allowedTypes.has(file.type)) {
      return jsonResponse(
        {
          error: "Dit bestandstype is niet toegestaan.",
        },
        400
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "De vereiste Supabase-servervariabelen ontbreken."
      );

      return jsonResponse(
        {
          error: "De serverconfiguratie is onvolledig.",
        },
        500
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: lead, error: leadError } = await supabase
      .from("onboarding_leads")
      .select("id, documents, status, business_id")
      .eq("id", leadId)
      .eq("upload_token", uploadToken)
      .single();

    if (leadError || !lead) {
      console.error(
        "Aanvraag of uploadtoken niet gevonden:",
        leadError
      );

      return jsonResponse(
        {
          error:
            "De aanvraag werd niet gevonden of de uploadtoegang is ongeldig.",
        },
        404
      );
    }

    // Uploads are only accepted while the public application is still new.
    // Once a platform admin starts reviewing or converts it, the token is closed.
    if (lead.status !== "new" || lead.business_id !== null) {
      return jsonResponse(
        {
          error:
            "Documenten toevoegen is niet meer mogelijk omdat deze aanvraag al in behandeling is.",
        },
        409
      );
    }

    const storedFileName =
      `${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const storagePath =
      `${leadId}/${storedFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("onboarding-lead-documents")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Opslagfout:", uploadError);

      return jsonResponse(
        {
          error: "Het bestand kon niet worden opgeslagen.",
        },
        500
      );
    }

    const documentInformation = {
      name: file.name,
      path: storagePath,
      size: file.size,
      type: file.type,
      uploaded_at: new Date().toISOString(),
    };

    const existingDocuments = Array.isArray(lead.documents)
      ? lead.documents
      : [];

    const { data: updateResult, error: updateError } = await supabase
      .from("onboarding_leads")
      .update({
        documents: [
          ...existingDocuments,
          documentInformation,
        ],
      })
      .eq("id", leadId)
      .eq("upload_token", uploadToken)
      .eq("status", "new")
      .is("business_id", null)
      .select("id")
      .maybeSingle();

    if (updateError || !updateResult?.id) {
      console.error(
        "Documentkoppeling kon niet worden opgeslagen:",
        updateError
      );

      await supabase.storage
        .from("onboarding-lead-documents")
        .remove([storagePath]);

      return jsonResponse(
        {
          error:
            "Het bestand kon niet aan de aanvraag worden gekoppeld.",
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      document: documentInformation,
    });
  } catch (error) {
    console.error(
      "Onverwachte fout tijdens documentupload:",
      error
    );

    return jsonResponse(
      {
        error: "Het uploaden is niet gelukt.",
      },
      500
    );
  }
});