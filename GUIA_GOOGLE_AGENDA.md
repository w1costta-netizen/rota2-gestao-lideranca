# Ligar o Google Agenda ao Rota Líder — o que você faz no Google

Leva uns 30 minutos. Você precisa fazer isso **com a sua conta** — são as credenciais do app, e ninguém deve fazer por você.

> **Nunca cole o "segredo do cliente" no chat.** Ele vai direto no Render (passo 6).

---

## 1. Criar o projeto

1. Entre em **console.cloud.google.com** com o e-mail que vai ser o "dono" do Rota no Google (o ideal é um e-mail do Rota, não o pessoal).
2. No topo, em **Selecionar projeto → Novo projeto**.
3. Nome: **Rota Lider**. Criar.

## 2. Ligar a API da agenda

1. Menu **APIs e serviços → Biblioteca**.
2. Busque **Google Calendar API** → **Ativar**.

## 3. Tela de consentimento (o que a pessoa vê ao conectar)

Menu **APIs e serviços → Tela de consentimento OAuth** (às vezes aparece como **Google Auth Platform**).

- **Tipo de usuário: Externo** (é o que permite clientes de outras empresas).
- **Nome do app:** Rota Líder
- **E-mail de suporte:** o seu
- **Logotipo:** a logo do Rota (quadrada)
- **Página inicial:** `https://rotalider.com.br`
- **Política de privacidade:** `https://rotalider.com.br/politica-de-privacidade-rotalider.html`
- **Termos de uso:** `https://rotalider.com.br/termos-de-uso-rotalider.html`
- **Domínios autorizados:** `rotalider.com.br`
- **E-mail de contato do desenvolvedor:** o seu

## 4. Permissão pedida (escopo)

Na parte de **Escopos / Acesso a dados**, adicione **só este**:

```
https://www.googleapis.com/auth/calendar.events.readonly
```

É **somente leitura** dos eventos. O Rota nunca escreve nem apaga nada no seu Google.

## 5. Usuários de teste

Enquanto o app não é verificado, só funciona para quem estiver nesta lista (até 100).

- **Público-alvo / Usuários de teste → Adicionar usuários**
- Coloque o **seu e-mail de trabalho** (o da agenda onde chegam as reuniões).

## 6. Criar a credencial

Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**

- **Tipo:** Aplicativo da Web
- **Nome:** Rota Lider
- **URIs de redirecionamento autorizados** — exatamente assim:

```
https://rotalider.com.br/api/google/callback
```

Ao criar, aparecem dois códigos: **ID do cliente** e **Chave secreta do cliente**.

Coloque os dois **no Render** (rota2-gestao-lideranca → Environment), com estes nomes:

| Nome no Render | O que colar |
|---|---|
| `GOOGLE_CLIENT_ID` | o ID do cliente |
| `GOOGLE_CLIENT_SECRET` | a chave secreta |

(Vai ter um terceiro, `GOOGLE_TOKEN_CHAVE`, que eu te passo — é a chave que embaralha as conexões guardadas no banco.)

## 7. Depois de testar: pedir a verificação

Quando tiver funcionado com você, na tela de consentimento clique em **Publicar app → Enviar para verificação**. O Google vai pedir:

- **Verificar o domínio** `rotalider.com.br` no Google Search Console (eles mostram como).
- **Por que o app precisa da agenda** — texto sugerido:
  > *"O Rota Líder é um sistema de gestão de equipes. A agenda do líder no app mostra as reuniões que ele já tem no Google Agenda, para ele organizar o dia num lugar só. O acesso é somente leitura; o app não cria, altera nem apaga eventos."*
- **Um vídeo** (pode ser gravado no celular) mostrando: entrar no Rota → clicar em Conectar Google → a tela de permissão do Google → as reuniões aparecendo na Agenda do Rota.

A análise leva de alguns dias a algumas semanas. Até lá, tudo funciona para os usuários de teste.

---

### Se aparecer "Acesso bloqueado pelo administrador"

É o TI da sua empresa limitando apps de fora. Peça ao TI para **liberar o app pelo ID do cliente** (Admin do Google → Segurança → Controles de API → Acesso a apps de terceiros). Isso vale para cada empresa cliente que usar Google da empresa.
