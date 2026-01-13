import { useEffect, useState, useRef } from "react";
import { auth, db } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "firebase/auth";
import { 
  doc, onSnapshot, updateDoc, arrayUnion, 
  collection, query, orderBy, getDocs, addDoc,
  deleteDoc, writeBatch
} from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Sparkles, Send, MessageSquare, ShieldCheck, LogOut,
  PlusCircle, Trash2, Clock, MessageCircle, User,
  ChevronRight, Bot, Save, FolderOpen, Menu, X,
  Check, CheckSquare, Square, Trash, AlertCircle,
  ListFilter  // ← Use este ou outro ícone similar
} from "lucide-react";

// Configuração da IA
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function App() {
  // Estados do usuário
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");
  
  // Estados do chat
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  
  // Novos estados para histórico
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [conversationName, setConversationName] = useState("Nova Conversa");
  const [isRenaming, setIsRenaming] = useState(false);
  
  // Estado para sidebar mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Estados para deleção em massa
  const [selectedConversations, setSelectedConversations] = useState([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Referências do Firestore
  const userConversationsRef = user ? collection(db, "users", user.uid, "conversations") : null;
  const currentConversationRef = currentConversationId 
    ? doc(db, "users", user?.uid, "conversations", currentConversationId)
    : null;

  // Efeito para autenticação
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // Efeito para carregar conversas do usuário
  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      try {
        const q = query(userConversationsRef, orderBy("updatedAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        const loadedConversations = [];
        querySnapshot.forEach((doc) => {
          loadedConversations.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        setConversations(loadedConversations);
        
        // Se não há conversas, cria uma nova
        if (loadedConversations.length === 0) {
          await createNewConversation();
        } else {
          // Carrega a última conversa
          const lastConversation = loadedConversations[0];
          setCurrentConversationId(lastConversation.id);
          setConversationName(lastConversation.name);
          setMessages(lastConversation.messages || []);
        }
        
        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar conversas:", error);
        setLoading(false);
      }
    };

    loadConversations();
  }, [user]);

  // Efeito para scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Função para criar nova conversa
  const createNewConversation = async () => {
    if (!user) return;

    try {
      const newConversation = {
        name: "Nova Conversa",
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: user.uid
      };

      const docRef = await addDoc(userConversationsRef, newConversation);
      
      setCurrentConversationId(docRef.id);
      setConversationName("Nova Conversa");
      setMessages([]);
      setIsSidebarOpen(false); // Fecha sidebar no mobile
      
      // Atualiza lista de conversas
      setConversations(prev => [{
        id: docRef.id,
        ...newConversation
      }, ...prev]);
      
      console.log("✅ Nova conversa criada:", docRef.id);
    } catch (error) {
      console.error("❌ Erro ao criar conversa:", error);
    }
  };

  // Função para carregar conversa existente
  const loadConversation = async (conversationId, conversationName) => {
    if (isSelectMode) {
      toggleSelectConversation(conversationId);
      return;
    }
    
    try {
      setCurrentConversationId(conversationId);
      setConversationName(conversationName);
      setMessages([]);
      setLoading(true);
      setIsSidebarOpen(false); // Fecha sidebar no mobile
      
      const conversationDoc = doc(db, "users", user.uid, "conversations", conversationId);
      const unsubscribe = onSnapshot(conversationDoc, (docSnap) => {
        if (docSnap.exists()) {
          setMessages(docSnap.data().messages || []);
        }
        setLoading(false);
      });
      
      return () => unsubscribe();
    } catch (error) {
      console.error("❌ Erro ao carregar conversa:", error);
      setLoading(false);
    }
  };

  // Função para deletar conversa individual
  const deleteConversation = async (conversationId, e) => {
    e.stopPropagation(); // Evita carregar a conversa ao clicar no lixo
    
    if (window.confirm("Tem certeza que deseja excluir esta conversa?")) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "conversations", conversationId));
        
        // Remove da lista local
        setConversations(prev => prev.filter(conv => conv.id !== conversationId));
        
        // Remove da seleção se estiver selecionada
        setSelectedConversations(prev => prev.filter(id => id !== conversationId));
        
        // Se era a conversa atual, cria uma nova
        if (conversationId === currentConversationId) {
          await createNewConversation();
        }
        
        console.log("🗑️ Conversa excluída:", conversationId);
      } catch (error) {
        console.error("❌ Erro ao excluir conversa:", error);
        alert("Erro ao excluir conversa. Tente novamente.");
      }
    }
  };

  // FUNÇÕES PARA SELEÇÃO EM MASSA

  // Alternar seleção de uma conversa
  const toggleSelectConversation = (conversationId) => {
    setSelectedConversations(prev => {
      if (prev.includes(conversationId)) {
        return prev.filter(id => id !== conversationId);
      } else {
        return [...prev, conversationId];
      }
    });
  };

  // Selecionar todas as conversas
  const selectAllConversations = () => {
    if (selectedConversations.length === conversations.length) {
      // Se todas já estão selecionadas, desmarca todas
      setSelectedConversations([]);
    } else {
      // Seleciona todas
      setSelectedConversations(conversations.map(conv => conv.id));
    }
  };

  // Deletar conversas selecionadas
  const deleteSelectedConversations = async () => {
    if (selectedConversations.length === 0) return;
    
    try {
      // Usa batch para deletar múltiplos documentos de uma vez
      const batch = writeBatch(db);
      
      selectedConversations.forEach(conversationId => {
        const conversationRef = doc(db, "users", user.uid, "conversations", conversationId);
        batch.delete(conversationRef);
      });
      
      await batch.commit();
      
      // Remove das conversas locais
      setConversations(prev => prev.filter(conv => !selectedConversations.includes(conv.id)));
      
      // Se a conversa atual foi deletada, cria uma nova
      if (selectedConversations.includes(currentConversationId)) {
        await createNewConversation();
      }
      
      // Limpa seleção e sai do modo seleção
      setSelectedConversations([]);
      setIsSelectMode(false);
      setShowDeleteModal(false);
      
      console.log(`🗑️ ${selectedConversations.length} conversas excluídas com sucesso!`);
      
    } catch (error) {
      console.error("❌ Erro ao excluir conversas em massa:", error);
      alert("Erro ao excluir conversas. Tente novamente.");
    }
  };

  // Entrar/sair do modo seleção
  const toggleSelectMode = () => {
    if (isSelectMode) {
      // Sair do modo seleção - limpa seleção
      setSelectedConversations([]);
    }
    setIsSelectMode(!isSelectMode);
  };

  // Cancelar seleção
  const cancelSelection = () => {
    setSelectedConversations([]);
    setIsSelectMode(false);
  };

  // Função para renomear conversa
  const renameConversation = async () => {
    if (!currentConversationId || !isRenaming) return;
    
    try {
      await updateDoc(currentConversationRef, {
        name: conversationName,
        updatedAt: new Date().toISOString()
      });
      
      // Atualiza na lista local
      setConversations(prev => prev.map(conv => 
        conv.id === currentConversationId 
          ? { ...conv, name: conversationName } 
          : conv
      ));
      
      setIsRenaming(false);
      console.log("✏️ Conversa renomeada para:", conversationName);
    } catch (error) {
      console.error("❌ Erro ao renomear conversa:", error);
    }
  };

  // Função de autenticação
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setAuthError("Erro: Verifique email e senha (mínimo 6 dígitos).");
    }
  };

  // Função para enviar mensagem
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user || isTyping || !currentConversationId) return;

    const textoUsuario = input.trim();
    setInput("");

    // Cria mensagem do usuário
    const msgUsuario = {
      id: Date.now() + "_user",
      text: textoUsuario,
      sender: "user",
      senderEmail: user.email,
      timestamp: new Date().toISOString()
    };

    // Atualiza estado local
    const updatedMessages = [...messages, msgUsuario];
    setMessages(updatedMessages);

    // Salva no Firebase
    try {
      await updateDoc(currentConversationRef, {
        messages: arrayUnion(msgUsuario),
        updatedAt: new Date().toISOString()
      });

      // Se for a primeira mensagem, usa como nome da conversa
      if (messages.length === 0 && conversationName === "Nova Conversa") {
        const autoName = textoUsuario.length > 30 
          ? textoUsuario.substring(0, 30) + "..." 
          : textoUsuario;
        setConversationName(autoName);
        await updateDoc(currentConversationRef, {
          name: autoName,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("❌ Erro ao salvar mensagem:", error);
    }

    // Chama a IA
    setIsTyping(true);
    
    try {
      const prompt = `Você é a Gwen, uma assistente amigável e útil. 
      Histórico: ${updatedMessages.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n')}
      
      Responda de forma útil e agradável ao usuário: "${textoUsuario}"`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const textoGwen = response.text();

      // Cria mensagem da Gwen
      const msgGwen = {
        id: Date.now() + "_gwen",
        text: textoGwen,
        sender: "assistant",
        senderName: "Gwen AI",
        timestamp: new Date().toISOString()
      };

      // Atualiza estado local
      setMessages(prev => [...prev, msgGwen]);
      
      // Salva resposta no Firebase
      await updateDoc(currentConversationRef, {
        messages: arrayUnion(msgGwen),
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ ERRO NA IA:", error);
      
      const errorMsg = {
        id: Date.now() + "_error",
        text: "Desculpe, estou com problemas técnicos. Tente novamente em alguns instantes.",
        sender: "system",
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMsg]);
      await updateDoc(currentConversationRef, {
        messages: arrayUnion(errorMsg)
      });
      
    } finally {
      setIsTyping(false);
    }
  };

  // Tela de loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <Sparkles className="animate-pulse mx-auto mb-4" size={48} />
          <p className="text-base sm:text-lg">Carregando Gwen AI...</p>
        </div>
      </div>
    );
  }

  // Tela de login
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex justify-center mb-6 text-purple-600">
            <Sparkles size={40} className="sm:size-[48px]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-center text-slate-800 mb-2">
            {isRegistering ? "Criar Conta" : "Entrar"}
          </h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-3 border rounded-xl text-sm sm:text-base" 
              placeholder="Email" 
              required 
            />
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-3 border rounded-xl text-sm sm:text-base" 
              placeholder="Senha" 
              required 
              minLength="6"
            />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button 
              type="submit"
              className="w-full bg-purple-600 text-white p-3 rounded-xl font-bold hover:bg-purple-700 transition text-sm sm:text-base"
            >
              {isRegistering ? "Cadastrar" : "Entrar"}
            </button>
          </form>
          <button 
            onClick={() => setIsRegistering(!isRegistering)} 
            className="w-full mt-4 text-purple-600 text-sm text-center underline hover:text-purple-700"
          >
            {isRegistering ? "Já tenho conta" : "Criar conta nova"}
          </button>
        </div>
      </div>
    );
  }

  // Tela principal do chat
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Modal de Confirmação de Deleção */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
            </div>
            <p className="text-slate-700 mb-6">
              Tem certeza que deseja excluir {selectedConversations.length} 
              {selectedConversations.length === 1 ? ' conversa' : ' conversas'} selecionada(s)?
              <br />
              <span className="text-sm text-red-500 font-medium">
                Esta ação não pode ser desfeita!
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={deleteSelectedConversations}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Excluir ({selectedConversations.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay para mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Responsiva */}
      <aside className={`
        ${isSidebarOpen ? 'flex' : 'hidden'} 
        sm:flex sm:w-64
        bg-slate-900 text-white 
        p-3 sm:p-4
        flex-col
        fixed sm:relative
        inset-y-0 left-0 z-40
        w-64
        transform transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
      `}>
        
        {/* Botão fechar no mobile */}
        <button 
          onClick={() => setIsSidebarOpen(false)}
          className="sm:hidden absolute top-4 right-4 p-2 text-white"
        >
          <X size={20} />
        </button>
        
        <div className="flex items-center justify-between mb-4 sm:mb-6 p-2">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-purple-400" />
            <span className="font-bold text-lg sm:text-xl text-purple-300">GWEN AI</span>
          </div>
          
          {/* Botão Modo Seleção */}
          {conversations.length > 0 && (
            <button
              onClick={toggleSelectMode}
              className={`p-2 rounded-lg transition ${
                isSelectMode 
                  ? 'bg-purple-600 text-white' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isSelectMode ? "Sair do modo seleção" : "Selecionar conversas"}
            >
              {isSelectMode ? <CheckSquare size={18} /> : <ListFilter size={18} />}
            </button>
          )}
        </div>
        
        {/* Botão Nova Conversa */}
        <button 
          onClick={createNewConversation}
          className="
            mb-4 sm:mb-6 
            p-2 sm:p-3 
            bg-purple-600 hover:bg-purple-700 
            rounded-lg sm:rounded-xl 
            flex items-center justify-center gap-2 
            transition
            text-sm sm:text-base
          "
        >
          <PlusCircle size={16} className="sm:size-[20px]" />
          <span>Nova Conversa</span>
        </button>
        
        {/* Controles de Seleção em Massa */}
        {isSelectMode && conversations.length > 0 && (
          <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${selectedConversations.length > 0 ? 'bg-purple-600' : 'bg-slate-700'}`}>
                  <Check size={14} className={selectedConversations.length > 0 ? 'text-white' : 'text-slate-400'} />
                </div>
                <span className="text-sm font-medium">
                  {selectedConversations.length} de {conversations.length} selecionadas
                </span>
              </div>
              
              {selectedConversations.length > 0 && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="p-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition"
                  title="Excluir selecionadas"
                >
                  <Trash size={16} />
                </button>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={selectAllConversations}
                className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition"
              >
                {selectedConversations.length === conversations.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
              </button>
              
              <button
                onClick={cancelSelection}
                className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        
        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 sm:mb-3 px-2">
            <h3 className="text-slate-400 text-xs sm:text-sm font-semibold">Histórico</h3>
            {conversations.length > 0 && !isSelectMode && (
              <span className="text-xs text-slate-500">
                {conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}
              </span>
            )}
          </div>
          
          {conversations.length === 0 ? (
            <div className="text-center p-4 text-slate-400 text-sm">
              <MessageCircle size={24} className="mx-auto mb-2 opacity-50" />
              <p>Nenhuma conversa ainda</p>
            </div>
          ) : (
            <div className="space-y-1 sm:space-y-2">
              {conversations.map((conv) => {
                const isSelected = selectedConversations.includes(conv.id);
                const isCurrent = currentConversationId === conv.id;
                
                return (
                  <div 
                    key={conv.id}
                    className={`
                      p-2 sm:p-3
                      rounded-lg cursor-pointer transition group
                      ${isCurrent && !isSelectMode 
                        ? 'bg-slate-800 border-l-4 border-purple-500' 
                        : isSelected
                        ? 'bg-purple-900/30 border-l-4 border-purple-400'
                        : 'hover:bg-slate-800/50'
                      }
                      ${isSelectMode ? 'pr-10' : ''}
                    `}
                    onClick={() => loadConversation(conv.id, conv.name)}
                  >
                    <div className="flex justify-between items-start">
                      {/* Checkbox de seleção (visível apenas no modo seleção) */}
                      {isSelectMode && (
                        <div className="mr-2 flex items-center">
                          <div className={`
                            w-5 h-5 rounded border-2 flex items-center justify-center
                            ${isSelected 
                              ? 'bg-purple-600 border-purple-600' 
                              : 'border-slate-500'
                            }
                          `}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!isSelectMode && (
                            <MessageCircle size={12} className="sm:size-[14px] text-purple-400" />
                          )}
                          <p className="font-medium text-xs sm:text-sm truncate">
                            {conv.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 mt-1 text-xs text-slate-400">
                          <Clock size={10} className="sm:size-[12px]" />
                          <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                          <span className="text-xs bg-slate-700 px-1 py-0.5 rounded">
                            {conv.messages?.length || 0} msgs
                          </span>
                        </div>
                      </div>
                      
                      {/* Botão de deletar individual (visível apenas fora do modo seleção) */}
                      {!isSelectMode && (
                        <button 
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition absolute right-2"
                          title="Excluir conversa"
                        >
                          <Trash2 size={12} className="sm:size-[14px] text-slate-400 hover:text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Usuário e Logout */}
        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 sm:gap-3 px-2 mb-2 sm:mb-3">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-600 rounded-full flex items-center justify-center">
              <User size={12} className="sm:size-[16px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium truncate">{user.email}</p>
              <p className="text-xs text-slate-400">{conversations.length} conversas</p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="
              w-full 
              p-1.5 sm:p-2 
              text-red-400 
              flex gap-1 sm:gap-2 
              items-center justify-center 
              text-xs sm:text-sm 
              hover:text-red-300 
              transition 
              hover:bg-slate-800 
              rounded-lg
            "
          >
            <LogOut size={14} className="sm:size-[16px]" /> Sair
          </button>
        </div>
      </aside>

      {/* Área Principal do Chat */}
      <main className="
        flex-1 flex flex-col
        w-full
        sm:ml-0
      ">
        {/* Header da Conversa */}
        <header className="
          h-16 border-b bg-white flex items-center 
          px-3 sm:px-6
          flex-col sm:flex-row
          py-2 sm:py-0
          gap-1 sm:gap-0
        ">
          <div className="flex-1 flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Botão Menu Mobile */}
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="sm:hidden p-2 text-slate-700"
            >
              <Menu size={20} />
            </button>
            
            {isRenaming ? (
              <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                <input 
                  type="text"
                  value={conversationName}
                  onChange={(e) => setConversationName(e.target.value)}
                  onBlur={renameConversation}
                  onKeyDown={(e) => e.key === 'Enter' && renameConversation()}
                  className="px-2 sm:px-3 py-1 border rounded-lg font-bold text-slate-700 text-sm sm:text-base w-full"
                  autoFocus
                />
                <button 
                  onClick={renameConversation}
                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  title="Salvar"
                >
                  <Save size={14} className="sm:size-[16px]" />
                </button>
              </div>
            ) : (
              <>
                <MessageSquare size={18} className="sm:size-[20px] text-purple-500" />
                <h1 
                  className="
                    font-bold text-slate-700 cursor-text hover:bg-slate-100 
                    px-2 py-1 rounded
                    text-base sm:text-lg
                    truncate max-w-[180px] sm:max-w-[300px]
                    text-center sm:text-left
                  "
                  onClick={() => setIsRenaming(true)}
                  title="Clique para renomear"
                >
                  {conversationName}
                </h1>
                <button 
                  onClick={() => setIsRenaming(true)}
                  className="p-1 text-slate-400 hover:text-purple-500 hidden sm:block"
                  title="Renomear conversa"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-500">
            <div className="flex items-center gap-1 sm:gap-2">
              <Bot size={14} className="sm:size-[16px] text-purple-500" />
              <span className="hidden sm:inline">Gwen AI</span>
            </div>
            <div className="h-4 w-px bg-slate-300 hidden sm:block"></div>
            <div className="flex items-center gap-1 sm:gap-2">
              <MessageCircle size={14} className="sm:size-[16px]" />
              <span>{messages.length} mensagens</span>
            </div>
          </div>
        </header>

        {/* Área de Mensagens */}
        <div className="
          flex-1 overflow-y-auto 
          p-3 sm:p-4 md:p-6
          bg-slate-50
        ">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4 sm:p-8">
              <div className="relative mb-4 sm:mb-6">
                <Sparkles size={48} className="sm:size-[64px] text-purple-400 mb-2" />
                <Bot size={24} className="sm:size-[32px] absolute -bottom-2 -right-2 text-white bg-purple-600 rounded-full p-1 sm:p-1.5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-600 mb-2 text-center">Bem-vindo à Gwen AI!</h2>
              <p className="text-slate-500 text-center max-w-md text-sm sm:text-base">
                Eu sou sua assistente de IA pessoal. Comece uma nova conversa ou 
                continue uma anterior usando o menu lateral.
              </p>
              <div className="mt-6 sm:mt-8 flex flex-col gap-2 sm:gap-3 text-xs sm:text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className="sm:size-[16px] text-purple-500" />
                  <span>Faça perguntas sobre qualquer assunto</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className="sm:size-[16px] text-purple-500" />
                  <span>Peça ajuda com tarefas criativas</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className="sm:size-[16px] text-purple-500" />
                  <span>Converse normalmente como com um amigo</span>
                </div>
              </div>
              <button 
                onClick={createNewConversation}
                className="mt-6 sm:mt-8 px-4 sm:px-6 py-2 sm:py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition flex items-center gap-2 text-sm sm:text-base"
              >
                <PlusCircle size={16} className="sm:size-[20px]" />
                Começar Nova Conversa
              </button>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4 max-w-full sm:max-w-3xl md:max-w-4xl mx-auto">
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                const isAssistant = msg.sender === "assistant";
                const isSystem = msg.sender === "system";
                
                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      p-3 sm:p-4
                      rounded-2xl 
                      max-w-[90%] sm:max-w-[85%] md:max-w-[70%]
                      shadow
                      ${isUser 
                        ? 'bg-purple-600 text-white rounded-tr-none' 
                        : isAssistant 
                        ? 'bg-slate-800 text-purple-100 border border-purple-900/30 rounded-tl-none'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 rounded-tl-none'
                      }
                    `}>
                      <div className="flex items-center gap-2 mb-1 sm:mb-2">
                        {isUser ? (
                          <>
                            <User size={12} className="sm:size-[14px]" />
                            <span className="text-xs font-bold">Você</span>
                          </>
                        ) : isAssistant ? (
                          <>
                            <Bot size={12} className="sm:size-[14px]" />
                            <span className="text-xs font-bold">Gwen AI</span>
                          </>
                        ) : (
                          <span className="text-xs font-bold">Sistema</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm sm:text-base">
                        {msg.text}
                      </p>
                      <p className="text-xs opacity-60 mt-1 sm:mt-2 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 text-purple-100 p-3 sm:p-4 rounded-2xl rounded-tl-none shadow max-w-[90%] sm:max-w-[85%] md:max-w-[70%]">
                    <div className="flex items-center gap-2 mb-1 sm:mb-2">
                      <Bot size={12} className="sm:size-[14px]" />
                      <span className="text-xs font-bold">Gwen AI</span>
                    </div>
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input de Mensagem */}
        <div className="
          p-3 sm:p-4
          bg-white border-t
          fixed bottom-0 left-0 right-0
          sm:static
        ">
          <form 
            onSubmit={handleSend} 
            className="
              max-w-full
              sm:max-w-3xl
              md:max-w-4xl
              mx-auto flex gap-2
            "
          >
            <input 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Digite sua mensagem para a Gwen..."
              className="
                flex-1 
                p-2 sm:p-3
                bg-slate-100 rounded-xl outline-none 
                focus:ring-2 focus:ring-purple-500 focus:bg-white
                text-sm sm:text-base
                min-h-[44px]
              "
              disabled={isTyping}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className="
                p-2 sm:p-3
                bg-purple-600 text-white rounded-xl 
                hover:bg-purple-700 disabled:opacity-50 
                disabled:cursor-not-allowed transition 
                flex items-center justify-center
                min-w-[44px]
                min-h-[44px]
              "
            >
              <Send size={18} className="sm:size-[20px]" />
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-2">
            A Gwen pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;