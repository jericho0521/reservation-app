set test.is_admin = 'true';
do $$
declare doc_id uuid := gen_random_uuid(); original_version timestamptz; result jsonb;
begin
  insert into public.sales_report_documents (id, file_name, file_type, file_size, storage_path)
    values (doc_id, 'test.pdf', 'application/pdf', 1, doc_id::text) returning updated_at into original_version;
  begin
    perform public.save_sales_report(doc_id, original_version,
      '{"report_date":"2026-09-08","net_sales":100}', '{"status":"invalid"}');
    raise exception 'Expected invalid document status to fail';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.daily_sales_reports where source_document_id = doc_id) then
    raise exception 'Report write survived failed document update';
  end if;
  result := public.save_sales_report(doc_id, original_version,
    '{"report_date":"2026-09-08","net_sales":100}', '{"status":"needs_review"}');
  if result->'report'->>'net_sales' <> '100.00' then raise exception 'Report missing'; end if;
  begin
    perform public.save_sales_report(doc_id, original_version,
      '{"report_date":"2026-09-08","net_sales":200}', '{"status":"needs_review"}');
    raise exception 'Expected stale version rejection';
  exception when serialization_failure then null;
  end;
  if (select net_sales from public.daily_sales_reports where source_document_id = doc_id) <> 100 then
    raise exception 'Stale write changed financial data';
  end if;
  perform set_config('test.is_admin', 'false', true);
  begin
    perform public.save_sales_report(doc_id, original_version, '{}', '{}');
    raise exception 'Expected non-admin rejection';
  exception when insufficient_privilege then null;
  end;
end;
$$;
