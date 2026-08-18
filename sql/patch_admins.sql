-- Ajuste de segurança: só e-mails cadastrados na tabela "admins" conseguem
-- ver/editar clientes e compras (antes, qualquer conta logada conseguia).
-- Rode isso no SQL Editor do Supabase (é só um complemento do schema.sql já rodado).

create table if not exists admins (
  email text primary key
);

alter table admins enable row level security;

drop policy if exists "admins: ve a si mesmo" on admins;
create policy "admins: ve a si mesmo" on admins
  for select
  using (email = auth.jwt() ->> 'email');

-- Troque pelo e-mail que vai logar no painel (pode rodar de novo pra adicionar outros).
insert into admins (email) values ('luizaorey@gmail.com')
  on conflict do nothing;

drop policy if exists "clientes: acesso autenticado" on clientes;
drop policy if exists "clientes: apenas admins" on clientes;
create policy "clientes: apenas admins" on clientes
  for all
  using (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'));

drop policy if exists "compras: acesso autenticado" on compras;
drop policy if exists "compras: apenas admins" on compras;
create policy "compras: apenas admins" on compras
  for all
  using (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'));
