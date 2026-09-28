ALTER FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) SECURITY INVOKER;
GRANT INSERT ON public.project_template_requests TO authenticated;
CREATE POLICY "template requests own completed insert" ON public.project_template_requests FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND project_id IS NOT NULL AND public.is_brand_member(brand_id,auth.uid()) AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.brand_id=project_template_requests.brand_id AND p.client_id IS NOT DISTINCT FROM project_template_requests.client_id AND p.name=project_name AND p.owner_id=auth.uid() AND public.can_access_project(p.id,auth.uid())));
CREATE OR REPLACE FUNCTION public.instantiate_project_template_once(_template_id uuid,_brand_id uuid,_client_id uuid,_project_name text,_request_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE _uid uuid:=auth.uid(); _existing public.project_template_requests%ROWTYPE; _new uuid; _normalized text:=trim(_project_name);
BEGIN
 IF _uid IS NULL OR _request_id IS NULL OR NOT public.is_brand_member(_brand_id,_uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(_normalized) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Invalid project name'; END IF;
 IF _client_id IS NOT NULL AND NOT public.can_access_client(_client_id,_uid) THEN RAISE EXCEPTION 'Client out of scope' USING ERRCODE='42501'; END IF;
 SELECT * INTO _existing FROM public.project_template_requests WHERE id=_request_id;
 IF FOUND THEN
  IF _existing.created_by IS DISTINCT FROM _uid OR _existing.template_id IS DISTINCT FROM _template_id OR _existing.brand_id IS DISTINCT FROM _brand_id OR _existing.client_id IS DISTINCT FROM _client_id OR _existing.project_name IS DISTINCT FROM _normalized THEN RAISE EXCEPTION 'Request already used for another project' USING ERRCODE='23505'; END IF;
  IF _existing.project_id IS NOT NULL THEN RETURN _existing.project_id; END IF;
 END IF;
 _new:=public.instantiate_project_template(_template_id,_brand_id,_client_id,_normalized);
 INSERT INTO public.project_template_requests(id,brand_id,template_id,client_id,project_name,created_by,project_id) VALUES(_request_id,_brand_id,_template_id,_client_id,_normalized,_uid,_new);
 RETURN _new;
END $fn$;
REVOKE ALL ON FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) TO authenticated;