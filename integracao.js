// integracao.js — ATUALIZADO PARA VERSÃO 10
// BACKEND: Google Apps Script com suporte a GitHub para imagens

// ATUALIZE ESTA LINHA COM A URL DA VERSÃO 10
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxfKvLCzw__nCnmQcxYqqvJ1a36BM3z14XtLp624fTtF1UmmLyTFRWSIFqueC9wxhUZog/exec";

// ========== FUNÇÃO BASE COM POLLING E TIMEOUT ==========
async function callBackend(acao, dados = {}, timeoutSegundos = 45) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSegundos * 1000);
  
  try {
    // Preparar os dados no formato que o GAS gosta (x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append('data', JSON.stringify({ acao, dados }));

    const response = await fetch(BACKEND_URL, {
      method: "POST",
      mode: "cors",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded" 
      },
      body: formData.toString(),
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    
    const postResult = await response.json();
    
    if (!postResult.ok) {
      throw new Error(postResult.erro || "Erro interno no servidor");
    }

    return postResult;

  } catch (err) {
    console.error("❌ Falha na comunicação:", err.message);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ========== CLIENTES ==========
async function obterTodosClientes() {
  try {
    return await callBackend("listar_clientes", {}, 45);
  } catch (err) {
    console.error("Erro ao listar clientes:", err);
    return [];
  }
}

async function salvarNovoCliente(cliente) {
  try {
    const resultado = await callBackend("cadastrar_cliente", cliente, 45);
    return resultado?.id !== undefined;
  } catch (err) {
    console.error("Erro ao salvar cliente:", err);
    return false;
  }
}

async function buscarClientePorEmail(email) {
  try {
    return await callBackend("buscar_cliente_por_email", { email });
  } catch (err) {
    console.error("Erro ao buscar cliente por email:", err);
    return null;
  }
}

async function buscarClientePorId(id) {
  try {
    return await callBackend("buscar_cliente_por_id", { id });
  } catch (err) {
    console.error("Erro ao buscar cliente por ID:", err);
    return null;
  }
}

async function atualizarCliente(dados) {
  const resultado = await callBackend("atualizar_cliente", dados);
  return resultado?.ok === true;
}

// ========== PROFISSIONAIS ==========
async function obterTodosProfissionais() {
  try {
    return await callBackend("listar_profissionais", {}, 45);
  } catch (err) {
    console.error("Erro ao listar profissionais:", err);
    return [];
  }
}

async function salvarNovoProfissional(profissional) {
  try {
    const resultado = await callBackend("cadastrar_profissional", profissional, 45);
    return resultado?.id !== undefined;
  } catch (err) {
    console.error("Erro ao salvar profissional:", err);
    return false;
  }
}

async function buscarProfissionalPorEmail(email) {
  try {
    return await callBackend("buscar_profissional_por_email", { email });
  } catch (err) {
    console.error("Erro ao buscar profissional por email:", err);
    return null;
  }
}

async function buscarProfissionalPorId(id) {
  try {
    return await callBackend("buscar_profissional_por_id", { id });
  } catch (err) {
    console.error("Erro ao buscar profissional por ID:", err);
    return null;
  }
}

async function atualizarProfissional(dados) {
  const resultado = await callBackend("atualizar_profissional", dados);
  return resultado?.ok === true;
}

// ========== SERVIÇOS (locais, vindos de dados.js) ==========
function obterServicos() {
  if (typeof PROFISSOES_DATA === "undefined") {
    console.warn("PROFISSOES_DATA não definido");
    return [];
  }
  return PROFISSOES_DATA.filter(s => s.ativo !== false).map(s => ({
    ...s,
    preco_unitario: parseFloat((s.diaria_base / s.producao_dia).toFixed(2)),
    tempo_por_unidade_h: s.tempo_por_unidade_h || parseFloat((8 / s.producao_dia).toFixed(2))
  }));
}

function obterServicoPorId(id) {
  return obterServicos().find(s => s.id === id);
}

// ========== SESSÃO (localStorage) ==========
function salvarSessao(email, tipo, id) {
  const sess = {
    email: email.toLowerCase(),
    tipo,
    usuarioId: id,
    expira: Date.now() + 8 * 3600000,
    autenticado: true
  };
  localStorage.setItem("alma_session", JSON.stringify(sess));
}

function obterSessao() {
  const raw = localStorage.getItem("alma_session");
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s.autenticado || !s.expira || Date.now() > s.expira) {
      localStorage.removeItem("alma_session");
      return null;
    }
    return s;
  } catch (e) {
    localStorage.removeItem("alma_session");
    return null;
  }
}

function limparSessao() {
  localStorage.removeItem("alma_session");
}

// ========== AUTENTICAÇÃO ==========
async function autenticarUsuarioComSenha(email, senha) {
  try {
    const result = await callBackend("autenticar", { email, senha }, 30);
    
    if (!result.ok) {
      return { success: false, error: result.erro || 'E-mail ou senha incorretos.' };
    }
    
    if (result.precisaEscolher) {
      return {
        success: true,
        precisaEscolher: true,
        tipos: result.tipos || ['cliente', 'profissional'],
        cliente: result.cliente,
        profissional: result.profissional
      };
    }
    
    if (result.tipo && result.usuario) {
      salvarSessao(email, result.tipo, result.usuario.id);
    }
    
    return { success: true, tipo: result.tipo, usuario: result.usuario };
  } catch (err) {
    return { success: false, error: err.message || 'Erro de comunicação.' };
  }
}

// ========== TOKEN ALMA (saldo) ==========
async function getTokenBalance(userId, tipo = "cliente") {
  try {
    const resultado = await callBackend("obter_saldo", { usuarioId: userId, tipo }, 30);
    return resultado?.saldo || 0;
  } catch (err) {
    console.error("Erro ao obter saldo:", err);
    return 0;
  }
}

// ========== CHATS ==========
async function obterChats() {
  try {
    return await callBackend("listar_chats", {}, 45);
  } catch (err) {
    console.error("Erro ao listar chats:", err);
    return [];
  }
}

async function salvarChat(chat) {
  const resultado = await callBackend("salvar_chat", { chat });
  return resultado?.ok === true;
}

async function criarChat(dados) {
  return await callBackend("criar_chat", dados, 45);
}

// ========== RECARGAS ==========
async function obterSolicitacoesRecarga() {
  try {
    return await callBackend("listar_solicitacoes_recarga", {}, 45);
  } catch (err) {
    console.error("Erro ao listar solicitações de recarga:", err);
    return [];
  }
}

async function salvarSolicitacaoRecarga(solicitacao) {
  const resultado = await callBackend("salvar_solicitacao_recarga", { solicitacao });
  return resultado?.ok === true;
}

// ========== TRANSAÇÕES ==========
async function obterTransacoes() {
  try {
    return await callBackend("listar_transacoes", {}, 45);
  } catch (err) {
    console.error("Erro ao listar transações:", err);
    return [];
  }
}

async function salvarTransacao(transacao) {
  const resultado = await callBackend("salvar_transacao", { transacao });
  return resultado?.ok === true;
}

// ========== TOKENS DE SERVIÇO ==========
async function gerarTokenInicio(chatId, clienteId, profissionalId) {
  return await callBackend("gerar_token_inicio", { chatId, clienteId, profissionalId });
}

async function validarTokenInicio(token, chatId, profissionalId) {
  await callBackend("validar_token_inicio", { token, chatId, profissionalId });
  return true;
}

async function gerarTokenFim(chatId, clienteId) {
  return await callBackend("gerar_token_fim", { chatId, clienteId });
}

async function validarTokenFim(token, chatId, profissionalId) {
  await callBackend("validar_token_fim", { token, chatId, profissionalId });
  return true;
}

// ========== PERFIL EXTRA ==========
async function salvarPerfilExtra(profissionalId, dados) {
  const resultado = await callBackend("salvar_perfil_extra", { profissionalId, dados });
  return resultado?.ok === true;
}

async function obterPerfilExtra(profissionalId) {
  try {
    return await callBackend("obter_perfil_extra", { profissionalId });
  } catch (err) {
    console.error("Erro ao obter perfil extra:", err);
    return null;
  }
}

// ========== FOTOS (COM GITHUB) ==========
async function adicionarFotoServico(profissionalId, src, legenda) {
  const resultado = await callBackend("adicionar_foto_servico", { profissionalId, src, legenda });
  return resultado?.ok === true;
}

async function listarFotosServico(profissionalId) {
  try {
    return await callBackend("listar_fotos_servico", { profissionalId });
  } catch (err) {
    console.error("Erro ao listar fotos:", err);
    return [];
  }
}

async function removerFotoServico(fotoId) {
  const resultado = await callBackend("remover_foto_servico", { fotoId });
  return resultado?.ok === true;
}

// ========== AVATAR E COVER (UPLOAD VIA GITHUB) ==========
async function uploadAvatarCliente(clienteId, imagemBase64) {
  const resultado = await callBackend("upload_avatar_cliente", { clienteId, imagem: imagemBase64 });
  return resultado?.ok === true ? resultado.url : null;
}

async function uploadAvatarProfissional(profissionalId, imagemBase64) {
  const resultado = await callBackend("upload_avatar_profissional", { profissionalId, imagem: imagemBase64 });
  return resultado?.ok === true ? resultado.url : null;
}

async function uploadCoverCliente(clienteId, imagemBase64) {
  const resultado = await callBackend("upload_cover_cliente", { clienteId, imagem: imagemBase64 });
  return resultado?.ok === true ? resultado.url : null;
}

async function uploadCoverProfissional(profissionalId, imagemBase64) {
  const resultado = await callBackend("upload_cover_profissional", { profissionalId, imagem: imagemBase64 });
  return resultado?.ok === true ? resultado.url : null;
}

// ========== AVALIAÇÕES ==========
async function obterAvaliacoes() {
  try {
    return await callBackend("listar_avaliacoes", {}, 45);
  } catch (err) {
    console.error("Erro ao listar avaliações:", err);
    return [];
  }
}

async function obterAvaliacoesProfissional(profissionalId) {
  try {
    return await callBackend("listar_avaliacoes_profissional", { professionalId: profissionalId });
  } catch (err) {
    console.error("Erro ao listar avaliações do profissional:", err);
    return [];
  }
}

async function salvarAvaliacao(profissionalId, clienteEmail, clienteNome, nota, comentario) {
  const resultado = await callBackend("salvar_avaliacao", { profissionalId, clienteEmail, clienteNome, nota, comentario });
  return resultado?.ok === true;
}

// ========== ALTERAR SENHA ==========
async function alterarSenhaCliente(clienteId, novaSenha) {
  const resultado = await callBackend("alterar_senha_cliente", { id: clienteId, novaSenha });
  return resultado?.ok === true;
}

async function alterarSenhaProfissional(profissionalId, novaSenha) {
  const resultado = await callBackend("alterar_senha_profissional", { id: profissionalId, novaSenha });
  return resultado?.ok === true;
}

// ========== CRÉDITO/DÉBITO MANUAL ==========
async function creditarSaldo(usuarioId, tipo, valor) {
  const resultado = await callBackend("creditar_saldo", { usuarioId, tipo, valor });
  return resultado?.ok === true;
}

async function debitarSaldo(usuarioId, tipo, valor) {
  const resultado = await callBackend("debitar_saldo", { usuarioId, tipo, valor });
  return resultado?.ok === true;
}

// ========== FUNÇÃO PARA TESTAR CONEXÃO COM O BACKEND ==========
async function testarConexaoBackend() {
  try {
    console.log("🔌 Testando conexão com o backend...");
    const resultado = await callBackend("listar_clientes", {}, 30);
    console.log("✅ Conexão com backend OK! Clientes obtidos:", resultado?.length || 0);
    return { sucesso: true, mensagem: "Backend conectado com sucesso" };
  } catch (err) {
    console.error("❌ Erro na conexão com backend:", err.message);
    return { sucesso: false, erro: err.message };
  }
}

// ========== FUNÇÃO PARA INICIALIZAR O SISTEMA ==========
async function inicializarSistemaBackend() {
  try {
    console.log("🚀 Inicializando sistema no backend...");
    const clientes = await obterTodosClientes();
    console.log("✅ Sistema backend OK. Clientes existentes:", clientes.length);
    return { sucesso: true, clientesExistentes: clientes.length };
  } catch (err) {
    console.error("❌ Erro na inicialização do backend:", err.message);
    return { sucesso: false, erro: err.message };
  }
}

console.log("✅ integracao.js — backend versão 10 com GitHub para imagens");
console.log("📍 Backend URL:", BACKEND_URL);