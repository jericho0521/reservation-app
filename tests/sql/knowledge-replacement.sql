insert into public.knowledge_chunks (content, embedding) values ('original', array_fill(0.1::real, array[768])::vector);
do $$
begin
  begin
    perform public.replace_knowledge_chunks('[{"content":"invalid","embedding":[1,2]}]'::jsonb);
    raise exception 'Expected dimension validation failure';
  exception when data_exception then null;
  end;
  if (select count(*) from public.knowledge_chunks where content = 'original') <> 1 then
    raise exception 'Failed replacement destroyed original knowledge';
  end if;
  perform public.replace_knowledge_chunks(jsonb_build_array(jsonb_build_object('content', 'replacement', 'embedding', array_fill(0.2::real, array[768]))));
  if (select count(*) from public.knowledge_chunks) <> 1 or not exists (select 1 from public.knowledge_chunks where content = 'replacement') then
    raise exception 'Replacement failed';
  end if;
  if has_function_privilege('anon', 'public.replace_knowledge_chunks(jsonb)', 'execute') then
    raise exception 'Anonymous replacement must be denied';
  end if;
end;
$$;
