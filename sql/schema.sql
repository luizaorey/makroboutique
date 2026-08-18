-- Painel de Clientes · Makro Boutique
-- Rode este arquivo inteiro no SQL Editor do Supabase (projeto novo, dedicado).

create extension if not exists "pgcrypto";

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null, -- formato: DDI+DDD+numero, ex: 5571998124477
  data_nascimento date,
  criado_em timestamptz not null default now()
);

create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  valor numeric(10,2) not null check (valor >= 0),
  data_compra date not null default current_date,
  criado_em timestamptz not null default now()
);

create index if not exists compras_cliente_id_idx on compras (cliente_id);

create table if not exists admins (
  email text primary key
);

alter table clientes enable row level security;
alter table compras enable row level security;
alter table admins enable row level security;

create policy "admins: ve a si mesmo" on admins
  for select
  using (email = auth.jwt() ->> 'email');

-- Só e-mails cadastrados em "admins" podem ler/escrever clientes e compras
-- (não basta estar logado — qualquer um poderia criar conta e ver tudo).
create policy "clientes: apenas admins" on clientes
  for all
  using (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'));

create policy "compras: apenas admins" on compras
  for all
  using (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'));

-- Troque pelo e-mail de quem vai logar no painel (rode de novo pra adicionar outros).
insert into admins (email) values ('luizaorey@gmail.com')
  on conflict do nothing;

-- View com total gasto e nº de compras por cliente (ranking de fidelidade).
-- security_invoker garante que a view respeita a RLS de quem consulta, não do dono da view.
create or replace view clientes_resumo
  with (security_invoker = true) as
select
  c.id,
  c.nome,
  c.telefone,
  c.data_nascimento,
  c.criado_em,
  coalesce(count(cp.id), 0) as total_compras,
  coalesce(sum(cp.valor), 0) as total_gasto
from clientes c
left join compras cp on cp.cliente_id = c.id
group by c.id;
