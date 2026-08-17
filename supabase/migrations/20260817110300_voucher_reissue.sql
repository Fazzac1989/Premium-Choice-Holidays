-- Premium Staycations — Phase 1
-- 18. Voucher reissue
--
-- "Operators write to vouchers, reissue only" cannot be expressed as a policy.
-- A policy grants UPDATE on rows, not UPDATE of one narrow kind — an operator
-- with the right to reissue would also have the right to change validity dates
-- or blank a code.
--
-- So operators get no write grant on vouchers at all, and this function is the
-- only way in. Reissue supersedes rather than mutates: the original row stays,
-- so a disputed redemption can still be traced.

create or replace function reissue_voucher(
  p_voucher_id uuid,
  p_reason     text default null
)
returns vouchers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old vouchers;
  v_new vouchers;
  v_booking_status booking_status;
begin
  if not is_staff() then
    raise exception 'Only staff may reissue a voucher'
      using errcode = '42501';
  end if;

  select * into v_old from vouchers where id = p_voucher_id;
  if not found then
    raise exception 'No voucher %', p_voucher_id using errcode = 'P0002';
  end if;

  if v_old.superseded_at is not null then
    raise exception
      'Voucher % has already been superseded — reissue the current one', v_old.code
      using errcode = '23514';
  end if;

  if v_old.redeemed_at is not null then
    raise exception
      'Voucher % was redeemed on % and cannot be reissued',
      v_old.code, v_old.redeemed_at
      using errcode = '23514',
            hint = 'Raise a task if the supplier disputes the redemption.';
  end if;

  select status into v_booking_status from bookings where id = v_old.booking_id;
  if v_booking_status not in ('confirmed', 'travelling', 'completed') then
    raise exception
      'Booking is % — vouchers only exist for confirmed bookings', v_booking_status
      using errcode = '23514';
  end if;

  -- Supersede, then issue. Both or neither: the confirmation guard counts
  -- unsuperseded vouchers, so a half-done reissue would leave the booking
  -- looking unvouchered.
  update vouchers
  set superseded_at = now()
  where id = v_old.id;

  insert into vouchers
    (booking_id, product_id, quote_item_id, redemption_method,
     valid_from, valid_to, reissued_from)
  values
    (v_old.booking_id, v_old.product_id, v_old.quote_item_id, v_old.redemption_method,
     v_old.valid_from, v_old.valid_to, v_old.id)
  returning * into v_new;

  insert into agent_actions
    (agent, action, entity_type, entity_id, input, output, reasoning, autonomous)
  values
    ('human:staff', 'reissue_voucher', 'vouchers', v_old.id,
     jsonb_build_object('superseded_code', v_old.code, 'reason', p_reason),
     jsonb_build_object('new_code', v_new.code, 'new_voucher_id', v_new.id),
     p_reason, false);

  return v_new;
end;
$$;

comment on function reissue_voucher(uuid, text) is
  'The only write path operators have to vouchers. SECURITY DEFINER because '
  'they hold no insert or update grant on the table; the is_staff() check at '
  'the top is what stands in for the missing policy.';

revoke all on function reissue_voucher(uuid, text) from public, anon;
grant execute on function reissue_voucher(uuid, text) to authenticated;
