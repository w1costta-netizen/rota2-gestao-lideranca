-- Chat: reagir com emoji e responder citando uma mensagem.
--
-- São os dois recursos do WhatsApp que mudam a conversa de verdade:
-- reagir evita a resposta de uma palavra só ("ok", "👍") que enche a tela,
-- e citar resolve a confusão de quem responde a mensagem antiga enquanto
-- outras cinco já chegaram.
--
-- Encaminhar e copiar não aparecem aqui: não precisam de nada no banco.

-- ── Responder citando ──────────────────────────────────────────────
-- A citação guarda só o vínculo. O texto exibido é lido da mensagem
-- original na hora — assim, se ela for apagada, a citação some junto em vez
-- de deixar uma cópia do que a pessoa quis apagar.
alter table mensagens
  add column if not exists responde_a uuid references mensagens(id) on delete set null;

-- ── Reações ────────────────────────────────────────────────────────
-- Uma reação por pessoa em cada mensagem: reagir de novo troca o emoji,
-- reagir com o mesmo remove. É o que a chave única abaixo garante.
create table if not exists mensagem_reacoes (
  id          uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references mensagens(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (mensagem_id, user_id)
);

create index if not exists idx_reacoes_mensagem on mensagem_reacoes(mensagem_id);

-- Tabela usada só pelo backend, que entra com a chave de serviço e passa
-- por cima da RLS. Ligar sem política nenhuma é o que fecha a porta para
-- qualquer leitura vinda do navegador — mesmo padrão do resto do chat.
alter table mensagem_reacoes enable row level security;
