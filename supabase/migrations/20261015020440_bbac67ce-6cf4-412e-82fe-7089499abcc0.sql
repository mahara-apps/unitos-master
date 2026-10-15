CREATE OR REPLACE FUNCTION public.production_stages_snapshot(_brand uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
 'template',(SELECT stages FROM public.production_stage_defaults WHERE brand_id=_brand),
 'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(btrim(name),''),'Cliente sem nome')) ORDER BY id) FROM public.clients WHERE brand_id=_brand),'[]'::jsonb),
 'pipelines',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.content_pipelines p JOIN public.clients c ON c.id=p.client_id AND c.brand_id=_brand WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL),'[]'::jsonb),
 'stages',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.content_pipeline_stages s JOIN public.content_pipelines p ON p.id=s.pipeline_id JOIN public.clients c ON c.id=p.client_id AND c.brand_id=_brand WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL),'[]'::jsonb),
 'posts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'pipeline_id',x.pipeline_id,'stage_id',x.stage_id,'deleted_at',x.deleted_at) ORDER BY x.id) FROM public.posts x JOIN public.content_pipelines p ON p.id=x.pipeline_id JOIN public.clients c ON c.id=p.client_id AND c.brand_id=_brand WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL),'[]'::jsonb),
 'ignored',(SELECT count(*) FROM public.content_pipelines p WHERE p.brand_id=_brand AND p.is_default AND p.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=p.client_id AND c.brand_id=_brand)));
$$;
REVOKE ALL ON FUNCTION public.production_stages_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.production_stages_snapshot(uuid) TO service_role;