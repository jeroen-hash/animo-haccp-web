-- Keep onboarding document storage behind the same active-membership and subscription gate as business data.
-- Platform administrators retain access for onboarding support.
DROP POLICY IF EXISTS "onboarding documents select" ON storage.objects;
CREATE POLICY "onboarding documents select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'onboarding-documents'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id::text = (storage.foldername(objects.name))[1]
        AND bm.user_id = (SELECT auth.uid())
        AND bm.active IS TRUE
        AND private.can_access_business(bm.business_id)
    )
  )
);

DROP POLICY IF EXISTS "onboarding documents insert" ON storage.objects;
CREATE POLICY "onboarding documents insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'onboarding-documents'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id::text = (storage.foldername(objects.name))[1]
        AND bm.user_id = (SELECT auth.uid())
        AND bm.active IS TRUE
        AND private.can_access_business(bm.business_id)
    )
  )
);

DROP POLICY IF EXISTS "onboarding documents update" ON storage.objects;
CREATE POLICY "onboarding documents update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'onboarding-documents'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id::text = (storage.foldername(objects.name))[1]
        AND bm.user_id = (SELECT auth.uid())
        AND bm.active IS TRUE
        AND private.can_access_business(bm.business_id)
    )
  )
)
WITH CHECK (
  bucket_id = 'onboarding-documents'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id::text = (storage.foldername(objects.name))[1]
        AND bm.user_id = (SELECT auth.uid())
        AND bm.active IS TRUE
        AND private.can_access_business(bm.business_id)
    )
  )
);

DROP POLICY IF EXISTS "onboarding documents delete" ON storage.objects;
CREATE POLICY "onboarding documents delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'onboarding-documents'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id::text = (storage.foldername(objects.name))[1]
        AND bm.user_id = (SELECT auth.uid())
        AND bm.active IS TRUE
        AND private.can_access_business(bm.business_id)
    )
  )
);
