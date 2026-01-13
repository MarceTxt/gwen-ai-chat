### Visão rápida

Este repositório é uma aplicação React (Vite) que fornece um chat único integrado com Firebase (Auth + Firestore) e uma chamada ao SDK `@google/generative-ai` para respostas geradas (Gwen AI).

**Componentes principais**
- `src/App.jsx`: aplicação de frontend, autenticação, UI do chat e integração com o modelo generativo.
- `src/firebase.js`: inicializa `firebase/app`, `auth` e `firestore` (usa `initializeFirestore` com `experimentalForceLongPolling`).
- `src/main.jsx`: entrypoint que monta o `App` no DOM.
- `package.json`: scripts úteis (`npm run dev`, `build`, `preview`, `lint`) e dependências (Firebase, @google/generative-ai, Tailwind, Vite).

**Fluxo crítico de dados (resumo)**
- Usuário realiza login via `firebase/auth` (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`). Ver `src/App.jsx` (hook `onAuthStateChanged`).
- Mensagens são armazenadas em um único documento Firestore `doc(db, "chat", "sala_principal")`. Leitura com `onSnapshot` e escrita com `setDoc(..., { messages: arrayUnion(msg) }, { merge: true })`.
- Ao enviar, a UI é atualizada otimisticamente (mensagem local adicionada) e em seguida salva no Firestore.
- A geração de resposta usa `@google/generative-ai` em `src/App.jsx`: `const genAI = new GoogleGenerativeAI(KEY); const model = genAI.getGenerativeModel(...); const result = await model.generateContent(prompt)`.

**Padrões e convenções do projeto**
- Chat de única sala: todo o histórico vive no documento `chat/sala_principal` (não há múltiplas salas por usuário atualmente).
- Otimismo na UI: `setMessages` local é chamado antes de `setDoc` para melhorar percepção de latência.
- Logs sequenciais numerados em `handleSend` (comentados como LOG 1..LOG 7) — úteis para rastrear o fluxo de envio/geração.
- Estado de digitação: `isTyping` controla indicador "Gwen está digitando...".

**Comandos de desenvolvimento**
- Iniciar dev server: `npm run dev` (Vite, HMR)
- Build: `npm run build`
- Ver build local: `npm run preview`
- Lint: `npm run lint`

**Integrações e pontos de atenção**
- Chaves/API:
  - Firebase: configurado em `src/firebase.js` (arquivo contém a configuração atual).
  - Gemini/API Key: definida diretamente em `src/App.jsx` via `GEMINI_API_KEY` const. Busque nestes arquivos ao trabalhar com credenciais.
  - Observação: credenciais aparecem no repositório; trate com cuidado ao modificar.
- Firestore: uso de `experimentalForceLongPolling` indica necessidade de compatibilidade com redes restritas.

**Exemplos/trechos úteis**
- Salvar mensagem (App.jsx): `await setDoc(chatRef, { messages: arrayUnion(msgUsuario) }, { merge: true })`.
- Escutar mudanças: `onSnapshot(chatRef, (docSnap) => { setMessages(docSnap.data().messages || []) })`.
- Chamada IA (simplificada):

```js
const result = await model.generateContent(prompt);
const response = await result.response;
const texto = response.text();
```

**O que procurar ao modificar / depurar**
- Logs em `src/App.jsx` (comentários LOG 1..7) mostram pontos-chave do fluxo de envio/recebimento.
- Ao ajustar persistência, revise o uso de `arrayUnion` (evita sobrescrever o array inteiro).
- Teste autenticação e snapshot em redes com proxy (por causa de `experimentalForceLongPolling`).

Se precisar que eu integre validações adicionais (ex.: mover chaves para env, criar múltiplas salas, ou extrair o cliente de IA para um módulo), diga qual mudança você quer e eu implemento um rascunho.
