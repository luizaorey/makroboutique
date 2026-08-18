-- Campos extras pro painel (paridade com a versão de referência do Lovable).
-- Rode no SQL Editor do Supabase, depois de schema.sql e patch_admins.sql.

alter table clientes add column if not exists apelido text;
alter table clientes add column if not exists email text;
alter table clientes add column if not exists endereco text;
alter table clientes add column if not exists tamanho_manequim text;
alter table clientes add column if not exists estilo_preferido text;
alter table clientes add column if not exists cores_preferidas text;
alter table clientes add column if not exists restricoes text;
alter table clientes add column if not exists observacoes text;

alter table compras add column if not exists itens text;
alter table compras add column if not exists forma_pagamento text;
alter table compras add column if not exists observacao text;

create table if not exists datas_especiais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  descricao text not null,
  data date not null,
  criado_em timestamptz not null default now()
);

create index if not exists datas_especiais_cliente_id_idx on datas_especiais (cliente_id);

alter table datas_especiais enable row level security;

drop policy if exists "datas_especiais: apenas admins" on datas_especiais;
create policy "datas_especiais: apenas admins" on datas_especiais
  for all
  using (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'))
  with check (exists (select 1 from admins a where a.email = auth.jwt() ->> 'email'));
