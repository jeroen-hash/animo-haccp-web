-- Restrict data rows that contain employee-related financial snapshots or sensitive audit details.
DROP POLICY IF EXISTS "food waste members read permitted entries" ON public.food_waste_entries;
CREATE POLICY "food waste owners managers read entries"
ON public.food_waste_entries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id=food_waste_entries.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE
      AND bm.role IN ('owner','manager') AND private.can_access_business(bm.business_id)
  )
);

DROP POLICY IF EXISTS "ANIMO subscribed members read audit log" ON public.audit_log;
CREATE POLICY "ANIMO owners and managers read audit log"
ON public.audit_log
FOR SELECT TO authenticated
USING (
  private.can_access_business(business_id)
  AND EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id=audit_log.business_id
      AND bm.user_id=(SELECT auth.uid()) AND bm.active IS TRUE
      AND bm.role IN ('owner','manager')
  )
);
