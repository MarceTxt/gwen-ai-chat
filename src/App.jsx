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
  ListFilter, Moon, Sun, Palette
} from "lucide-react";

// Configuração da IA
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// FUNÇÃO PARA FORMATAR RESPOSTAS DA IA
const formatAIResponse = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  // Texto limpo - remove espaços extras no início/fim
  let formatted = text.trim();
  
  // 1. Substitui markdown básico por HTML
  formatted = formatted
    // Negrito: **texto** → <strong>texto</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    
    // Itálico: *texto* → <em>texto</em>
    .replace(/\*(?!\s)(.*?)(?<!\s)\*/g, '<em class="italic">$1</em>')
    
    // Listas: * item → <li>item</li>
    .replace(/^\* (.*$)/gm, '<li class="mb-1 pl-1">• $1</li>')
    
    // Código inline: `código` → <code>código</code>
    .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
  
  // 2. Processa blocos de código ```código```
  if (formatted.includes('```')) {
    formatted = formatted.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre class="p-3 rounded-lg my-3 overflow-x-auto"><code class="text-sm font-mono">$2</code></pre>'
    );
  }
  
  // 3. Quebras de linha: \n\n → novo parágrafo
  const paragraphs = formatted.split('\n\n');
  
  formatted = paragraphs.map(para => {
    // Se parágrafo começa com <li> (é uma lista), não coloca <p> em volta
    if (para.trim().startsWith('<li')) {
      // Agrupa múltiplos <li> em <ul>
      const lis = para.match(/<li[\s\S]*?<\/li>/g) || [];
      if (lis.length > 1) {
        return `<ul class="list-disc pl-5 my-3 space-y-1">${lis.join('')}</ul>`;
      }
      return para;
    }
    
    // Parágrafo normal
    para = para.replace(/\n/g, '<br />');
    return `<p class="mb-3 leading-relaxed">${para}</p>`;
  }).join('');
  
  return formatted;
};

// COMPONENTE PARA RENDERIZAR HTML SEGURO
const FormattedMessage = ({ html }) => {
  if (!html) return null;
  
  return (
    <div 
      className="ai-message-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

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

  // 🎨 NOVO ESTADO: Tema atual
  const [theme, setTheme] = useState("gradient"); // "dark", "light", "gradient"

  // Referências do Firestore
  const userConversationsRef = user ? collection(db, "users", user.uid, "conversations") : null;
  const currentConversationRef = currentConversationId 
    ? doc(db, "users", user?.uid, "conversations", currentConversationId)
    : null;

  // ============================================
  // CONFIGURAÇÕES DOS TEMAS
  // ============================================

  const themes = {
    dark: {
      name: "Escuro",
      sidebar: "bg-gray-900 text-gray-100 border-gray-800",
      main: "bg-gray-900 text-gray-100",
      header: "bg-gray-800 text-white border-gray-700",
      chatArea: "bg-gray-900",
      userMessage: "bg-blue-600 text-white",
      aiMessage: "bg-gray-800 text-gray-200 border-gray-700",
      systemMessage: "bg-amber-900/30 text-amber-200 border-amber-800",
      inputBg: "bg-gray-800 text-white border-gray-700",
      inputFocus: "focus:ring-blue-500 focus:border-blue-500",
      buttonPrimary: "bg-blue-600 hover:bg-blue-700 text-white",
      buttonSecondary: "bg-gray-800 hover:bg-gray-700 text-gray-200",
      icon: "text-blue-400",
      border: "border-gray-700",
      textMuted: "text-gray-400",
      gradient: ""
    },
    
    light: {
      name: "Claro",
      sidebar: "bg-gray-100 text-gray-800 border-gray-300",
      main: "bg-white text-gray-800",
      header: "bg-white text-gray-800 border-gray-300",
      chatArea: "bg-gray-50",
      userMessage: "bg-blue-500 text-white",
      aiMessage: "bg-gray-100 text-gray-800 border-gray-200",
      systemMessage: "bg-amber-50 text-amber-800 border-amber-200",
      inputBg: "bg-gray-100 text-gray-800 border-gray-300",
      inputFocus: "focus:ring-blue-500 focus:border-blue-500",
      buttonPrimary: "bg-blue-500 hover:bg-blue-600 text-white",
      buttonSecondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
      icon: "text-blue-500",
      border: "border-gray-300",
      textMuted: "text-gray-500",
      gradient: ""
    },
    
    gradient: {
      name: "Gradiente",
      sidebar: "bg-gradient-to-b from-gray-900 via-purple-900 to-gray-900 text-white",
      main: "bg-gradient-to-br from-gray-900 via-gray-800 to-purple-900 text-gray-100",
      header: "bg-gradient-to-r from-purple-700 via-purple-600 to-blue-600 text-white",
      chatArea: "bg-gradient-to-b from-gray-900/80 via-gray-900/60 to-gray-900/40",
      userMessage: "bg-gradient-to-r from-blue-500 to-purple-600 text-white",
      aiMessage: "bg-gradient-to-r from-gray-800 to-gray-900 text-purple-100 border border-purple-900/30",
      systemMessage: "bg-gradient-to-r from-amber-900/30 to-amber-800/20 text-amber-200 border-amber-800/30",
      inputBg: "bg-gray-800/50 text-white border-purple-900/50 backdrop-blur-sm",
      inputFocus: "focus:ring-purple-500 focus:border-purple-500",
      buttonPrimary: "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white",
      buttonSecondary: "bg-gray-800/50 hover:bg-gray-700/50 text-gray-200 backdrop-blur-sm",
      icon: "text-purple-300",
      border: "border-purple-900/30",
      textMuted: "text-gray-400",
      gradient: "bg-gradient-to-r from-purple-600 to-blue-600"
    }
  };

  const currentTheme = themes[theme];

  // Efeito para aplicar tema ao body
  useEffect(() => {
    if (theme === "dark" || theme === "gradient") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // ... (TODO O RESTO DO SEU CÓDIGO PERMANECE IGUAL ATÉ A LINHA ~750) ...
  // Seus useEffects e funções continuam exatamente iguais
  // Só vou modificar a parte de renderização (JSX)

  // ============================================
  // FUNÇÕES EXISTENTES (MANTIDAS)
  // ============================================

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
      setIsSidebarOpen(false);
      
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
      setIsSidebarOpen(false);
      
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
    e.stopPropagation();
    
    if (window.confirm("Tem certeza que deseja excluir esta conversa?")) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "conversations", conversationId));
        
        setConversations(prev => prev.filter(conv => conv.id !== conversationId));
        setSelectedConversations(prev => prev.filter(id => id !== conversationId));
        
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
  const toggleSelectConversation = (conversationId) => {
    setSelectedConversations(prev => {
      if (prev.includes(conversationId)) {
        return prev.filter(id => id !== conversationId);
      } else {
        return [...prev, conversationId];
      }
    });
  };

  const selectAllConversations = () => {
    if (selectedConversations.length === conversations.length) {
      setSelectedConversations([]);
    } else {
      setSelectedConversations(conversations.map(conv => conv.id));
    }
  };

  const deleteSelectedConversations = async () => {
    if (selectedConversations.length === 0) return;
    
    try {
      const batch = writeBatch(db);
      
      selectedConversations.forEach(conversationId => {
        const conversationRef = doc(db, "users", user.uid, "conversations", conversationId);
        batch.delete(conversationRef);
      });
      
      await batch.commit();
      
      setConversations(prev => prev.filter(conv => !selectedConversations.includes(conv.id)));
      
      if (selectedConversations.includes(currentConversationId)) {
        await createNewConversation();
      }
      
      setSelectedConversations([]);
      setIsSelectMode(false);
      setShowDeleteModal(false);
      
      console.log(`🗑️ ${selectedConversations.length} conversas excluídas com sucesso!`);
      
    } catch (error) {
      console.error("❌ Erro ao excluir conversas em massa:", error);
      alert("Erro ao excluir conversas. Tente novamente.");
    }
  };

  const toggleSelectMode = () => {
    if (isSelectMode) {
      setSelectedConversations([]);
    }
    setIsSelectMode(!isSelectMode);
  };

  const cancelSelection = () => {
    setSelectedConversations([]);
    setIsSelectMode(false);
  };

  const renameConversation = async () => {
    if (!currentConversationId || !isRenaming) return;
    
    try {
      await updateDoc(currentConversationRef, {
        name: conversationName,
        updatedAt: new Date().toISOString()
      });
      
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user || isTyping || !currentConversationId) return;

    const textoUsuario = input.trim();
    setInput("");

    const msgUsuario = {
      id: Date.now() + "_user",
      text: textoUsuario,
      sender: "user",
      senderEmail: user.email,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...messages, msgUsuario];
    setMessages(updatedMessages);

    try {
      await updateDoc(currentConversationRef, {
        messages: arrayUnion(msgUsuario),
        updatedAt: new Date().toISOString()
      });

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

    setIsTyping(true);
    
    try {
      const prompt = `Você é a Gwen, uma assistente amigável e útil. 
      Histórico: ${updatedMessages.slice(-5).map(m => `${m.sender}: ${m.text}`).join('\n')}
      
      Responda de forma útil e agradável ao usuário: "${textoUsuario}"`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const textoGwen = response.text();

      const msgGwen = {
        id: Date.now() + "_gwen",
        text: textoGwen,
        sender: "assistant",
        senderName: "Gwen AI",
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, msgGwen]);
      
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
      <div className={`min-h-screen ${currentTheme.main} flex items-center justify-center`}>
        <div className="text-center">
          <Sparkles className="animate-pulse mx-auto mb-4" size={48} />
          <p>Carregando Gwen AI...</p>
        </div>
      </div>
    );
  }

  // Tela de login (mantém tema fixo para login)
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex justify-center mb-6 text-purple-600">
            <Sparkles size={48} />
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
            {isRegistering ? "Criar Conta" : "Entrar na Gwen AI"}
          </h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-3 border border-gray-300 rounded-xl" 
              placeholder="Email" 
              required 
            />
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-3 border border-gray-300 rounded-xl" 
              placeholder="Senha" 
              required 
              minLength="6"
            />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white p-3 rounded-xl font-bold hover:opacity-90 transition"
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

  // ============================================
  // RENDERIZAÇÃO PRINCIPAL COM TEMAS
  // ============================================
  return (
    <div className={`flex h-screen ${currentTheme.main} overflow-hidden`}>
      
      {/* Modal de Confirmação de Deleção */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
            </div>
            <p className="text-slate-700 dark:text-gray-300 mb-6">
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
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
        ${currentTheme.sidebar}
        p-3 sm:p-4
        flex-col
        fixed sm:relative
        inset-y-0 left-0 z-40
        w-64
        transform transition-transform duration-300
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
        border-r ${currentTheme.border}
      `}>
        
        {/* Botão fechar no mobile */}
        <button 
          onClick={() => setIsSidebarOpen(false)}
          className="sm:hidden absolute top-4 right-4 p-2"
        >
          <X size={20} />
        </button>
        
        <div className="flex items-center justify-between mb-4 sm:mb-6 p-2">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className={currentTheme.icon} />
            <span className="font-bold text-lg sm:text-xl">GWEN AI</span>
          </div>
          
          {/* Seletor de Temas */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme("light")}
              className={`p-1.5 rounded ${theme === "light" ? "bg-white/20" : "hover:bg-white/10"}`}
              title="Tema Claro"
            >
              <Sun size={16} />
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`p-1.5 rounded ${theme === "dark" ? "bg-white/20" : "hover:bg-white/10"}`}
              title="Tema Escuro"
            >
              <Moon size={16} />
            </button>
            <button
              onClick={() => setTheme("gradient")}
              className={`p-1.5 rounded ${theme === "gradient" ? "bg-white/20" : "hover:bg-white/10"}`}
              title="Tema Gradiente"
            >
              <Palette size={16} />
            </button>
          </div>
        </div>
        
        {/* Botão Nova Conversa */}
        <button 
          onClick={createNewConversation}
          className={`
            mb-4 sm:mb-6 
            p-2 sm:p-3 
            ${currentTheme.buttonPrimary}
            rounded-lg sm:rounded-xl 
            flex items-center justify-center gap-2 
            transition
            text-sm sm:text-base
          `}
        >
          <PlusCircle size={16} className="sm:size-[20px]" />
          <span>Nova Conversa</span>
        </button>
        
        {/* Controles de Seleção em Massa */}
        {isSelectMode && conversations.length > 0 && (
          <div className={`mb-4 p-3 rounded-lg ${theme === "light" ? "bg-gray-200" : "bg-white/10"}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${selectedConversations.length > 0 ? currentTheme.gradient || "bg-purple-600" : "bg-gray-700"}`}>
                  <Check size={14} className={selectedConversations.length > 0 ? 'text-white' : currentTheme.textMuted} />
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
                className={`flex-1 px-3 py-2 rounded text-sm transition ${currentTheme.buttonSecondary}`}
              >
                {selectedConversations.length === conversations.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
              </button>
              
              <button
                onClick={cancelSelection}
                className={`flex-1 px-3 py-2 rounded text-sm transition ${currentTheme.buttonSecondary}`}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        
        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2 sm:mb-3 px-2">
            <h3 className={`text-xs sm:text-sm font-semibold ${currentTheme.textMuted}`}>Histórico</h3>
            {conversations.length > 0 && !isSelectMode && (
              <span className={`text-xs ${currentTheme.textMuted}`}>
                {conversations.length} {conversations.length === 1 ? 'conversa' : 'conversas'}
              </span>
            )}
          </div>
          
          {conversations.length === 0 ? (
            <div className={`text-center p-4 text-sm ${currentTheme.textMuted}`}>
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
                        ? `${theme === "gradient" ? "bg-gradient-to-r from-purple-900/30 to-blue-900/30" : "bg-gray-800"} border-l-4 ${currentTheme.icon.replace("text-", "border-")}` 
                        : isSelected
                        ? `${theme === "gradient" ? "bg-gradient-to-r from-purple-900/20 to-blue-900/20" : "bg-purple-900/20"} border-l-4 border-purple-400`
                        : 'hover:bg-white/10'
                      }
                      ${isSelectMode ? 'pr-10' : ''}
                      border-l-4 ${isCurrent || isSelected ? '' : 'border-transparent'}
                    `}
                    onClick={() => loadConversation(conv.id, conv.name)}
                  >
                    <div className="flex justify-between items-start">
                      {/* Checkbox de seleção */}
                      {isSelectMode && (
                        <div className="mr-2 flex items-center">
                          <div className={`
                            w-5 h-5 rounded border-2 flex items-center justify-center
                            ${isSelected 
                              ? `${currentTheme.gradient || "bg-purple-600"} border-purple-600` 
                              : `border-gray-500`
                            }
                          `}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!isSelectMode && (
                            <MessageCircle size={12} className={`sm:size-[14px] ${currentTheme.icon}`} />
                          )}
                          <p className="font-medium text-xs sm:text-sm truncate">
                            {conv.name}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1 sm:gap-2 mt-1 text-xs ${currentTheme.textMuted}`}>
                          <Clock size={10} className="sm:size-[12px]" />
                          <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                          <span className={`text-xs px-1 py-0.5 rounded ${theme === "light" ? "bg-gray-300" : "bg-gray-700"}`}>
                            {conv.messages?.length || 0} msgs
                          </span>
                        </div>
                      </div>
                      
                      {/* Botão de deletar individual */}
                      {!isSelectMode && (
                        <button 
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition absolute right-2"
                          title="Excluir conversa"
                        >
                          <Trash2 size={12} className={`sm:size-[14px] ${currentTheme.textMuted} hover:text-red-400`} />
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
        <div className={`mt-4 sm:mt-6 pt-3 sm:pt-4 border-t ${currentTheme.border}`}>
          <div className="flex items-center gap-2 sm:gap-3 px-2 mb-2 sm:mb-3">
            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${currentTheme.gradient || "bg-purple-600"}`}>
              <User size={12} className="sm:size-[16px] text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium truncate">{user.email}</p>
              <p className={`text-xs ${currentTheme.textMuted}`}>{conversations.length} conversas</p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className={`
              w-full 
              p-1.5 sm:p-2 
              text-red-400 hover:text-red-300 
              transition 
              hover:bg-white/10 
              rounded-lg
              text-xs sm:text-sm
              flex items-center justify-center gap-1 sm:gap-2
            `}
          >
            <LogOut size={14} className="sm:size-[16px]" /> Sair
          </button>
        </div>
      </aside>

      {/* Área Principal do Chat */}
      <main className="flex-1 flex flex-col w-full sm:ml-0">
        {/* Header da Conversa */}
        <header className={`
          h-16 ${currentTheme.header}
          flex items-center 
          px-3 sm:px-6
          justify-between
          border-b ${currentTheme.border}
        `}>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Botão Menu Mobile */}
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="sm:hidden p-2"
            >
              <Menu size={20} />
            </button>
            
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  value={conversationName}
                  onChange={(e) => setConversationName(e.target.value)}
                  onBlur={renameConversation}
                  onKeyDown={(e) => e.key === 'Enter' && renameConversation()}
                  className={`px-2 sm:px-3 py-1 border rounded-lg font-bold text-sm sm:text-base ${theme === "light" ? "text-gray-800 border-gray-300" : "text-white bg-gray-800/50 border-gray-600"}`}
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
                <MessageSquare size={18} className={`sm:size-[20px] ${currentTheme.icon}`} />
                <h1 
                  className={`
                    font-bold px-2 py-1 rounded
                    text-base sm:text-lg
                    truncate max-w-[180px] sm:max-w-[300px]
                    cursor-text hover:bg-white/10
                  `}
                  onClick={() => setIsRenaming(true)}
                  title="Clique para renomear"
                >
                  {conversationName}
                </h1>
              </>
            )}
          </div>
          
          <div className={`flex items-center gap-2 sm:gap-4 text-xs sm:text-sm ${currentTheme.textMuted}`}>
            <div className="flex items-center gap-1 sm:gap-2">
              <Bot size={14} className={`sm:size-[16px] ${currentTheme.icon}`} />
              <span className="hidden sm:inline">Gwen AI</span>
            </div>
            <div className={`h-4 w-px ${theme === "light" ? "bg-gray-300" : "bg-gray-600"}`}></div>
            <div className="flex items-center gap-1 sm:gap-2">
              <MessageCircle size={14} className="sm:size-[16px]" />
              <span>{messages.length} mensagens</span>
            </div>
          </div>
        </header>

        {/* Área de Mensagens */}
        <div className={`
          flex-1 overflow-y-auto 
          p-3 sm:p-4 md:p-6
          ${currentTheme.chatArea}
        `}>
          {messages.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center p-4 sm:p-8 text-center ${currentTheme.textMuted}`}>
              <div className="relative mb-4 sm:mb-6">
                <Sparkles size={48} className={`sm:size-[64px] mb-2 ${currentTheme.icon}`} />
                <Bot size={24} className="absolute -bottom-2 -right-2 text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-full p-1 sm:p-1.5" />
              </div>
              <h2 className={`text-xl sm:text-2xl font-bold mb-2 ${theme === "light" ? "text-gray-800" : "text-white"}`}>
                Bem-vindo à Gwen AI!
              </h2>
              <p className="max-w-md mb-6">
                Sua assistente de IA pessoal. Comece conversando!
              </p>
              <div className="mt-6 sm:mt-8 flex flex-col gap-2 sm:gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className={`sm:size-[16px] ${currentTheme.icon}`} />
                  <span>Faça perguntas sobre qualquer assunto</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className={`sm:size-[16px] ${currentTheme.icon}`} />
                  <span>Peça ajuda com tarefas criativas</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className={`sm:size-[16px] ${currentTheme.icon}`} />
                  <span>Converse normalmente como com um amigo</span>
                </div>
              </div>
              <button 
                onClick={createNewConversation}
                className={`mt-6 sm:mt-8 px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-semibold flex items-center gap-2 text-sm sm:text-base ${currentTheme.buttonPrimary}`}
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
                      shadow-lg
                      ${isUser 
                        ? currentTheme.userMessage + ' rounded-tr-none' 
                        : isAssistant 
                        ? currentTheme.aiMessage + ' rounded-tl-none'
                        : currentTheme.systemMessage + ' rounded-tl-none'
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
                          <>
                            <AlertCircle size={12} className="sm:size-[14px]" />
                            <span className="text-xs font-bold">Sistema</span>
                          </>
                        )}
                      </div>
                      
                      {msg.sender === 'assistant' ? (
                        <FormattedMessage html={formatAIResponse(msg.text)} />
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm sm:text-base">
                          {msg.text}
                        </p>
                      )}
                      
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
                  <div className={`
                    p-3 sm:p-4
                    rounded-2xl rounded-tl-none 
                    shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-[70%]
                    ${currentTheme.aiMessage}
                  `}>
                    <div className="flex items-center gap-2 mb-1 sm:mb-2">
                      <Bot size={12} className="sm:size-[14px]" />
                      <span className="text-xs font-bold">Gwen AI</span>
                    </div>
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-bounce bg-current"></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-bounce bg-current" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-bounce bg-current" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input de Mensagem */}
        <div className={`
          p-3 sm:p-4
          ${currentTheme.main}
          border-t ${currentTheme.border}
          fixed bottom-0 left-0 right-0
          sm:static
        `}>
          <form 
            onSubmit={handleSend} 
            className="max-w-full sm:max-w-3xl md:max-w-4xl mx-auto flex gap-2"
          >
            <input 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Digite sua mensagem para a Gwen..."
              className={`
                flex-1 
                p-2 sm:p-3
                ${currentTheme.inputBg}
                rounded-xl outline-none 
                ${currentTheme.inputFocus}
                text-sm sm:text-base
                min-h-[44px]
              `}
              disabled={isTyping}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className={`
                p-2 sm:p-3
                ${currentTheme.buttonPrimary}
                rounded-xl 
                disabled:opacity-50 
                disabled:cursor-not-allowed 
                transition 
                flex items-center justify-center
                min-w-[44px]
                min-h-[44px]
              `}
            >
              <Send size={18} className="sm:size-[20px]" />
            </button>
          </form>
          <p className={`text-center text-xs mt-2 ${currentTheme.textMuted}`}>
            A Gwen pode cometer erros. Verifique informações importantes.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;