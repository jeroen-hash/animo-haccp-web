import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.animo-apps.com/").replace(/\/?$/, "/");

 
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
return new Response("ok", { headers: corsHeaders });
}
 
if (req.method !== "POST") {
return jsonResponse(
{ error: "Alleen POST-verzoeken zijn toegestaan." },
405,
);
}
 
try {
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 
if (!supabaseUrl || !serviceRoleKey) {
return jsonResponse(
{ error: "De serverconfiguratie is niet volledig." },
500,
);
}
 
const authorization = req.headers.get("Authorization");
 
if (!authorization?.startsWith("Bearer ")) {
return jsonResponse(
{ error: "Je moet aangemeld zijn om iemand uit te nodigen." },
401,
);
}
 
const accessToken = authorization.replace("Bearer ", "").trim();
 
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
error: userError,
} = await adminClient.auth.getUser(accessToken);
 
if (userError || !requestingUser) {
return jsonResponse(
{ error: "De aanmelding is ongeldig of verlopen." },
401,
);
}
 
const body = await req.json();
 
const email = String(body.email ?? "")
.trim()
.toLowerCase();
 
const fullName = String(body.fullName ?? "")
.trim();
 
const requestedRole = String(body.role ?? "")
.trim()
.toLowerCase();
 
if (!email || !email.includes("@")) {
return jsonResponse(
{ error: "Vul een geldig e-mailadres in." },
400,
);
}
 
if (fullName.length < 2 || fullName.length > 100) {
return jsonResponse(
{ error: "Vul een geldige naam in." },
400,
);
}
 
if (!["employee", "manager"].includes(requestedRole)) {
return jsonResponse(
{
error:
"De gekozen rol moet medewerker of manager zijn.",
},
400,
);
}
 
const {
data: membership,
error: membershipError,
} = await adminClient
.from("business_members")
.select("business_id, role, active")
.eq("user_id", requestingUser.id)
.eq("active", true)
.maybeSingle();
 
if (membershipError) {
console.error("Membership error:", membershipError);
 
return jsonResponse(
{ error: "De toegang tot de zaak kon niet worden gecontroleerd." },
500,
);
}
 
if (!membership) {
return jsonResponse(
{ error: "Er is geen actieve zaak aan dit account gekoppeld." },
403,
);
}
    const { data: accessBusiness, error: accessBusinessError } = await adminClient
      .from("businesses")
      .select("trial_started_at, trial_ends_at, lifetime_free")
      .eq("id", membership.business_id)
      .maybeSingle();
    if (accessBusinessError) throw accessBusinessError;

    const { data: accessSubscription, error: accessSubscriptionError } = await adminClient
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("business_id", membership.business_id)
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

 
if (!["owner", "manager"].includes(membership.role)) {
return jsonResponse(
{
error:
"Alleen een eigenaar of manager kan medewerkers uitnodigen.",
},
403,
);
}
 
if (
membership.role === "manager" &&
requestedRole === "manager"
) {
return jsonResponse(
{
error:
"Alleen de eigenaar kan een nieuwe manager uitnodigen.",
},
403,
);
}
 
const {
data: existingMembership,
error: existingMembershipError,
} = await adminClient
.from("business_members")
.select("user_id, role, active")
.eq("business_id", membership.business_id)
.eq("user_id", requestingUser.id)
.maybeSingle();
 
if (existingMembershipError) {
console.error(
"Existing membership check error:",
existingMembershipError,
);
 
return jsonResponse(
{ error: "De bestaande koppeling kon niet worden gecontroleerd." },
500,
);
}
 
if (!existingMembership?.active) {
return jsonResponse(
{ error: "De uitnodigende gebruiker is niet actief." },
403,
);
}
 
const {
data: inviteData,
error: inviteError,
} = await adminClient.auth.admin.inviteUserByEmail(
email,
{
redirectTo: APP_URL,
data: {
full_name: fullName,
invited_business_id: membership.business_id,
invited_role: requestedRole,
},
},
);
 
let invitedUser = inviteData?.user ?? null;
let existingAccountLinked = false;

if (inviteError || !invitedUser) {
  const message = inviteError?.message ?? "De uitnodiging kon niet worden verstuurd.";
  const alreadyRegistered = /already|registered|exists/i.test(message);

  if (!alreadyRegistered) {
    console.error("Invite error:", inviteError);
    return jsonResponse({ error: message }, 400);
  }

  // Search existing accounts only through the server-side Auth Admin API.
  let page = 1;
  let matchedUser = null;
  while (page <= 100) {
    const { data: usersPage, error: usersError } =
      await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) throw usersError;
    const users = usersPage?.users ?? [];
    matchedUser = users.find((user) =>
      String(user.email ?? "").trim().toLowerCase() === email
    ) ?? null;
    if (matchedUser || users.length < 1000) break;
    page += 1;
  }

  if (!matchedUser) {
    console.error("Existing Auth user could not be found after invite conflict:", message);
    return jsonResponse(
      { error: "Er bestaat al een account met dit e-mailadres, maar het account kon niet veilig worden opgehaald. Neem contact op met support." },
      409,
    );
  }

  invitedUser = matchedUser;
  existingAccountLinked = true;
}

const invitedUserId = invitedUser.id;

const {
error: linkError,
} = await adminClient
.from("business_members")
.upsert(
{
business_id: membership.business_id,
user_id: invitedUserId,
role: requestedRole,
active: true,
},
{
onConflict: "business_id,user_id",
},
);
 
if (linkError) {
console.error("Link error:", linkError);
 
return jsonResponse(
{
error:
"De uitnodiging is aangemaakt, maar de gebruiker kon niet aan de zaak worden gekoppeld.",
},
500,
);
}
 
return jsonResponse({
success: true,
message: existingAccountLinked
    ? "Het bestaande ANIMO HACCP-account is opnieuw aan deze zaak gekoppeld. De gebruiker kan aanmelden met het bestaande e-mailadres en wachtwoord."
    : "De uitnodiging is verstuurd.",
member: {
id: invitedUserId,
email,
fullName,
role: requestedRole,
businessId: membership.business_id,
},
});
} catch (error) {
console.error("Unexpected error:", error);
 
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