ALTER FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_project_template(uuid,uuid,text,text,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.archive_project_template(_brand_id uuid, _template_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid;
BEGIN
 IF _uid IS NULL OR NOT public.is_brand_member(_brand_id,_uid) OR public.app_access_role(_uid,_brand_id) NOT IN ('super_admin','admin','manager','user') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.project_templates t SET archived_at=now() WHERE t.id=_template_id AND t.brand_id=_brand_id AND NOT t.is_system AND t.archived_at IS NULL AND (t.source_client_id IS NULL OR public.can_access_client(t.source_client_id,_uid)) RETURNING t.id INTO _id;
 IF _id IS NULL THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='42501'; END IF;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.archive_project_template(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_project_template(uuid,uuid) TO authenticated;