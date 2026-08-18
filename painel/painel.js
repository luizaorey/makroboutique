(function () {
  "use strict";

  const cfg = window.MAKRO_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho",
    "agosto","setembro","outubro","novembro","dezembro"];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let clientes = [];       // cache da view clientes_resumo
  let clienteAtualId = null;
  let clienteAtualCompleto = null; // registro completo (todos os campos) da cliente aberta no detalhe

  // ---------- helpers ----------
  function onlyDigits(s) { return (s || "").replace(/\D/g, ""); }

  function normalizaTelefone(raw) {
    let d = onlyDigits(raw);
    if (d.length <= 11) d = "55" + d; // assume Brasil se não veio DDI
    return d;
  }

  function formataTelefoneExibicao(raw) {
    const d = onlyDigits(raw);
    const local = d.length > 11 ? d.slice(-11) : d;
    if (local.length === 11) {
      return `(${local.slice(0,2)}) ${local.slice(2,7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
      return `(${local.slice(0,2)}) ${local.slice(2,6)}-${local.slice(6)}`;
    }
    return raw;
  }

  function iniciais(nome) {
    return (nome || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }

  function formataMoeda(v) {
    return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formataDataCurta(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function mostraErro(elId, msg) {
    const el = $(elId);
    if (el) el.textContent = msg || "";
  }

  // ---------- auth ----------
  async function checarSessao() {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      mostraApp();
    } else {
      mostraLogin();
    }
  }

  function mostraLogin() {
    $("#login-screen").classList.remove("hidden");
    $("#app").classList.add("hidden");
  }

  async function mostraApp() {
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    await carregarPainel();
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostraErro("#login-error", "");
    const email = $("#login-email").value.trim();
    const senha = $("#login-senha").value;
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      mostraErro("#login-error", "E-mail ou senha inválidos.");
      return;
    }
    await mostraApp();
  });

  $("#btn-logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    mostraLogin();
  });

  // ---------- criar login (primeiro acesso) ----------
  $("#link-mostrar-criar-login").addEventListener("click", (e) => {
    e.preventDefault();
    $("#login-form").classList.add("hidden");
    $("#link-mostrar-criar-login").classList.add("hidden");
    $("#signup-form").classList.remove("hidden");
    $("#link-mostrar-login").classList.remove("hidden");
  });

  $("#link-mostrar-login").addEventListener("click", (e) => {
    e.preventDefault();
    $("#signup-form").classList.add("hidden");
    $("#link-mostrar-login").classList.add("hidden");
    $("#login-form").classList.remove("hidden");
    $("#link-mostrar-criar-login").classList.remove("hidden");
  });

  $("#signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostraErro("#signup-error", "");
    const email = $("#signup-email").value.trim();
    const senha = $("#signup-senha").value;
    const senha2 = $("#signup-senha2").value;

    if (senha !== senha2) {
      mostraErro("#signup-error", "As senhas não são iguais.");
      return;
    }
    if (senha.length < 6) {
      mostraErro("#signup-error", "A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    const { data, error } = await sb.auth.signUp({ email, password: senha });
    if (error) {
      mostraErro("#signup-error", "Não foi possível criar o login: " + error.message);
      return;
    }
    if (data.session) {
      await mostraApp();
      return;
    }
    mostraErro(
      "#signup-error",
      "Login criado! Se o Supabase pedir confirmação por e-mail, verifique sua caixa de entrada antes de entrar."
    );
  });

  // ---------- navegação por abas ----------
  $$(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => trocarView(btn.dataset.view));
  });

  function trocarView(nome) {
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === nome));
    $$(".view").forEach((v) => v.classList.remove("active"));
    $(`#view-${nome}`).classList.add("active");
    if (nome === "clientes") renderListaClientes();
  }

  $("#btn-voltar-clientes").addEventListener("click", () => trocarView("clientes"));

  // ---------- dados ----------
  async function buscarClientes() {
    const { data, error } = await sb
      .from("clientes_resumo")
      .select("*")
      .order("nome", { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return data || [];
  }

  async function buscarClienteCompleto(id) {
    const { data, error } = await sb.from("clientes").select("*").eq("id", id).single();
    if (error) {
      console.error(error);
      return null;
    }
    return data;
  }

  async function carregarPainel() {
    clientes = await buscarClientes();
    renderKpis();
    renderAniversariantes();
    renderRanking();
  }

  function renderKpis() {
    const hoje = new Date();
    $("#painel-mes").textContent = `${MESES[hoje.getMonth()].toUpperCase()} DE ${hoje.getFullYear()}`;

    $("#kpi-clientes").textContent = clientes.length;

    const aniversariantesMes = clientes.filter((c) => ehAniversarianteNoMes(c.data_nascimento, hoje.getMonth() + 1));
    $("#kpi-aniversariantes").textContent = aniversariantesMes.length;

    const totalGeral = clientes.reduce((acc, c) => acc + Number(c.total_gasto || 0), 0);
    $("#kpi-total").textContent = formataMoeda(totalGeral);

    const maisRecente = [...clientes].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0];
    if (maisRecente) {
      $("#kpi-recente").textContent = maisRecente.nome;
      $("#kpi-recente-data").textContent = `Cadastrada em ${formataDataCurta(maisRecente.criado_em.slice(0, 10))}`;
    } else {
      $("#kpi-recente").textContent = "–";
      $("#kpi-recente-data").textContent = "";
    }
  }

  function ehAniversarianteNoMes(dataNascimento, mes) {
    if (!dataNascimento) return false;
    const m = Number(dataNascimento.slice(5, 7));
    return m === mes;
  }

  function renderAniversariantes() {
    const hoje = new Date();
    const lista = clientes
      .filter((c) => ehAniversarianteNoMes(c.data_nascimento, hoje.getMonth() + 1))
      .sort((a, b) => Number(a.data_nascimento.slice(8, 10)) - Number(b.data_nascimento.slice(8, 10)));

    const container = $("#lista-aniversariantes");
    if (!lista.length) {
      container.innerHTML = `<div class="empty">Nenhuma aniversariante este mês.</div>`;
      return;
    }
    container.innerHTML = lista.map((c) => `
      <div class="list-row">
        <div class="avatar">${iniciais(c.nome)}</div>
        <div class="row-main">
          <div class="name">${escapeHtml(c.nome)}</div>
          <div class="meta">${formataTelefoneExibicao(c.telefone)}</div>
        </div>
        <span class="row-tag">dia ${c.data_nascimento.slice(8, 10)}</span>
        <a class="wpp-ico" href="https://wa.me/${normalizaTelefone(c.telefone)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${escapeHtml(c.nome)}">
          <svg><use href="#wpp"/></svg>
        </a>
      </div>
    `).join("");
  }

  function renderRanking() {
    const top = [...clientes]
      .filter((c) => Number(c.total_gasto) > 0)
      .sort((a, b) => Number(b.total_gasto) - Number(a.total_gasto))
      .slice(0, 5);

    const container = $("#lista-ranking");
    if (!top.length) {
      container.innerHTML = `<div class="empty">Nenhuma compra registrada ainda.</div>`;
      return;
    }
    container.innerHTML = top.map((c, i) => `
      <div class="list-row" data-id="${c.id}">
        <div class="rank-num">${i + 1}</div>
        <div class="row-main">
          <div class="name">${escapeHtml(c.nome)}</div>
          <div class="meta">${c.total_compras} compra(s)</div>
        </div>
        <div style="font-family:'Playfair Display',serif;color:var(--ouro-cl)">${formataMoeda(c.total_gasto)}</div>
      </div>
    `).join("");
    $$("#lista-ranking .list-row").forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => abrirDetalheCliente(row.dataset.id));
    });
  }

  // ---------- lista de clientes ----------
  function renderListaClientes() {
    const termo = onlyDigits($("#busca-cliente").value) ? null : $("#busca-cliente").value.trim().toLowerCase();
    const termoDigits = onlyDigits($("#busca-cliente").value);

    const filtradas = clientes.filter((c) => {
      if (termoDigits) return onlyDigits(c.telefone).includes(termoDigits);
      if (termo) return c.nome.toLowerCase().includes(termo);
      return true;
    });

    const container = $("#lista-clientes");
    if (!filtradas.length) {
      container.innerHTML = `<div class="empty">Nenhuma cliente encontrada.</div>`;
      return;
    }
    container.innerHTML = filtradas.map((c) => `
      <div class="list-row" data-id="${c.id}" style="cursor:pointer">
        <div class="avatar">${iniciais(c.nome)}</div>
        <div class="row-main">
          <div class="name">${escapeHtml(c.nome)}</div>
          <div class="meta">${formataTelefoneExibicao(c.telefone)}</div>
        </div>
        <div style="font-family:'Playfair Display',serif;color:var(--ouro-cl);font-size:14px">${formataMoeda(c.total_gasto)}</div>
        <a class="wpp-ico" href="https://wa.me/${normalizaTelefone(c.telefone)}" target="_blank" rel="noopener"
           aria-label="WhatsApp de ${escapeHtml(c.nome)}" onclick="event.stopPropagation()">
          <svg><use href="#wpp"/></svg>
        </a>
      </div>
    `).join("");
    $$("#lista-clientes .list-row").forEach((row) => {
      row.addEventListener("click", () => abrirDetalheCliente(row.dataset.id));
    });
  }

  $("#busca-cliente").addEventListener("input", renderListaClientes);

  // ---------- detalhe do cliente ----------
  async function abrirDetalheCliente(id) {
    clienteAtualId = id;
    const resumo = clientes.find((x) => x.id === id);
    const c = await buscarClienteCompleto(id);
    if (!c) return;
    clienteAtualCompleto = c;

    $("#detalhe-avatar").textContent = iniciais(c.nome);
    $("#detalhe-nome").textContent = c.apelido ? `${c.nome} (${c.apelido})` : c.nome;
    $("#detalhe-telefone").textContent = formataTelefoneExibicao(c.telefone);
    $("#detalhe-wpp").href = `https://wa.me/${normalizaTelefone(c.telefone)}`;
    $("#detalhe-aniversario").textContent = c.data_nascimento ? formataDataCurta(c.data_nascimento) : "–";
    $("#detalhe-total").textContent = formataMoeda(resumo ? resumo.total_gasto : 0);
    $("#detalhe-qtd-compras").textContent = resumo ? resumo.total_compras : 0;

    $("#detalhe-email").textContent = c.email || "–";
    $("#detalhe-endereco").textContent = c.endereco || "–";
    $("#detalhe-tamanho").textContent = c.tamanho_manequim || "–";
    $("#detalhe-estilo").textContent = c.estilo_preferido || "–";
    $("#detalhe-cores").textContent = c.cores_preferidas || "–";
    $("#detalhe-restricoes").textContent = c.restricoes || "–";
    $("#detalhe-observacoes").textContent = c.observacoes || "–";

    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-cliente-detalhe").classList.add("active");
    $$(".tabs button").forEach((b) => b.classList.remove("active"));

    await renderComprasDoCliente(id);
    await renderDatasEspeciaisDoCliente(id);
  }

  async function renderComprasDoCliente(clienteId) {
    const { data, error } = await sb
      .from("compras")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("data_compra", { ascending: false });

    const container = $("#lista-compras");
    if (error) {
      container.innerHTML = `<div class="empty">Erro ao carregar compras.</div>`;
      return;
    }
    if (!data.length) {
      container.innerHTML = `<div class="empty">Nenhuma compra registrada ainda.</div>`;
      return;
    }
    container.innerHTML = data.map((cp) => `
      <div class="compra-row">
        <div>
          <div>${formataDataCurta(cp.data_compra)}</div>
          ${cp.itens ? `<div class="meta">${escapeHtml(cp.itens)}</div>` : ""}
          ${cp.forma_pagamento ? `<div class="meta">${escapeHtml(cp.forma_pagamento)}</div>` : ""}
          ${cp.observacao ? `<div class="meta">${escapeHtml(cp.observacao)}</div>` : ""}
        </div>
        <span>
          <span class="valor">${formataMoeda(cp.valor)}</span>
          <span class="del no-print" data-id="${cp.id}">excluir</span>
        </span>
      </div>
    `).join("");
    $$("#lista-compras .del").forEach((el) => {
      el.addEventListener("click", async () => {
        if (!confirm("Excluir esta compra?")) return;
        await sb.from("compras").delete().eq("id", el.dataset.id);
        clientes = await buscarClientes();
        await abrirDetalheCliente(clienteId);
      });
    });
  }

  // ---------- datas especiais ----------
  async function renderDatasEspeciaisDoCliente(clienteId) {
    const { data, error } = await sb
      .from("datas_especiais")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("data", { ascending: true });

    const container = $("#lista-datas-especiais");
    if (error) {
      container.innerHTML = `<div class="empty">Erro ao carregar datas especiais.</div>`;
      return;
    }
    if (!data.length) {
      container.innerHTML = `<div class="empty">Nenhuma data especial cadastrada.</div>`;
      return;
    }
    container.innerHTML = data.map((d) => `
      <div class="data-especial-row">
        <span class="desc">${escapeHtml(d.descricao)}</span>
        <span class="quando">
          <span class="dia">${d.data.slice(8, 10)}/${d.data.slice(5, 7)}</span>
          <span class="del no-print" data-id="${d.id}">excluir</span>
        </span>
      </div>
    `).join("");
    $$("#lista-datas-especiais .del").forEach((el) => {
      el.addEventListener("click", async () => {
        if (!confirm("Excluir esta data especial?")) return;
        await sb.from("datas_especiais").delete().eq("id", el.dataset.id);
        await renderDatasEspeciaisDoCliente(clienteId);
      });
    });
  }

  $("#btn-nova-data-especial").addEventListener("click", () => {
    mostraErro("#data-especial-error", "");
    $("#data-especial-descricao").value = "";
    $("#data-especial-data").value = "";
    $("#modal-data-especial").classList.remove("hidden");
  });
  $("#btn-cancelar-data-especial").addEventListener("click", () => $("#modal-data-especial").classList.add("hidden"));

  $("#form-data-especial").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostraErro("#data-especial-error", "");
    const descricao = $("#data-especial-descricao").value.trim();
    const data = $("#data-especial-data").value;
    if (!descricao || !data) {
      mostraErro("#data-especial-error", "Preencha a descrição e a data.");
      return;
    }
    const { error } = await sb.from("datas_especiais").insert({
      cliente_id: clienteAtualId,
      descricao,
      data,
    });
    if (error) {
      mostraErro("#data-especial-error", "Não foi possível salvar. Tente novamente.");
      return;
    }
    $("#modal-data-especial").classList.add("hidden");
    await renderDatasEspeciaisDoCliente(clienteAtualId);
  });

  // ---------- modal cliente (criar/editar) ----------
  function abrirModalCliente(cliente) {
    mostraErro("#cliente-error", "");
    $("#modal-cliente-titulo").textContent = cliente ? "Editar cliente" : "Nova cliente";
    $("#cliente-nome").value = cliente ? cliente.nome : "";
    $("#cliente-apelido").value = cliente ? (cliente.apelido || "") : "";
    $("#cliente-telefone").value = cliente ? formataTelefoneExibicao(cliente.telefone) : "";
    $("#cliente-email").value = cliente ? (cliente.email || "") : "";
    $("#cliente-endereco").value = cliente ? (cliente.endereco || "") : "";
    $("#cliente-nascimento").value = cliente ? (cliente.data_nascimento || "") : "";
    $("#cliente-tamanho").value = cliente ? (cliente.tamanho_manequim || "") : "";
    $("#cliente-estilo").value = cliente ? (cliente.estilo_preferido || "") : "";
    $("#cliente-cores").value = cliente ? (cliente.cores_preferidas || "") : "";
    $("#cliente-restricoes").value = cliente ? (cliente.restricoes || "") : "";
    $("#cliente-observacoes").value = cliente ? (cliente.observacoes || "") : "";
    $("#form-cliente").dataset.editId = cliente ? cliente.id : "";
    $("#modal-cliente").classList.remove("hidden");
  }

  function fecharModalCliente() {
    $("#modal-cliente").classList.add("hidden");
  }

  $("#btn-nova-cliente").addEventListener("click", () => abrirModalCliente(null));
  $("#btn-editar-cliente").addEventListener("click", () => {
    if (clienteAtualCompleto) abrirModalCliente(clienteAtualCompleto);
  });
  $("#btn-cancelar-cliente").addEventListener("click", fecharModalCliente);

  $("#form-cliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostraErro("#cliente-error", "");
    const nome = $("#cliente-nome").value.trim();
    const telefone = normalizaTelefone($("#cliente-telefone").value);
    const nascimento = $("#cliente-nascimento").value || null;
    const editId = $("#form-cliente").dataset.editId;

    if (!nome || onlyDigits(telefone).length < 12) {
      mostraErro("#cliente-error", "Confira o nome e o telefone (com DDD).");
      return;
    }

    const payload = {
      nome,
      telefone,
      data_nascimento: nascimento,
      apelido: $("#cliente-apelido").value.trim() || null,
      email: $("#cliente-email").value.trim() || null,
      endereco: $("#cliente-endereco").value.trim() || null,
      tamanho_manequim: $("#cliente-tamanho").value.trim() || null,
      estilo_preferido: $("#cliente-estilo").value.trim() || null,
      cores_preferidas: $("#cliente-cores").value.trim() || null,
      restricoes: $("#cliente-restricoes").value.trim() || null,
      observacoes: $("#cliente-observacoes").value.trim() || null,
    };
    const { error } = editId
      ? await sb.from("clientes").update(payload).eq("id", editId)
      : await sb.from("clientes").insert(payload);

    if (error) {
      mostraErro("#cliente-error", "Não foi possível salvar. Tente novamente.");
      return;
    }

    fecharModalCliente();
    clientes = await buscarClientes();
    renderKpis();
    renderAniversariantes();
    renderRanking();
    renderListaClientes();
    if (editId && clienteAtualId === editId) await abrirDetalheCliente(editId);
  });

  $("#btn-excluir-cliente").addEventListener("click", async () => {
    if (!clienteAtualId) return;
    const c = clientes.find((x) => x.id === clienteAtualId);
    if (!confirm(`Excluir ${c?.nome || "esta cliente"}? Isso também apaga o histórico de compras dela.`)) return;
    await sb.from("clientes").delete().eq("id", clienteAtualId);
    clienteAtualId = null;
    clientes = await buscarClientes();
    trocarView("clientes");
    renderKpis();
    renderAniversariantes();
    renderRanking();
  });

  // ---------- modal compra ----------
  $("#btn-nova-compra").addEventListener("click", () => {
    mostraErro("#compra-error", "");
    $("#compra-valor").value = "";
    $("#compra-data").value = new Date().toISOString().slice(0, 10);
    $("#compra-itens").value = "";
    $("#compra-forma-pagamento").value = "";
    $("#compra-observacao").value = "";
    $("#modal-compra").classList.remove("hidden");
  });
  $("#btn-cancelar-compra").addEventListener("click", () => $("#modal-compra").classList.add("hidden"));

  $("#form-compra").addEventListener("submit", async (e) => {
    e.preventDefault();
    mostraErro("#compra-error", "");
    const valor = parseFloat($("#compra-valor").value);
    const data = $("#compra-data").value;
    if (!valor || valor <= 0 || !data) {
      mostraErro("#compra-error", "Confira o valor e a data.");
      return;
    }
    const { error } = await sb.from("compras").insert({
      cliente_id: clienteAtualId,
      valor,
      data_compra: data,
      itens: $("#compra-itens").value.trim() || null,
      forma_pagamento: $("#compra-forma-pagamento").value.trim() || null,
      observacao: $("#compra-observacao").value.trim() || null,
    });
    if (error) {
      mostraErro("#compra-error", "Não foi possível salvar. Tente novamente.");
      return;
    }
    $("#modal-compra").classList.add("hidden");
    clientes = await buscarClientes();
    renderKpis();
    renderRanking();
    await abrirDetalheCliente(clienteAtualId);
  });

  // ---------- imprimir ficha ----------
  $("#btn-imprimir-ficha").addEventListener("click", () => window.print());

  // ---------- exportar CSV ----------
  function baixarArquivo(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  $("#btn-exportar-csv").addEventListener("click", () => {
    const colunas = ["nome", "telefone", "data_nascimento", "total_compras", "total_gasto"];
    const linhas = [colunas.join(";")];
    clientes.forEach((c) => {
      linhas.push(colunas.map((col) => csvEscape(c[col])).join(";"));
    });
    baixarArquivo(
      `clientes-makro-boutique-${new Date().toISOString().slice(0, 10)}.csv`,
      "﻿" + linhas.join("\n"),
      "text/csv;charset=utf-8"
    );
  });

  // ---------- exportar / importar backup (JSON) ----------
  $("#btn-exportar-backup").addEventListener("click", async () => {
    const [{ data: todosClientes }, { data: todasCompras }, { data: todasDatas }] = await Promise.all([
      sb.from("clientes").select("*"),
      sb.from("compras").select("*"),
      sb.from("datas_especiais").select("*"),
    ]);
    const backup = {
      gerado_em: new Date().toISOString(),
      clientes: todosClientes || [],
      compras: todasCompras || [],
      datas_especiais: todasDatas || [],
    };
    baixarArquivo(
      `backup-makro-boutique-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );
  });

  $("#btn-importar-backup").addEventListener("click", () => $("#input-importar-backup").click());

  $("#input-importar-backup").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      alert("Arquivo inválido — não parece um backup em JSON.");
      return;
    }

    const nClientes = (backup.clientes || []).length;
    const nCompras = (backup.compras || []).length;
    if (!confirm(`Importar ${nClientes} cliente(s) e ${nCompras} compra(s) deste backup? Registros com o mesmo ID serão atualizados.`)) {
      return;
    }

    if (backup.clientes?.length) {
      const { error } = await sb.from("clientes").upsert(backup.clientes);
      if (error) { alert("Erro ao importar clientes: " + error.message); return; }
    }
    if (backup.compras?.length) {
      const { error } = await sb.from("compras").upsert(backup.compras);
      if (error) { alert("Erro ao importar compras: " + error.message); return; }
    }
    if (backup.datas_especiais?.length) {
      const { error } = await sb.from("datas_especiais").upsert(backup.datas_especiais);
      if (error) { alert("Erro ao importar datas especiais: " + error.message); return; }
    }

    clientes = await buscarClientes();
    renderKpis();
    renderAniversariantes();
    renderRanking();
    renderListaClientes();
    alert("Backup importado com sucesso.");
  });

  // ---------- util ----------
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  checarSessao();
})();
