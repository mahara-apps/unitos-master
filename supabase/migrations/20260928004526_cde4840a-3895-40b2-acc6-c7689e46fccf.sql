REVOKE INSERT, UPDATE ON public.project_template_requests FROM authenticated;
DROP POLICY IF EXISTS "template requests own insert" ON public.project_template_requests;
DROP POLICY IF EXISTS "template requests own update" ON public.project_template_requests;
ALTER FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.instantiate_project_template_once(uuid,uuid,uuid,text,uuid) TO authenticated;