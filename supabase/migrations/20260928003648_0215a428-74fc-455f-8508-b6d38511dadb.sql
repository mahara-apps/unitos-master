CREATE TABLE public.project_template_requests (
  id uuid PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  template_id uuid NOT NULL REFERENCES public.project_templates(id),
  client_id uuid REFERENCES public.clients(id),
  project_name text NOT NULL,
  created_by uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.project_template_requests TO authenticated;
GRANT ALL ON public.project_template_requests TO service_role;
ALTER TABLE public.project_template_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "template requests own read" ON public.project_template_requests FOR SELECT TO authenticated USING (created_by=auth.uid() AND public.is_brand_member(brand_id,auth.uid()));
CREATE POLICY "template requests own insert" ON public.project_template_requests FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid() AND project_id IS NULL AND public.is_brand_member(brand_id,auth.uid()) AND (client_id IS NULL OR public.can_access_client(client_id,auth.uid())));
CREATE POLICY "template requests own update" ON public.project_template_requests FOR UPDATE TO authenticated USING (created_by=auth.uid() AND public.is_brand_member(brand_id,auth.uid())) WITH CHECK (created_by=auth.uid() AND public.is_brand_member(brand_id,auth.uid()) AND (client_id IS NULL OR public.can_access_client(client_id,auth.uid())));
CREATE OR REPLACE FUNCTION public.instantiate_project_template_once(_template_id uuid,_brand_id uuid,_client_id uuid,_project_name text,_request_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _existing public.project_template_requests%ROWTYPE; _new uuid; _normalized text:=trim(_project_name);
BEGIN
 IF _uid IS NULL OR _request_id IS NULL OR NOT public.is_brand_member(_brand_id,_uid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF length(_normalized) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Invalid project name'; END IF;
 IF _client_id IS NOT NULL AND NOT public.can_access_client(_client_id,_uid) THEN RAISE EXCEPTION 'Client out of scope' USING ERRCODE='42501'; END IF;
 SELECT * INTO _existing FROM public.project_template_requests WHERE id=_request_id FOR UPDATE;
 IF FOUND THEN
  IF _existing.created_by IS DISTINCT FROM _uid OR _existing.template_id IS DISTINCT FROM _template_id OR _existing.brand_id IS DISTINCT FROM _brand_id OR _existing.client_id IS DISTINCT FROM _client_id OR _existing.project_name IS DISTINCT FROM _normalized THEN RAISE EXCEPTION 'Request already used for another project' USING ERRCODE='23505'; END IF;
  IF _existing.project_id IS NOT NULL THEN RETURN _existing.project_id; END IF;
 ELSE
  INSERT INTO public.project_template_requests(id,brand_id,template_id,client_id,project_name,created_by) VALUES(_request_id,_brand_id,_template_id,_client_id,_normalized,_uid);
 END IF;
 _new:=public.instantiate_project_template(_template_id,_brand_id,_client_id,_normalized);
 UPDATE public.project_template_requests SET project_id=_new,updated_at=now() WHERE id=_request_id AND created_by=_uid;
 RETURN _new;
END $$;
REVOKE ALL ON FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) TO authenticated;