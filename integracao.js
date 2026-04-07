// ========== CONFIGURAÇÃO ==========
// NOVA URL DO APPSCRIPT - VERSÃO 12 (06/04/2026)
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxUJlF-zsFBSHHVTV2tVt7MmnAuGSjniBZD0zhEqG4fbrEvuLfMEihj_i7BM5DMhDvEew/exec";

// ⚠️ SUA API KEY DO IMGBB ⚠️
const IMGBB_API_KEY = "2597fbdd4014975ed01d56ee9a6b404d";

// ========== FUNÇÃO BASE COM POLLING E TIMEOUT ==========
async function callBackend(acao, dados = {}, timeoutSegundos = 45) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSegundos * 1000);
  
  try {
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

// ========== FUNÇÕES DE IMAGEM (IMGBB) ==========

/**
 * Compressão de imagem antes do upload
 */
function compressImage(base64, maxWidth = 800, quality = 0.7, callback) {
    const img = new Image();
    img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = base64;
}

/**
 * Faz upload de uma imagem para o ImgBB e retorna a URL pública
 */
async function uploadParaImgBB(base64Image) {
    try {
        let imageData = base64Image;
        if (base64Image.includes(',')) {
            imageData = base64Image.split(',')[1];
        }
        
        const formData = new FormData();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageData);
        
        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Upload ImgBB realizado com sucesso:', result.data.url);
            return result.data.url;
        } else {
            throw new Error(result.error?.message || 'Falha no upload para ImgBB');
        }
    } catch (err) {
        console.error('❌ Erro no upload para ImgBB:', err);
        throw err;
    }
}

/**
 * Upload de arquivo com compressão e envio para ImgBB
 */
async function uploadImageToHost(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        if (file.size > 5 * 1024 * 1024) {
            reject(new Error('Imagem muito grande. Máximo 5MB.'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            compressImage(ev.target.result, maxWidth, quality, async (compressedBase64) => {
                try {
                    const url = await uploadParaImgBB(compressedBase64);
                    resolve(url);
                } catch (err) {
                    reject(err);
                }
            });
        };
        reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
        reader.readAsDataURL(file);
    });
}

/**
 * Testa a conexão com o ImgBB
 */
async function testarImgBB() {
    try {
        const testPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        const url = await uploadParaImgBB(testPixel);
        console.log("✅ Teste ImgBB OK! URL:", url);
        return { sucesso: true, url: url };
    } catch (err) {
        console.error("❌ Teste ImgBB falhou:", err.message);
        return { sucesso: false, erro: err.message };
    }
}

// ========== FUNÇÕES DE FOTO (com ImgBB) ==========

/**
 * Adiciona foto do serviço - faz upload para ImgBB e salva URL no backend
 */
async function adicionarFotoServico(profissionalId, imagemBase64, legenda) {
    try {
        const imageUrl = await uploadParaImgBB(imagemBase64);
        
        const resultado = await callBackend("adicionar_foto_servico", { 
            profissionalId, 
            src: imageUrl,
            legenda 
        });
        return resultado?.ok === true;
    } catch (err) {
        console.error("Erro ao adicionar foto:", err);
        return false;
    }
}

/**
 * Lista fotos do serviço (retorna URLs do ImgBB)
 */
async function listarFotosServico(profissionalId) {
  try {
    const resultado = await callBackend("listar_fotos_servico", { profissionalId });
    if (resultado?.ok && Array.isArray(resultado.id)) return resultado.id;
    if (Array.isArray(resultado)) return resultado;
    return [];
  } catch (err) {
    console.error("Erro ao listar fotos:", err);
    return [];
  }
}

/**
 * Remove foto do serviço
 */
async function removerFotoServico(fotoId) {
    const resultado = await callBackend("remover_foto_servico", { fotoId });
    return resultado?.ok === true;
}

/**
 * Upload de foto de perfil (avatar ou capa)
 */
async function uploadFotoPerfil(imagemBase64, tipo, profissionalId) {
    try {
        const imageUrl = await uploadParaImgBB(imagemBase64);
        
        const resultado = await callBackend("atualizar_foto_perfil", {
            profissionalId,
            tipo: tipo,
            url: imageUrl
        });
        
        return { success: resultado?.ok === true, url: imageUrl };
    } catch (err) {
        console.error("Erro ao atualizar foto de perfil:", err);
        return { success: false, error: err.message };
    }
}

// ========== CLIENTES ==========
async function obterTodosClientes() {
  try {
    const resultado = await callBackend("listar_clientes", {}, 45);
    if (resultado?.ok && Array.isArray(resultado.id)) return resultado.id;
    if (Array.isArray(resultado)) return resultado;
    return [];
  } catch (err) {
    console.error("Erro ao listar clientes:", err);
    return [];
  }
}

async function salvarNovoCliente(cliente) {
  try {
    const resultado = await callBackend("cadastrar_cliente", cliente, 45);
    return resultado?.ok === true;
  } catch (err) {
    console.error("Erro ao salvar cliente:", err);
    return false;
  }
}

async function buscarClientePorEmail(email) {
  try {
    const resultado = await callBackend("buscar_cliente_por_email", { email });
    if (resultado?.ok && resultado.id && typeof resultado.id === 'object') return resultado.id;
    return null;
  } catch (err) {
    console.error("Erro ao buscar cliente por email:", err);
    return null;
  }
}

async function buscarClientePorId(id) {
  try {
    const resultado = await callBackend("buscar_cliente_por_id", { id });
    if (resultado?.ok && resultado.id && typeof resultado.id === 'object') return resultado.id;
    return null;
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
  let fixos = [];
  if (typeof PROFISSIONAIS_DATA !== 'undefined' && Array.isArray(PROFISSIONAIS_DATA)) {
    fixos = PROFISSIONAIS_DATA;
  }

  let doBackend = [];
  try {
    const resultado = await callBackend("listar_profissionais", {}, 45);
    if (resultado?.ok && Array.isArray(resultado.id)) {
      doBackend = resultado.id;
    } else if (Array.isArray(resultado)) {
      doBackend = resultado;
    }
  } catch (err) {
    console.error("Erro ao listar profissionais do backend:", err);
  }

  const emailsBackend = new Set(doBackend.map(p => (p.email || '').toLowerCase()));
  const fixosFiltrados = fixos.filter(f => !emailsBackend.has((f.email || '').toLowerCase()));
  return [...doBackend, ...fixosFiltrados];
}

async function salvarNovoProfissional(profissional) {
  try {
    const resultado = await callBackend("cadastrar_profissional", profissional, 45);
    return resultado?.ok === true;
  } catch (err) {
    console.error("Erro ao salvar profissional:", err);
    return false;
  }
}

async function buscarProfissionalPorEmail(email) {
  try {
    const resultado = await callBackend("buscar_profissional_por_email", { email });
    if (resultado?.ok && resultado.id && typeof resultado.id === 'object') return resultado.id;
  } catch (err) {
    console.error("Erro ao buscar profissional por email:", err);
  }
  if (typeof PROFISSIONAIS_DATA !== 'undefined') {
    return PROFISSIONAIS_DATA.find(p => (p.email || '').toLowerCase() === email.toLowerCase()) || null;
  }
  return null;
}

async function buscarProfissionalPorId(id) {
  try {
    const resultado = await callBackend("buscar_profissional_por_id", { id });
    if (resultado?.ok && resultado.id && typeof resultado.id === 'object') return resultado.id;
  } catch (err) {
    console.error("Erro ao buscar profissional por ID:", err);
  }
  if (typeof PROFISSIONAIS_DATA !== 'undefined') {
    return PROFISSIONAIS_DATA.find(p => p.id === id) || null;
  }
  return null;
}

async function atualizarProfissional(dados) {
  const resultado = await callBackend("atualizar_profissional", dados);
  return resultado?.ok === true;
}

// ========== SERVIÇOS ==========
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

// ========== SESSÃO ==========
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

// ========== TOKEN ALMA ==========
async function getTokenBalance(userId, tipo = "cliente") {
  try {
    const resultado = await callBackend("obter_saldo", { usuarioId: userId, tipo }, 30);
    if (resultado?.ok && resultado.id?.saldo !== undefined) return resultado.id.saldo;
    if (resultado?.saldo !== undefined) return resultado.saldo;
    return 0;
  } catch (err) {
    console.error("Erro ao obter saldo:", err);
    return 0;
  }
}

// ========== CHATS ==========
async function obterChats() {
  try {
    const resultado = await callBackend("listar_chats", {}, 45);
    if (resultado?.ok && Array.isArray(resultado.id)) return resultado.id;
    if (Array.isArray(resultado)) return resultado;
    return [];
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
  const resultado = await callBackend("criar_chat", dados, 45);
  if (resultado?.ok && resultado.id && typeof resultado.id === 'object') {
    return resultado.id;
  }
  throw new Error(resultado?.erro || 'Erro ao criar chat');
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
    const resultado = await callBackend("listar_transacoes", {}, 45);
    if (resultado?.ok && Array.isArray(resultado.id)) return resultado.id;
    if (Array.isArray(resultado)) return resultado;
    return [];
  } catch (err) {
    console.error("Erro ao listar transações:", err);
    return [];
  }
}

async function salvarTransacao(transacao) {
  const resultado = await callBackend("salvar_transacao", { transacao });
  return resultado?.ok === true;
}

// ========== APROVAR RECARGA ==========
async function aprovarRecarga(clienteId, valor, solicitacaoId) {
  const resultado = await callBackend("aprovar_recarga", { clienteId, valor, solicitacaoId }, 30);
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
    const resultado = await callBackend("obter_perfil_extra", { profissionalId });
    if (resultado?.ok && resultado.id && typeof resultado.id === 'object') return resultado.id;
    return null;
  } catch (err) {
    console.error("Erro ao obter perfil extra:", err);
    return null;
  }
}

// ========== AVALIAÇÕES ==========
async function obterAvaliacoesProfissional(profissionalId) {
  try {
    const resultado = await callBackend("listar_avaliacoes_profissional", { profissionalId });
    if (resultado?.ok && Array.isArray(resultado.id)) return resultado.id;
    if (Array.isArray(resultado)) return resultado;
    return [];
  } catch (err) {
    console.error("Erro ao listar avaliações:", err);
    return [];
  }
}

async function salvarAvaliacao(profissionalId, clienteEmail, clienteNome, nota, comentario) {
  const resultado = await callBackend("salvar_avaliacao", { profissionalId, clienteEmail, clienteNome, nota, comentario });
  return resultado?.ok === true;
}

// ========== ALTERAR SENHA ==========
async function alterarSenhaProfissional(id, novaSenha) {
  try {
    const resultado = await callBackend("alterar_senha_profissional", { id, novaSenha }, 30);
    return resultado?.ok === true;
  } catch (err) {
    console.error("Erro ao alterar senha do profissional:", err);
    return false;
  }
}

async function alterarSenhaCliente(id, novaSenha) {
  try {
    const resultado = await callBackend("alterar_senha_cliente", { id, novaSenha }, 30);
    return resultado?.ok === true;
  } catch (err) {
    console.error("Erro ao alterar senha do cliente:", err);
    return false;
  }
}

// ========== TESTES ==========
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

async function inicializarSistemaBackend() {
  try {
    console.log("🚀 Inicializando sistema no backend...");
    const clientes = await obterTodosClientes();
    console.log("✅ Sistema backend OK. Clientes existentes:", clientes.length);
    
    const imgbbTest = await testarImgBB();
    if (imgbbTest.sucesso) {
      console.log("✅ ImgBB configurado corretamente!");
    } else {
      console.warn("⚠️ ImgBB com problemas:", imgbbTest.erro);
    }
    
    return { sucesso: true, clientesExistentes: clientes.length, imgbb: imgbbTest };
  } catch (err) {
    console.error("❌ Erro na inicialização do backend:", err.message);
    return { sucesso: false, erro: err.message };
  }
}

async function salvarDisponibilidadeBackend(profissionalId, dias) {
    try {
        const perfilAtual = await obterPerfilExtra(profissionalId) || {};
        perfilAtual.disponibilidade = dias;
        const resultado = await callBackend("salvar_perfil_extra", { 
            profissionalId, 
            dados: perfilAtual 
        }, 30);
        return resultado?.ok === true;
    } catch (err) {
        console.log('Backend não suporta salvar disponibilidade, apenas localStorage');
        return false;
    }
}

// ========== ADMIN ROOT (comunicação segura com AppScript) ==========

// Função para login automático do admin (chama o backend)
async function loginAdminRoot() {
  try {
    const resultado = await callBackend("admin_login_root", {}, 30);
    
    if (resultado?.ok && resultado.id) {
      // Salva sessão do admin
      salvarSessao(resultado.id.email, "cliente", resultado.id.id);
      console.log("✅ Admin Root logado com sucesso!");
      return { success: true, usuario: resultado.id };
    }
    
    return { success: false, error: resultado?.erro || "Falha ao logar como admin" };
  } catch (err) {
    console.error("Erro ao logar admin root:", err);
    return { success: false, error: err.message };
  }
}

// Função para verificar se o usuário logado é admin
async function isAdminRoot() {
  const sess = obterSessao();
  if (!sess) return false;
  
  try {
    const resultado = await callBackend("admin_verificar", { email: sess.email }, 15);
    return resultado?.ok === true && resultado?.isAdmin === true;
  } catch {
    return false;
  }
}

// Função para obter token de admin (para abrir chats)
async function getAdminToken() {
  try {
    const resultado = await callBackend("admin_gerar_token", {}, 15);
    if (resultado?.ok && resultado.token) {
      return resultado.token;
    }
    return null;
  } catch (err) {
    console.error("Erro ao gerar token admin:", err);
    return null;
  }
}

// Função para validar token de admin
async function validarAdminToken(token) {
  try {
    const resultado = await callBackend("admin_validar_token", { token }, 15);
    return resultado?.ok === true;
  } catch {
    return false;
  }
}

// Função para obter dados do admin (sem expor senha)
async function getAdminInfo() {
  try {
    const resultado = await callBackend("admin_info", {}, 15);
    if (resultado?.ok && resultado.id) {
      return {
        id: resultado.id.id,
        nome: resultado.id.nome,
        email: resultado.id.email,
        root: true
      };
    }
    return null;
  } catch (err) {
    console.error("Erro ao obter info admin:", err);
    return null;
  }
}

console.log("✅ integracao.js — backend com ImgBB para imagens");
console.log("📍 Backend URL:", BACKEND_URL);
console.log("🖼️ ImgBB API Key configurada:", IMGBB_API_KEY ? "✅ Sim" : "❌ Não");
console.log("👑 Admin Root configurado no backend (seguro)");
console.log("📊 Com suporte a TRANSAÇÕES e APROVAÇÃO DE RECARGAS");
