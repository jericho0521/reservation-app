-- Atomic report/document publication with optimistic concurrency.
create or replace function public.save_sales_report(
  p_document_id uuid, p_expected_updated_at timestamptz, p_report jsonb, p_document jsonb
) returns jsonb language plpgsql
set search_path = public
as $$
declare
  doc public.sales_report_documents;
  saved public.daily_sales_reports;
  candidate public.daily_sales_reports;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  select * into doc from public.sales_report_documents where id = p_document_id for update;
  if not found or doc.updated_at is distinct from p_expected_updated_at then
    raise exception 'Report changed' using errcode = '40001';
  end if;
  candidate := jsonb_populate_record(null::public.daily_sales_reports,
    jsonb_build_object('id', gen_random_uuid(), 'created_at', now(), 'updated_at', now(),
      'payment_breakdown', '{}'::jsonb, 'validation_warnings', '[]'::jsonb, 'is_published', false)
    || p_report || jsonb_build_object('source_document_id', p_document_id));
  insert into public.daily_sales_reports select candidate.*
    on conflict (source_document_id) do update set
      report_date = excluded.report_date,
      cashier_name = excluded.cashier_name,
      shift_start_at = excluded.shift_start_at,
      shift_end_at = excluded.shift_end_at,
      topup_register_amount = excluded.topup_register_amount,
      freebies = excluded.freebies,
      deducted_amount = excluded.deducted_amount,
      refund_balance = excluded.refund_balance,
      cashier_m_plus = excluded.cashier_m_plus,
      cashier_user_m_plus = excluded.cashier_user_m_plus,
      items_sales = excluded.items_sales,
      user_purchase = excluded.user_purchase,
      free_items = excluded.free_items,
      point_redemption = excluded.point_redemption,
      cash_stock_in = excluded.cash_stock_in,
      received_from_last_shift = excluded.received_from_last_shift,
      reserve_to_next_duty = excluded.reserve_to_next_duty,
      reload_coupon = excluded.reload_coupon,
      card_fee_registered = excluded.card_fee_registered,
      other_expenses = excluded.other_expenses,
      shift_income = excluded.shift_income,
      total_cash = excluded.total_cash,
      off_duty_amount = excluded.off_duty_amount,
      gross_sales = excluded.gross_sales,
      net_sales = excluded.net_sales,
      discounts = excluded.discounts,
      tax = excluded.tax,
      refunds = excluded.refunds,
      transaction_count = excluded.transaction_count,
      payment_breakdown = excluded.payment_breakdown,
      notes = excluded.notes,
      confidence_score = excluded.confidence_score,
      validation_warnings = excluded.validation_warnings,
      is_published = excluded.is_published,
      published_at = excluded.published_at,
      updated_at = clock_timestamp()
    returning * into saved;
  update public.sales_report_documents set
    status = p_document->>'status', confidence_score = (p_document->>'confidence_score')::numeric,
    raw_extraction = case when p_document ? 'raw_extraction' then p_document->'raw_extraction' else raw_extraction end,
    extraction_errors = array(select jsonb_array_elements_text(p_document->'extraction_errors')),
    processed_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_document_id returning * into doc;
  return jsonb_build_object('document', to_jsonb(doc), 'report', to_jsonb(saved));
end;
$$;
revoke all on function public.save_sales_report(uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.save_sales_report(uuid, timestamptz, jsonb, jsonb) to authenticated;
