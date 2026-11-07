import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_URL = "https://app.animo-apps.com/";

import { withSupabase } from "jsr:@supabase/server@^1";

interface RequestPayload {
  intake_id: string;
}

interface PreparedUser {
  name?: string;
  email?: string;
  role?: string;
}

export default {
  fetch: withSupabase(
    {
      auth: "user",
    },
    async (req, ctx) => {
      try {
        const { intake_id }: RequestPayload = await req.json();

        if (!intake_id) {
          return Response.json(
            { error: "Onboarding-ID ontbreekt." },
            { status: 400 }
          );
        }

        const admin = ctx.supabaseAdmin;
        const callerId = ctx.userClaims?.id;

        if (!callerId) {
          return Response.json(
            { error: "Geen geldige beheerderssessie gevonden." },
            { status: 401 }
          );
        }

        // Controleren of de aangemelde gebruiker platformbeheerder is
        const { data: platformAdmin, error: platformAdminError } =
          await admin
            .from("platform_admins")
            .select("user_id")
            .eq("user_id", callerId)
            .maybeSingle();

        if (platformAdminError) {
          throw platformAdminError;
        }

        if (!platformAdmin) {
          return Response.json(
            {
              error:
                "Alleen platformbeheerders mogen onboardinggebruikers uitnodigen.",
            },
            { status: 403 }
          );
        }

        // Onboarding en voorbereide gebruikers ophalen
        const { data: intake, error: intakeError } = await admin
          .from("onboarding_intakes")
          .select("id, business_id, payload")
          .eq("id", intake_id)
          .single();

        if (intakeError) {
          throw intakeError;
        }

        if (!intake?.business_id) {
          return Response.json(
            { error: "Deze onboarding is nog niet aan een zaak gekoppeld." },
            { status: 400 }
          );
        }

        const users: PreparedUser[] = Array.isArray(
          intake.payload?.prepared_setup?.users
        )
          ? intake.payload.prepared_setup.users
          : [];

        if (!users.length) {
          return Response.json(
            {
              error:
                "Er staan geen voorbereide gebruikers in deze onboarding.",
            },
            { status: 400 }
          );
        }

        const result = {
          invited: 0,
          linked: 0,
          existing: 0,
          failed: [] as Array<{
            email: string;
            error: string;
          }>,
        };

        for (const preparedUser of users) {
          const email = String(preparedUser.email || "")
            .trim()
            .toLowerCase();

          const fullName =
            String(preparedUser.name || "").trim() || email;

          const role =
            String(preparedUser.role || "").trim().toLowerCase() ===
            "manager"
              ? "manager"
              : "employee";

          if (!email) {
            result.failed.push({
              email: "(geen e-mailadres)",
              error: "Het e-mailadres ontbreekt.",
            });

            continue;
          }

          try {
            let authUser = null;
            let page = 1;

            // Eerst controleren of het account al bestaat
            while (!authUser) {
              const { data: listedUsers, error: listError } =
                await admin.auth.admin.listUsers({
                  page,
                  perPage: 1000,
                });

              if (listError) {
                throw listError;
              }

              authUser =
                listedUsers.users.find(
                  (user) =>
                    user.email?.trim().toLowerCase() === email
                ) || null;

              if (authUser || listedUsers.users.length < 1000) {
                break;
              }

              page += 1;
            }

            // Alleen uitnodigen wanneer het account nog niet bestaat
            if (!authUser) {
              const { data: invitation, error: invitationError } =
                await admin.auth.admin.inviteUserByEmail(email, {
                  redirectTo: APP_URL,
data: {
                    full_name: fullName,
                  },
                });

              if (invitationError) {
                throw invitationError;
              }

              authUser = invitation.user;
              result.invited += 1;
            } else {
              result.existing += 1;
            }

            if (!authUser?.id) {
              throw new Error(
                "Het gebruikersaccount kon niet worden aangemaakt of gevonden."
              );
            }

            // Gebruiker aan de juiste horecazaak koppelen
            const { error: membershipError } = await admin
              .from("business_members")
              .upsert(
                {
                  business_id: intake.business_id,
                  user_id: authUser.id,
                  role,
                  active: true,
                },
                {
                  onConflict: "business_id,user_id",
                }
              );

            if (membershipError) {
              throw membershipError;
            }

            result.linked += 1;
          } catch (userError) {
            result.failed.push({
              email,
              error:
                userError instanceof Error
                  ? userError.message
                  : String(userError),
            });
          }
        }

        // Auditregistratie, zonder de uitnodiging te laten mislukken
        try {
          await admin.from("audit_log").insert({
            business_id: intake.business_id,
            user_id: callerId,
            module: "onboarding",
            action: "users_invited",
            details:
              `${result.invited} uitnodiging(en) verstuurd; ` +
              `${result.existing} bestaand(e) account(s); ` +
              `${result.linked} gebruiker(s) gekoppeld; ` +
              `${result.failed.length} mislukt.`,
          });
        } catch (auditError) {
          console.error("Auditregistratie mislukt:", auditError);
        }

        return Response.json({
          success: result.failed.length === 0,
          ...result,
        });
      } catch (error) {
        console.error("Onboardinggebruikers uitnodigen mislukt:", error);

        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          { status: 400 }
        );
      }
    }
  ),
};