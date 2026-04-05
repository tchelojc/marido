/**
 * =========================================================================
 * BACKEND UNIVERSAL - MARIDO DE ALUGUEL (ALMAFLUXO)
 * Arquitetura: Fila + LockService + Processamento por trigger
 * Arquivos: entrada.json, saida.json, comunicacao.json
 * =========================================================================
 * 
 * INSTRUÇÕES DE IMPLANTAÇÃO:
 * 1. Copie este código integralmente para o Google Apps Script
 * 2. Execute a função "inicializarSistema()" uma vez para criar todos os arquivos
 * 3. Execute a função "configurarTrigger()" uma vez para ativar o processamento automático
 * 4. Implante como "Aplicativo da web" com acesso "Qualquer pessoa"
 * 5. Copie a URL gerada e cole no arquivo integracao.js
 * =========================================================================
 */

const PASTA_ID = "1g8zHhhgb1bfTMtACUhMPG49p5NJLWg2I"; // ID da pasta no Drive

// ========== CONFIGURAÇÃO DO GITHUB PARA IMAGENS ==========
const GITHUB_TOKEN = "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"; // Token GitHub
const GITHUB_REPO = "tchelojc/marido"; // Seu repositório
const GITHUB_BRANCH = "main"; // Branch principal (main ou master)

// Nomes dos arquivos de controle da fila
const ARQ_ENTRADA     = "entrada.json";
const ARQ_SAIDA       = "saida.json";
const ARQ_COMUNICACAO = "comunicacao.json";

// Arquivos de dados (persistência real)
const ARQ_CLIENTES       = "clientes.json";
const ARQ_PROFISSIONAIS  = "profissionais.json";
const ARQ_CHATS          = "chats.json";
const ARQ_TRANSACOES     = "transacoes.json";
const ARQ_TOKENS         = "tokens_servico.json";
const ARQ_SOLICITACOES   = "solicitacoes_recarga.json";
const ARQ_PERFIL_EXTRA   = "perfis_extra.json";
const ARQ_FOTOS          = "fotos_servicos.json";
const ARQ_AVALIACOES     = "avaliacoes.json";

// Lista de todos os arquivos que precisam ser criados
const TODOS_ARQUIVOS = [
  ARQ_ENTRADA, ARQ_SAIDA, ARQ_COMUNICACAO,
  ARQ_CLIENTES, ARQ_PROFISSIONAIS, ARQ_CHATS,
  ARQ_TRANSACOES, ARQ_TOKENS, ARQ_SOLICITACOES,
  ARQ_PERFIL_EXTRA, ARQ_FOTOS, ARQ_AVALIACOES
];

// ==========================================
// FUNÇÕES DE UPLOAD PARA GITHUB
// ==========================================

// Gera nome único para arquivo
function gerarNomeUnico(prefixo, extensao) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefixo}_${timestamp}_${random}.${extensao}`;
}

// Upload de imagem para o GitHub
function uploadImagemGitHub(imagemBase64, pastaDestino, nomeArquivo) {
  // Remove o prefixo base64 se existir
  let base64Data = imagemBase64;
  if (imagemBase64.includes(',')) {
    base64Data = imagemBase64.split(',')[1];
  }
  
  const caminhoCompleto = `imagens/${pastaDestino}/${nomeArquivo}`;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${caminhoCompleto}`;
  
  // Configuração do fetch
  const options = {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Google-Apps-Script'
    },
    payload: JSON.stringify({
      message: `Upload imagem: ${nomeArquivo}`,
      content: base64Data,
      branch: GITHUB_BRANCH
    }),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const resultado = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 201 || response.getResponseCode() === 200) {
      const urlRaw = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${caminhoCompleto}`;
      return {
        sucesso: true,
        url: urlRaw,
        path: caminhoCompleto,
        sha: resultado.content ? resultado.content.sha : null
      };
    } else {
      throw new Error(`Erro HTTP ${response.getResponseCode()}: ${resultado.message || 'Erro desconhecido'}`);
    }
  } catch (err) {
    console.error('Erro no upload GitHub:', err);
    return { sucesso: false, erro: err.message };
  }
}

// Deletar imagem do GitHub
function deletarImagemGitHub(caminhoArquivo) {
  // Primeiro, obtém o SHA do arquivo
  const urlGet = `https://api.github.com/repos/${GITHUB_REPO}/contents/${caminhoArquivo}`;
  const optionsGet = {
    method: 'GET',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Google-Apps-Script'
    },
    muteHttpExceptions: true
  };
  
  try {
    const responseGet = UrlFetchApp.fetch(urlGet, optionsGet);
    if (responseGet.getResponseCode() !== 200) {
      throw new Error('Arquivo não encontrado');
    }
    const data = JSON.parse(responseGet.getContentText());
    
    // Deleta o arquivo
    const optionsDelete = {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Google-Apps-Script'
      },
      payload: JSON.stringify({
        message: `Delete imagem: ${caminhoArquivo}`,
        sha: data.sha,
        branch: GITHUB_BRANCH
      }),
      muteHttpExceptions: true
    };
    
    const responseDelete = UrlFetchApp.fetch(urlGet, optionsDelete);
    return { sucesso: responseDelete.getResponseCode() === 200 };
  } catch (err) {
    console.error('Erro ao deletar imagem:', err);
    return { sucesso: false, erro: err.message };
  }
}

// ==========================================
// FUNÇÃO DE INICIALIZAÇÃO (executar UMA VEZ)
// ==========================================
function inicializarSistema() {
  console.log("🚀 Inicializando sistema Marido de Aluguel...");
  
  try {
    const pasta = getPasta();
    console.log("✅ Pasta encontrada/verificada:", pasta.getName());
    
    let arquivosCriados = 0;
    let arquivosExistentes = 0;
    
    for (const nomeArquivo of TODOS_ARQUIVOS) {
      const arquivoExistente = getArquivo(nomeArquivo);
      
      if (!arquivoExistente) {
        let conteudoInicial;
        
        switch (nomeArquivo) {
          case ARQ_COMUNICACAO:
            conteudoInicial = { lock: { ocupado: false, timestamp: 0 }, ultimaSincronizacao: new Date().toISOString() };
            break;
          case ARQ_ENTRADA:
          case ARQ_SAIDA:
            conteudoInicial = [];
            break;
          case ARQ_CLIENTES:
          case ARQ_PROFISSIONAIS:
          case ARQ_CHATS:
          case ARQ_TRANSACOES:
          case ARQ_TOKENS:
          case ARQ_SOLICITACOES:
          case ARQ_FOTOS:
          case ARQ_AVALIACOES:
            conteudoInicial = [];
            break;
          case ARQ_PERFIL_EXTRA:
            conteudoInicial = {};
            break;
          default:
            conteudoInicial = [];
        }
        
        escreverJSON(nomeArquivo, conteudoInicial);
        console.log(`✅ Arquivo criado: ${nomeArquivo}`);
        arquivosCriados++;
      } else {
        console.log(`ℹ️ Arquivo já existe: ${nomeArquivo}`);
        arquivosExistentes++;
      }
    }
    
    console.log(`📊 Resumo: ${arquivosCriados} arquivos criados, ${arquivosExistentes} arquivos existentes`);
    console.log("🎉 Sistema inicializado com sucesso!");
    
    return {
      sucesso: true,
      mensagem: `Sistema inicializado: ${arquivosCriados} arquivos criados, ${arquivosExistentes} já existiam`,
      pastaId: PASTA_ID
    };
    
  } catch (erro) {
    console.error("❌ Erro na inicialização:", erro.message);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
}

// ==========================================
// FUNÇÃO PARA VERIFICAR ESTRUTURA
// ==========================================
function verificarEstrutura() {
  console.log("🔍 Verificando estrutura de arquivos...");
  
  const resultados = [];
  
  for (const nomeArquivo of TODOS_ARQUIVOS) {
    const arquivo = getArquivo(nomeArquivo);
    const existe = !!arquivo;
    
    if (existe) {
      const tamanho = arquivo.getSize();
      console.log(`✅ ${nomeArquivo} - OK (${tamanho} bytes)`);
    } else {
      console.log(`❌ ${nomeArquivo} - NÃO ENCONTRADO`);
    }
    
    resultados.push({ nome: nomeArquivo, existe, tamanho: existe ? arquivo.getSize() : 0 });
  }
  
  return resultados;
}

// ==========================================
// ACESSO AOS ARQUIVOS NO DRIVE
// ==========================================
function getPasta() {
  let pasta;
  try {
    pasta = DriveApp.getFolderById(PASTA_ID);
  } catch (e) {
    console.log("Pasta não encontrada, tentando criar...");
    const pastaPai = DriveApp.getRootFolder();
    pasta = pastaPai.createFolder("marido_backend");
    console.log("Pasta criada em:", pasta.getUrl());
  }
  return pasta;
}

function getArquivo(nome) {
  const pasta = getPasta();
  const arquivos = pasta.getFilesByName(nome);
  return arquivos.hasNext() ? arquivos.next() : null;
}

function lerJSON(nome, defaultValue = []) {
  const file = getArquivo(nome);
  if (!file) return defaultValue;
  const conteudo = file.getBlob().getDataAsString();
  if (!conteudo || conteudo.trim() === "") return defaultValue;
  try { return JSON.parse(conteudo); } catch(e) { return defaultValue; }
}

function escreverJSON(nome, dados) {
  let file = getArquivo(nome);
  const blob = Utilities.newBlob(JSON.stringify(dados, null, 2), "application/json", nome);
  if (file) {
    file.setContent(blob.getDataAsString());
  } else {
    getPasta().createFile(blob);
  }
}

function gerarID() {
  return Utilities.getUuid();
}

// ==========================================
// LOCK SIMPLES PARA EVITAR CONCORRÊNCIA
// ==========================================
function adquirirLock() {
  let comunicacao = lerJSON(ARQ_COMUNICACAO, { lock: { ocupado: false, timestamp: 0 } });
  let lock = comunicacao.lock || { ocupado: false, timestamp: 0 };
  if (lock.ocupado && (Date.now() - lock.timestamp > 30000)) {
    lock.ocupado = false;
  }
  if (lock.ocupado) return false;
  lock.ocupado = true;
  lock.timestamp = Date.now();
  comunicacao.lock = lock;
  escreverJSON(ARQ_COMUNICACAO, comunicacao);
  return true;
}

function liberarLock() {
  let comunicacao = lerJSON(ARQ_COMUNICACAO, { lock: { ocupado: false, timestamp: 0 } });
  if (comunicacao.lock) comunicacao.lock.ocupado = false;
  escreverJSON(ARQ_COMUNICACAO, comunicacao);
}

// ==========================================
// HEADERS CORS PARA TODAS AS RESPOSTAS
// ==========================================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

// ==========================================
// ENDPOINTS: RECEBER REQUISIÇÕES (POST)
// ==========================================
function doPost(e) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  try {
    if (!e.parameter.data) {
      throw new Error("Nenhum dado recebido no parâmetro 'data'.");
    }

    const payload = JSON.parse(e.parameter.data);
    const acao = payload.acao;
    const dados = payload.dados;

    const resultado = executarAcao(acao, dados);

    return ContentService.createTextOutput(JSON.stringify({ 
      ok: true, 
      ...resultado,
      id: resultado
    }))
    .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      ok: false, 
      erro: err.message 
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// ENDPOINTS: CONSULTAR RESPOSTA (GET)
// ==========================================
function doGet(e) {
  const id = e && e.parameter ? e.parameter.id : null;
  
  if (!id) {
    return ContentService.createTextOutput(JSON.stringify({
      erro: "Parâmetro 'id' obrigatório"
    })).setMimeType(ContentService.MimeType.JSON)
      .setHeaders(CORS_HEADERS);
  }

  const saida = lerJSON(ARQ_SAIDA, []);
  const resposta = saida.find(r => r.id === id);
  
  if (!resposta) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "pendente",
      id: id
    })).setMimeType(ContentService.MimeType.JSON)
      .setHeaders(CORS_HEADERS);
  }
  
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(CORS_HEADERS);
}

// ==========================================
// PROCESSADOR DA FILA (executar via trigger a cada 1 minuto)
// ==========================================
function processarFila() {
  if (!adquirirLock()) return;

  try {
    let entrada = lerJSON(ARQ_ENTRADA, []);
    let saida = lerJSON(ARQ_SAIDA, []);
    let alterado = false;

    for (let i = 0; i < entrada.length; i++) {
      const req = entrada[i];
      if (req.status !== "pendente") continue;

      let resposta;
      try {
        resposta = executarAcao(req.acao, req.dados);
        req.status = "processado";
        alterado = true;
        saida.push({
          id: req.id,
          sucesso: true,
          resultado: resposta,
          timestamp: Date.now()
        });
      } catch (err) {
        req.status = "erro";
        alterado = true;
        saida.push({
          id: req.id,
          sucesso: false,
          erro: err.message,
          timestamp: Date.now()
        });
      }
    }

    if (alterado) {
      escreverJSON(ARQ_ENTRADA, entrada);
      escreverJSON(ARQ_SAIDA, saida);
    }
  } finally {
    liberarLock();
  }
}

// ==========================================
// LÓGICA DE NEGÓCIO (TODAS AS AÇÕES)
// ==========================================
function executarAcao(acao, dados) {
  switch (acao) {
    // ========== CLIENTES ==========
    case "listar_clientes": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      return clientes;
    }
    case "cadastrar_cliente": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      if (clientes.some(c => c.email === dados.email)) throw new Error("E-mail já cadastrado");
      const novo = {
        id: gerarID(),
        nome: dados.nome,
        email: dados.email,
        senha: Utilities.base64Encode(dados.senha),
        telefone: dados.telefone,
        endereco: dados.endereco || "",
        avatar: dados.avatar || "",
        dataCadastro: new Date().toISOString(),
        saldoALMA: 0
      };
      clientes.push(novo);
      escreverJSON(ARQ_CLIENTES, clientes);
      return { id: novo.id, mensagem: "Cliente cadastrado" };
    }
    case "atualizar_cliente": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      const idx = clientes.findIndex(c => c.id === dados.id);
      if (idx === -1) throw new Error("Cliente não encontrado");
      clientes[idx] = { ...clientes[idx], ...dados };
      escreverJSON(ARQ_CLIENTES, clientes);
      return { ok: true };
    }
    case "buscar_cliente_por_email": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      return clientes.find(c => c.email === dados.email) || null;
    }
    case "buscar_cliente_por_id": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      return clientes.find(c => c.id === dados.id) || null;
    }

    // ========== PROFISSIONAIS ==========
    case "listar_profissionais": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      return profs;
    }
    case "cadastrar_profissional": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      if (profs.some(p => p.email === dados.email)) throw new Error("E-mail já cadastrado");
      const novo = {
        id: gerarID(),
        nome: dados.nome,
        email: dados.email,
        senha: Utilities.base64Encode(dados.senha),
        telefone: dados.telefone,
        descricao: dados.descricao || "",
        avatar: dados.avatar || "",
        servicos_ids: dados.servicos_ids || [],
        endereco: dados.endereco || "",
        avaliacao: 0,
        total_avaliacoes: 0,
        dataCadastro: new Date().toISOString(),
        saldoALMA: 0
      };
      profs.push(novo);
      escreverJSON(ARQ_PROFISSIONAIS, profs);
      return { id: novo.id, mensagem: "Profissional cadastrado" };
    }
    case "atualizar_profissional": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      const idx = profs.findIndex(p => p.id === dados.id);
      if (idx === -1) throw new Error("Profissional não encontrado");
      profs[idx] = { ...profs[idx], ...dados };
      escreverJSON(ARQ_PROFISSIONAIS, profs);
      return { ok: true };
    }
    case "buscar_profissional_por_email": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      return profs.find(p => p.email === dados.email) || null;
    }
    case "buscar_profissional_por_id": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      return profs.find(p => p.id === dados.id) || null;
    }

    // ========== CHATS ==========
    case "listar_chats": {
      const chats = lerJSON(ARQ_CHATS, []);
      return chats;
    }
    case "salvar_chat": {
      const chats = lerJSON(ARQ_CHATS, []);
      const idx = chats.findIndex(c => c.id === dados.chat.id);
      if (idx !== -1) chats[idx] = dados.chat;
      else chats.push(dados.chat);
      escreverJSON(ARQ_CHATS, chats);
      return { ok: true };
    }
    case "criar_chat": {
      const chats = lerJSON(ARQ_CHATS, []);
      const novoChat = {
        id: "chat_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        clienteId: dados.clienteId,
        clienteNome: dados.clienteNome,
        profissionalId: dados.profissionalId,
        profissionalNome: dados.profissionalNome,
        servicoId: dados.servicoId,
        servicoNome: dados.servicoNome,
        quantidade: dados.quantidade || 1,
        unidade: dados.unidade || "un",
        valorEstimado: dados.valorEstimado,
        tempoEstimado: dados.tempoEstimado,
        diasEstimados: dados.diasEstimados,
        valorCombinado: dados.valorEstimado,
        statusServico: "negociacao",
        mensagens: [{
          autor: "sistema",
          texto: `💬 Conversa iniciada para o serviço "${dados.servicoNome}".`,
          data: new Date().toLocaleString("pt-BR")
        }],
        dataCriacao: new Date().toISOString()
      };
      chats.push(novoChat);
      escreverJSON(ARQ_CHATS, chats);
      return novoChat;
    }

    // ========== RECARGAS ==========
    case "listar_solicitacoes_recarga": {
      const sols = lerJSON(ARQ_SOLICITACOES, []);
      return sols;
    }
    case "salvar_solicitacao_recarga": {
      const sols = lerJSON(ARQ_SOLICITACOES, []);
      const idx = sols.findIndex(s => s.id === dados.solicitacao.id);
      if (idx !== -1) sols[idx] = dados.solicitacao;
      else sols.push(dados.solicitacao);
      escreverJSON(ARQ_SOLICITACOES, sols);
      return { ok: true };
    }

    // ========== TRANSAÇÕES ==========
    case "listar_transacoes": {
      const trans = lerJSON(ARQ_TRANSACOES, []);
      return trans;
    }
    case "salvar_transacao": {
      const trans = lerJSON(ARQ_TRANSACOES, []);
      trans.push(dados.transacao);
      escreverJSON(ARQ_TRANSACOES, trans);
      return { ok: true };
    }

    // ========== TOKENS DE SERVIÇO ==========
    case "gerar_token_inicio": {
      const { chatId, clienteId, profissionalId } = dados;
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      const expira = Date.now() + 24 * 60 * 60 * 1000;
      const tokens = lerJSON(ARQ_TOKENS, []);
      tokens.push({
        id: gerarID(),
        chatId, tipo: "inicio", token, expira,
        usado: false, criadoPor: clienteId, destino: profissionalId
      });
      escreverJSON(ARQ_TOKENS, tokens);
      return { token, expira };
    }
    case "validar_token_inicio": {
      const { token, chatId, profissionalId } = dados;
      const tokens = lerJSON(ARQ_TOKENS, []);
      const tokenObj = tokens.find(t => t.token === token && t.tipo === "inicio" && t.chatId === chatId && !t.usado && t.expira > Date.now());
      if (!tokenObj) throw new Error("Token inválido ou expirado");
      tokenObj.usado = true;
      escreverJSON(ARQ_TOKENS, tokens);

      const chats = lerJSON(ARQ_CHATS, []);
      const chat = chats.find(c => c.id === chatId);
      if (!chat) throw new Error("Chat não encontrado");

      if (chat.statusServico !== "pago_parcial") {
        const clientes = lerJSON(ARQ_CLIENTES, []);
        const cliente = clientes.find(c => c.id === chat.clienteId);
        const profs = lerJSON(ARQ_PROFISSIONAIS, []);
        const prof = profs.find(p => p.id === chat.profissionalId);
        const valorParcial = chat.valorCombinado * 0.5;
        if ((cliente.saldoALMA || 0) < valorParcial) throw new Error("Saldo insuficiente");
        cliente.saldoALMA -= valorParcial;
        prof.saldoALMA = (prof.saldoALMA || 0) + valorParcial;
        escreverJSON(ARQ_CLIENTES, clientes);
        escreverJSON(ARQ_PROFISSIONAIS, profs);
        const trans = lerJSON(ARQ_TRANSACOES, []);
        trans.push({ id: gerarID(), usuarioId: chat.clienteId, tipoUsuario: "cliente", tipo: "debito", valor: valorParcial, descricao: `Pagamento 50% ${chat.servicoNome}`, data: new Date().toISOString() });
        trans.push({ id: gerarID(), usuarioId: chat.profissionalId, tipoUsuario: "profissional", tipo: "credito", valor: valorParcial, descricao: `Recebimento 50% ${chat.servicoNome}`, data: new Date().toISOString() });
        escreverJSON(ARQ_TRANSACOES, trans);
      }
      chat.statusServico = "em_andamento";
      escreverJSON(ARQ_CHATS, chats);
      return { ok: true, mensagem: "Serviço iniciado, 50% liberado" };
    }
    case "gerar_token_fim": {
      const { chatId, clienteId } = dados;
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      const expira = Date.now() + 24 * 60 * 60 * 1000;
      const tokens = lerJSON(ARQ_TOKENS, []);
      tokens.push({ id: gerarID(), chatId, tipo: "fim", token, expira, usado: false, criadoPor: clienteId });
      escreverJSON(ARQ_TOKENS, tokens);
      return { token, expira };
    }
    case "validar_token_fim": {
      const { token, chatId, profissionalId } = dados;
      const tokens = lerJSON(ARQ_TOKENS, []);
      const tokenObj = tokens.find(t => t.token === token && t.tipo === "fim" && t.chatId === chatId && !t.usado && t.expira > Date.now());
      if (!tokenObj) throw new Error("Token inválido ou expirado");
      tokenObj.usado = true;
      escreverJSON(ARQ_TOKENS, tokens);

      const chats = lerJSON(ARQ_CHATS, []);
      const chat = chats.find(c => c.id === chatId);
      if (!chat) throw new Error("Chat não encontrado");
      if (chat.statusServico !== "em_andamento") throw new Error("Serviço não está em andamento");

      const clientes = lerJSON(ARQ_CLIENTES, []);
      const cliente = clientes.find(c => c.id === chat.clienteId);
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      const prof = profs.find(p => p.id === chat.profissionalId);
      const valorFinal = chat.valorCombinado * 0.5;
      if ((cliente.saldoALMA || 0) < valorFinal) throw new Error("Saldo insuficiente");
      cliente.saldoALMA -= valorFinal;
      prof.saldoALMA = (prof.saldoALMA || 0) + valorFinal;
      escreverJSON(ARQ_CLIENTES, clientes);
      escreverJSON(ARQ_PROFISSIONAIS, profs);
      const trans = lerJSON(ARQ_TRANSACOES, []);
      trans.push({ id: gerarID(), usuarioId: chat.clienteId, tipoUsuario: "cliente", tipo: "debito", valor: valorFinal, descricao: `Pagamento final ${chat.servicoNome}`, data: new Date().toISOString() });
      trans.push({ id: gerarID(), usuarioId: chat.profissionalId, tipoUsuario: "profissional", tipo: "credito", valor: valorFinal, descricao: `Recebimento final ${chat.servicoNome}`, data: new Date().toISOString() });
      escreverJSON(ARQ_TRANSACOES, trans);

      chat.statusServico = "concluido";
      escreverJSON(ARQ_CHATS, chats);
      return { ok: true, mensagem: "Serviço concluído, valor total liberado" };
    }

    // ========== SALDO ==========
    case "obter_saldo": {
      const { usuarioId, tipo } = dados;
      if (tipo === "cliente") {
        const clientes = lerJSON(ARQ_CLIENTES, []);
        const cliente = clientes.find(c => c.id === usuarioId);
        if (!cliente) throw new Error("Cliente não encontrado");
        return { saldo: cliente.saldoALMA || 0 };
      } else if (tipo === "profissional") {
        const profs = lerJSON(ARQ_PROFISSIONAIS, []);
        const prof = profs.find(p => p.id === usuarioId);
        if (!prof) throw new Error("Profissional não encontrado");
        return { saldo: prof.saldoALMA || 0 };
      }
      throw new Error("Tipo inválido");
    }

    // ========== PERFIL EXTRA ==========
    case "salvar_perfil_extra": {
      const perfis = lerJSON(ARQ_PERFIL_EXTRA, {});
      perfis[dados.profissionalId] = dados.dados;
      escreverJSON(ARQ_PERFIL_EXTRA, perfis);
      return { ok: true };
    }
    case "obter_perfil_extra": {
      const perfis = lerJSON(ARQ_PERFIL_EXTRA, {});
      return perfis[dados.profissionalId] || null;
    }

    // ========== FOTOS (COM GITHUB) ==========
    case "adicionar_foto_servico": {
      const fotos = lerJSON(ARQ_FOTOS, []);
      
      // Upload para o GitHub
      const nomeArquivo = gerarNomeUnico(`foto_${dados.profissionalId}`, 'jpg');
      const resultadoUpload = uploadImagemGitHub(dados.src, 'servicos', nomeArquivo);
      
      if (!resultadoUpload.sucesso) {
        throw new Error(`Falha no upload: ${resultadoUpload.erro}`);
      }
      
      fotos.push({
        id: gerarID(),
        profissionalId: dados.profissionalId,
        src: resultadoUpload.url,
        legenda: dados.legenda || "",
        githubPath: resultadoUpload.path,
        data: new Date().toISOString()
      });
      escreverJSON(ARQ_FOTOS, fotos);
      return { ok: true, url: resultadoUpload.url };
    }
    case "listar_fotos_servico": {
      const fotos = lerJSON(ARQ_FOTOS, []);
      return fotos.filter(f => f.profissionalId === dados.profissionalId);
    }
    case "remover_foto_servico": {
      let fotos = lerJSON(ARQ_FOTOS, []);
      const fotoRemover = fotos.find(f => f.id === dados.fotoId);
      
      if (fotoRemover && fotoRemover.githubPath) {
        deletarImagemGitHub(fotoRemover.githubPath);
      }
      
      fotos = fotos.filter(f => f.id !== dados.fotoId);
      escreverJSON(ARQ_FOTOS, fotos);
      return { ok: true };
    }

    // ========== AVATAR CLIENTE (COM GITHUB) ==========
    case "upload_avatar_cliente": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      const idx = clientes.findIndex(c => c.id === dados.clienteId);
      if (idx === -1) throw new Error("Cliente não encontrado");
      
      const nomeArquivo = gerarNomeUnico(`avatar_cliente_${dados.clienteId}`, 'jpg');
      const resultadoUpload = uploadImagemGitHub(dados.imagem, 'clientes', nomeArquivo);
      
      if (!resultadoUpload.sucesso) {
        throw new Error(`Falha no upload: ${resultadoUpload.erro}`);
      }
      
      clientes[idx].avatar = resultadoUpload.url;
      escreverJSON(ARQ_CLIENTES, clientes);
      return { ok: true, url: resultadoUpload.url };
    }

    // ========== AVATAR PROFISSIONAL (COM GITHUB) ==========
    case "upload_avatar_profissional": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      const idx = profs.findIndex(p => p.id === dados.profissionalId);
      if (idx === -1) throw new Error("Profissional não encontrado");
      
      const nomeArquivo = gerarNomeUnico(`avatar_prof_${dados.profissionalId}`, 'jpg');
      const resultadoUpload = uploadImagemGitHub(dados.imagem, 'profissionais', nomeArquivo);
      
      if (!resultadoUpload.sucesso) {
        throw new Error(`Falha no upload: ${resultadoUpload.erro}`);
      }
      
      profs[idx].avatar = resultadoUpload.url;
      escreverJSON(ARQ_PROFISSIONAIS, profs);
      return { ok: true, url: resultadoUpload.url };
    }

    // ========== FOTO DE CAPA (COM GITHUB) ==========
    case "upload_cover_cliente": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      const idx = clientes.findIndex(c => c.id === dados.clienteId);
      if (idx === -1) throw new Error("Cliente não encontrado");
      
      const nomeArquivo = gerarNomeUnico(`cover_cliente_${dados.clienteId}`, 'jpg');
      const resultadoUpload = uploadImagemGitHub(dados.imagem, 'clientes/capa', nomeArquivo);
      
      if (!resultadoUpload.sucesso) {
        throw new Error(`Falha no upload: ${resultadoUpload.erro}`);
      }
      
      clientes[idx].coverPhoto = resultadoUpload.url;
      escreverJSON(ARQ_CLIENTES, clientes);
      return { ok: true, url: resultadoUpload.url };
    }
    
    case "upload_cover_profissional": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      const idx = profs.findIndex(p => p.id === dados.profissionalId);
      if (idx === -1) throw new Error("Profissional não encontrado");
      
      const nomeArquivo = gerarNomeUnico(`cover_prof_${dados.profissionalId}`, 'jpg');
      const resultadoUpload = uploadImagemGitHub(dados.imagem, 'profissionais/capa', nomeArquivo);
      
      if (!resultadoUpload.sucesso) {
        throw new Error(`Falha no upload: ${resultadoUpload.erro}`);
      }
      
      profs[idx].coverPhoto = resultadoUpload.url;
      escreverJSON(ARQ_PROFISSIONAIS, profs);
      return { ok: true, url: resultadoUpload.url };
    }

    // ========== AVALIAÇÕES ==========
    case "listar_avaliacoes": {
      const avaliacoes = lerJSON(ARQ_AVALIACOES, []);
      return avaliacoes;
    }
    case "listar_avaliacoes_profissional": {
      const avaliacoes = lerJSON(ARQ_AVALIACOES, []);
      return avaliacoes.filter(a => a.profissionalId === dados.profissionalId);
    }
    case "salvar_avaliacao": {
      const avaliacoes = lerJSON(ARQ_AVALIACOES, []);
      const nova = {
        id: gerarID(),
        profissionalId: dados.profissionalId,
        clienteEmail: dados.clienteEmail,
        clienteNome: dados.clienteNome,
        nota: dados.nota,
        comentario: dados.comentario || "",
        data: new Date().toISOString()
      };
      avaliacoes.push(nova);
      escreverJSON(ARQ_AVALIACOES, avaliacoes);
      
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      const idx = profs.findIndex(p => p.id === dados.profissionalId);
      if (idx !== -1) {
        const todasDoProf = avaliacoes.filter(a => a.profissionalId === dados.profissionalId);
        const soma = todasDoProf.reduce((acc, a) => acc + a.nota, 0);
        const media = todasDoProf.length ? soma / todasDoProf.length : 0;
        profs[idx].avaliacao = media;
        profs[idx].total_avaliacoes = todasDoProf.length;
        escreverJSON(ARQ_PROFISSIONAIS, profs);
      }
      return { ok: true };
    }

    // ========== AUTENTICAÇÃO ==========
    case "autenticar": {
      const { email, senha } = dados;
      const clientes = lerJSON(ARQ_CLIENTES, []);
      const profissionais = lerJSON(ARQ_PROFISSIONAIS, []);
      
      function senhaCorreta(senhaArmazenada, senhaDigitada) {
        try {
          const bytes = Utilities.base64Decode(senhaArmazenada);
          const decoded = Utilities.newBlob(bytes).getDataAsString();
          return decoded === senhaDigitada;
        } catch (e) {
          return senhaArmazenada === senhaDigitada;
        }
      }

      const cliente = clientes.find(c => c.email.toLowerCase() === email.toLowerCase() && senhaCorreta(c.senha, senha));
      const profissional = profissionais.find(p => p.email.toLowerCase() === email.toLowerCase() && senhaCorreta(p.senha, senha));

      if (cliente && profissional) {
        return { precisaEscolher: true, tipos: ['cliente','profissional'], cliente, profissional };
      }
      if (cliente) return { tipo: 'cliente', usuario: cliente };
      if (profissional) return { tipo: 'profissional', usuario: profissional };

      const cliExiste = clientes.find(c => c.email.toLowerCase() === email.toLowerCase());
      const profExiste = profissionais.find(p => p.email.toLowerCase() === email.toLowerCase());
      if (cliExiste || profExiste) throw new Error('Senha incorreta.');
      throw new Error('E-mail não cadastrado.');
    }

    // ========== AÇÕES ADICIONAIS (CRÉDITO/DÉBITO MANUAL) ==========
    case "creditar_saldo": {
      const { usuarioId, tipo, valor } = dados;
      if (tipo === "cliente") {
        const clientes = lerJSON(ARQ_CLIENTES, []);
        const cliente = clientes.find(c => c.id === usuarioId);
        if (!cliente) throw new Error("Cliente não encontrado");
        cliente.saldoALMA = (cliente.saldoALMA || 0) + valor;
        escreverJSON(ARQ_CLIENTES, clientes);
        return { ok: true, novoSaldo: cliente.saldoALMA };
      } else if (tipo === "profissional") {
        const profs = lerJSON(ARQ_PROFISSIONAIS, []);
        const prof = profs.find(p => p.id === usuarioId);
        if (!prof) throw new Error("Profissional não encontrado");
        prof.saldoALMA = (prof.saldoALMA || 0) + valor;
        escreverJSON(ARQ_PROFISSIONAIS, profs);
        return { ok: true, novoSaldo: prof.saldoALMA };
      }
      throw new Error("Tipo inválido");
    }
    case "debitar_saldo": {
      const { usuarioId, tipo, valor } = dados;
      if (tipo === "cliente") {
        const clientes = lerJSON(ARQ_CLIENTES, []);
        const cliente = clientes.find(c => c.id === usuarioId);
        if (!cliente) throw new Error("Cliente não encontrado");
        if ((cliente.saldoALMA || 0) < valor) throw new Error("Saldo insuficiente");
        cliente.saldoALMA -= valor;
        escreverJSON(ARQ_CLIENTES, clientes);
        return { ok: true, novoSaldo: cliente.saldoALMA };
      } else if (tipo === "profissional") {
        const profs = lerJSON(ARQ_PROFISSIONAIS, []);
        const prof = profs.find(p => p.id === usuarioId);
        if (!prof) throw new Error("Profissional não encontrado");
        if ((prof.saldoALMA || 0) < valor) throw new Error("Saldo insuficiente");
        prof.saldoALMA -= valor;
        escreverJSON(ARQ_PROFISSIONAIS, profs);
        return { ok: true, novoSaldo: prof.saldoALMA };
      }
      throw new Error("Tipo inválido");
    }

    // ========== ALTERAR SENHA ==========
    case "alterar_senha_cliente": {
      const clientes = lerJSON(ARQ_CLIENTES, []);
      const idx = clientes.findIndex(c => c.id === dados.id);
      if (idx === -1) throw new Error("Cliente não encontrado");
      clientes[idx].senha = Utilities.base64Encode(dados.novaSenha);
      escreverJSON(ARQ_CLIENTES, clientes);
      return { ok: true };
    }
    
    case "alterar_senha_profissional": {
      const profs = lerJSON(ARQ_PROFISSIONAIS, []);
      const idx = profs.findIndex(p => p.id === dados.id);
      if (idx === -1) throw new Error("Profissional não encontrado");
      profs[idx].senha = Utilities.base64Encode(dados.novaSenha);
      escreverJSON(ARQ_PROFISSIONAIS, profs);
      return { ok: true };
    }

    default:
      throw new Error(`Ação desconhecida: ${acao}`);
  }
}

// ==========================================
// CONFIGURAR TRIGGER (executar uma vez)
// ==========================================
function configurarTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "processarFila") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  ScriptApp.newTrigger("processarFila")
    .timeBased()
    .everyMinutes(1)
    .create();
  
  console.log("✅ Trigger configurado: processarFila será executado a cada 1 minuto");
}

// ==========================================
// FUNÇÃO DE TESTE RÁPIDO
// ==========================================
function testarBackend() {
  console.log("🧪 Testando backend...");
  
  const init = inicializarSistema();
  console.log("Inicialização:", init);
  
  configurarTrigger();
  
  const estrutura = verificarEstrutura();
  console.log("Estrutura:", estrutura);
  
  return {
    inicializacao: init,
    estrutura: estrutura,
    triggerConfigurado: true
  };
}