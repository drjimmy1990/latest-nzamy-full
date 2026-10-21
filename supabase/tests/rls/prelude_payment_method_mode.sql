insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e001');
insert into public.profiles (id,user_type) values ('00000000-0000-0000-0000-00000000e001','lawyer');
insert into public.payment_methods (id,user_id,token) values
 ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000e001','mode-test'),
 ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000e001','mode-unknown');
insert into public.payment_orders (id,user_id,kind,item_id,billing,net_halalas,vat_halalas,total_halalas,vat_mode,status,live) values
 ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-00000000e001','plan','lawyer-pro','monthly',39900,5985,45885,'exclusive','paid',false);
insert into public.subscriptions (user_id,plan_id,tier,status,payment_method_id,metadata) values
 ('00000000-0000-0000-0000-00000000e001','lawyer-pro','pro','active','00000000-0000-0000-0000-00000000c001','{"order_id":"00000000-0000-0000-0000-00000000d001"}');
grant select (token, live) on public.payment_methods to authenticated;
