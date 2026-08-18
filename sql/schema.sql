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

alter table clientes enable row level security;
alter table compras enable row level security;

-- Só usuários autenticados (a lojista, logada no painel) podem ler/escrever.
-- Não há acesso público (anon) a dados de clientes.
create policy "clientes: acesso autenticado" on clientes
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "compras: acesso autenticado" on compras
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

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
