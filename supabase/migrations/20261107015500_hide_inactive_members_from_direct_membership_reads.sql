-- Active members may only read active membership rows for their business.
-- This keeps deactivated staff identifiers out of direct Data API reads as well as the team RPC.
DROP POLICY IF EXISTS "members read memberships" ON public.business_members;
CREATE POLICY "members read memberships"
ON public.business_members
FOR SELECT
TO authenticated
USING (
  active IS TRUE
  AND public.is_business_member(business_id)
);
