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
  collection, query, orderBy, getDocs, addDoc 
} from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Sparkles, Send, MessageSquare, ShieldCheck, LogOut,
  PlusCircle, Trash2, Clock, MessageCircle, User,
  ChevronRight, Bot, Save, FolderOpen
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
    try {
      setCurrentConversationId(conversationId);
      setConversationName(conversationName);
      setMessages([]);
      setLoading(true);
      
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

  // Função para deletar conversa
  const deleteConversation = async (conversationId, e) => {
    e.stopPropagation(); // Evita carregar a conversa ao clicar no lixo
    
    if (window.confirm("Tem certeza que deseja excluir esta conversa?")) {
      try {
        // TODO: Implementar exclusão do Firestore
        // await deleteDoc(doc(db, "users", user.uid, "conversations", conversationId));
        
        // Remove da lista local
        setConversations(prev => prev.filter(conv => conv.id !== conversationId));
        
        // Se era a conversa atual, cria uma nova
        if (conversationId === currentConversationId) {
          await createNewConversation();
        }
        
        console.log("🗑️ Conversa excluída:", conversationId);
      } catch (error) {
        console.error("❌ Erro ao excluir conversa:", error);
      }
    }
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
          <p>Carregando Gwen AI...</p>
        </div>
      </div>
    );
  }

  // Tela de login
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex justify-center mb-6 text-purple-600">
            <Sparkles size={48} />
          </div>
          <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
            {isRegistering ? "Criar Conta" : "Entrar"}
          </h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-3 border rounded-xl" 
              placeholder="Email" 
              required 
            />
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-3 border rounded-xl" 
              placeholder="Senha" 
              required 
              minLength="6"
            />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button 
              type="submit"
              className="w-full bg-purple-600 text-white p-3 rounded-xl font-bold hover:bg-purple-700 transition"
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
      {/* Sidebar Esquerda - Histórico de Conversas */}
      <aside className="w-64 bg-slate-900 text-white p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-6 p-2">
          <Sparkles size={24} className="text-purple-400" />
          <span className="font-bold text-xl text-purple-300">GWEN AI</span>
        </div>
        
        {/* Botão Nova Conversa */}
        <button 
          onClick={createNewConversation}
          className="mb-6 p-3 bg-purple-600 hover:bg-purple-700 rounded-xl flex items-center justify-center gap-2 transition"
        >
          <PlusCircle size={20} />
          <span>Nova Conversa</span>
        </button>
        
        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          <h3 className="text-slate-400 text-sm font-semibold mb-3 px-2">Histórico</h3>
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div 
                key={conv.id}
                className={`p-3 rounded-lg cursor-pointer transition group ${
                  currentConversationId === conv.id 
                    ? 'bg-slate-800 border-l-4 border-purple-500' 
                    : 'hover:bg-slate-800/50'
                }`}
                onClick={() => loadConversation(conv.id, conv.name)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MessageCircle size={14} className="text-purple-400" />
                      <p className="font-medium text-sm truncate">
                        {conv.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Clock size={12} />
                      <span>{new Date(conv.updatedAt).toLocaleDateString()}</span>
                      <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded">
                        {conv.messages?.length || 0} msgs
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition"
                    title="Excluir conversa"
                  >
                    <Trash2 size={14} className="text-slate-400 hover:text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Usuário e Logout */}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <p className="text-xs text-slate-400">{conversations.length} conversas</p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="w-full p-2 text-red-400 flex gap-2 items-center justify-center text-sm hover:text-red-300 transition hover:bg-slate-800 rounded-lg"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Área Principal do Chat */}
      <main className="flex-1 flex flex-col">
        {/* Header da Conversa */}
        <header className="h-16 border-b bg-white flex items-center px-6">
          <div className="flex-1 flex items-center gap-3">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  value={conversationName}
                  onChange={(e) => setConversationName(e.target.value)}
                  onBlur={renameConversation}
                  onKeyDown={(e) => e.key === 'Enter' && renameConversation()}
                  className="px-3 py-1 border rounded-lg font-bold text-slate-700"
                  autoFocus
                />
                <button 
                  onClick={renameConversation}
                  className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  title="Salvar"
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <>
                <MessageSquare size={20} className="text-purple-500" />
                <h1 
                  className="font-bold text-slate-700 cursor-text hover:bg-slate-100 px-2 py-1 rounded"
                  onClick={() => setIsRenaming(true)}
                  title="Clique para renomear"
                >
                  {conversationName}
                </h1>
                <button 
                  onClick={() => setIsRenaming(true)}
                  className="p-1 text-slate-400 hover:text-purple-500"
                  title="Renomear conversa"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-purple-500" />
              <span>Gwen AI</span>
            </div>
            <div className="h-4 w-px bg-slate-300"></div>
            <div className="flex items-center gap-2">
              <MessageCircle size={16} />
              <span>{messages.length} mensagens</span>
            </div>
          </div>
        </header>

        {/* Área de Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <div className="relative mb-6">
                <Sparkles size={64} className="text-purple-400 mb-2" />
                <Bot size={32} className="absolute -bottom-2 -right-2 text-white bg-purple-600 rounded-full p-1.5" />
              </div>
              <h2 className="text-2xl font-bold text-slate-600 mb-2">Bem-vindo à Gwen AI!</h2>
              <p className="text-slate-500 text-center max-w-md">
                Eu sou sua assistente de IA pessoal. Comece uma nova conversa ou 
                continue uma anterior usando o menu lateral.
              </p>
              <div className="mt-8 flex flex-col gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <ChevronRight size={16} className="text-purple-500" />
                  <span>Faça perguntas sobre qualquer assunto</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight size={16} className="text-purple-500" />
                  <span>Peça ajuda com tarefas criativas</span>
                </div>
                <div className="flex items-center gap-2">
                  <ChevronRight size={16} className="text-purple-500" />
                  <span>Converse normalmente como com um amigo</span>
                </div>
              </div>
              <button 
                onClick={createNewConversation}
                className="mt-8 px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition flex items-center gap-2"
              >
                <PlusCircle size={20} />
                Começar Nova Conversa
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto">
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                const isAssistant = msg.sender === "assistant";
                const isSystem = msg.sender === "system";
                
                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`p-4 rounded-2xl max-w-[85%] md:max-w-[70%] shadow ${
                      isUser 
                        ? 'bg-purple-600 text-white rounded-tr-none' 
                        : isAssistant 
                        ? 'bg-slate-800 text-purple-100 border border-purple-900/30 rounded-tl-none'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 rounded-tl-none'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {isUser ? (
                          <>
                            <User size={14} />
                            <span className="text-xs font-bold">Você</span>
                          </>
                        ) : isAssistant ? (
                          <>
                            <Bot size={14} />
                            <span className="text-xs font-bold">Gwen AI</span>
                          </>
                        ) : (
                          <span className="text-xs font-bold">Sistema</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                      <p className="text-xs opacity-60 mt-2 text-right">
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
                  <div className="bg-slate-800 text-purple-100 p-4 rounded-2xl rounded-tl-none shadow">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot size={14} />
                      <span className="text-xs font-bold">Gwen AI</span>
                    </div>
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input de Mensagem */}
        <div className="p-4 bg-white border-t">
          <form 
            onSubmit={handleSend} 
            className="max-w-4xl mx-auto flex gap-2"
          >
            <input 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Digite sua mensagem para a Gwen..."
              className="flex-1 p-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
              disabled={isTyping}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              <Send size={20} />
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