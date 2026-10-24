import { useEffect, useState } from 'react';
import { User, Users, UsersRound, Search, Check, X } from 'lucide-react';
import api from '../api';
import Modal from './Modal';

// PARA QUEM É O TOUR (24/10/2026). Três jeitos, escolhidos por quem cria:
//  • Só para mim — para se organizar, imprimir ou mandar em PDF.
//  • Pessoas específicas — um, dois ou mais da liderança.
//  • Toda a liderança — quem tem o Tour 4x4 na empresa.
// A lista de pessoas vem do servidor já filtrada: o líder vê o próprio
// time e quem está acima dele; o gestor vê toda a liderança.
export const DESTINOS = [
  { id: 'eu',      rotulo: 'Só para mim',          desc: 'Para me organizar, imprimir ou mandar em PDF', Icone: User },
  { id: 'pessoas', rotulo: 'Pessoas específicas',  desc: 'Escolho quem vai resolver os pontos',          Icone: Users },
  { id: 'todos',   rotulo: 'Toda a liderança',     desc: 'Todos os líderes da empresa recebem',          Icone: UsersRound },
];

function usePessoas(userId, ativo) {
  const [pessoas, setPessoas] = useState(null);
  useEffect(() => {
    if (!ativo || pessoas) return;
    api.get(`/relatorios/pessoas?requester_id=${userId}`)
      .then(r => setPessoas(r.data?.enderecaveis || []))
      .catch(() => setPessoas([]));
  }, [ativo, userId, pessoas]);
  return pessoas;
}

// Lista com busca e marcação. Usada ao criar e ao acrescentar pessoas.
function ListaPessoas({ pessoas, marcados, onToggle, esconder = [] }) {
  const [busca, setBusca] = useState('');
  if (pessoas === null) return <div className="tour-lista-vazia">Carregando pessoas...</div>;
  const visiveis = pessoas
    .filter(p => !esconder.includes(p.id))
    .filter(p => !busca || `${p.full_name} ${p.sector || ''} ${p.role || ''}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="tour-lista">
      {pessoas.length > 6 && (
        <div className="tour-busca">
          <Search size={14}/>
          <input placeholder="Buscar pelo nome ou setor" value={busca} onChange={e => setBusca(e.target.value)}/>
        </div>
      )}
      {visiveis.length === 0 && (
        <div className="tour-lista-vazia">
          {pessoas.length === 0
            ? 'Ninguém disponível. Você pode mandar para quem é do seu time ou está acima de você no organograma.'
            : 'Ninguém encontrado.'}
        </div>
      )}
      {visiveis.map(p => {
        const ok = marcados.includes(p.id);
        return (
          <button type="button" key={p.id} className={`tour-pessoa-linha${ok ? ' marcada' : ''}`} onClick={() => onToggle(p.id)}>
            <span className="tour-check">{ok && <Check size={13}/>}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="tour-nome">{p.full_name}</span>
              {(p.role || p.sector) && <span className="tour-cargo">{[p.role, p.sector].filter(Boolean).join(' · ')}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const alternar = (lista, id) => (lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]);

export default function SeletorDestino({ userId, valor, onChange, aberto }) {
  const pessoas = usePessoas(userId, aberto && valor.tipo === 'pessoas');
  return (
    <div className="form-group">
      <label className="form-label">Para quem é este tour? *</label>
      <div className="tour-destinos">
        {DESTINOS.map(({ id, rotulo, desc, Icone }) => (
          <button type="button" key={id}
            className={`tour-destino${valor.tipo === id ? ' ativo' : ''}`}
            onClick={() => onChange({ tipo: id, ids: id === 'pessoas' ? valor.ids : [] })}>
            <Icone size={18}/>
            <span>
              <strong>{rotulo}</strong>
              <small>{desc}</small>
            </span>
          </button>
        ))}
      </div>
      {valor.tipo === 'pessoas' && (
        <>
          {valor.ids.length > 0 && (
            <div className="tour-escolhidos">
              {valor.ids.length} escolhida{valor.ids.length > 1 ? 's' : ''}
            </div>
          )}
          <ListaPessoas pessoas={pessoas} marcados={valor.ids}
            onToggle={id => onChange({ tipo: 'pessoas', ids: alternar(valor.ids, id) })}/>
        </>
      )}
    </div>
  );
}

// Acrescentar pessoas a um tour que já existe (o gerente que recebeu e
// chama os outros líderes que precisam resolver os pontos).
export function ModalAcrescentar({ userId, jaEstao, onConfirmar, onClose }) {
  const pessoas = usePessoas(userId, true);
  const [ids, setIds] = useState([]);
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal open onClose={onClose} title="Acrescentar pessoas ao tour">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0 }}>
        Quem você acrescentar passa a ver o tour, recebe o aviso e pode registrar a conclusão dos pontos.
      </p>
      <ListaPessoas pessoas={pessoas} marcados={ids} esconder={jaEstao} onToggle={id => setIds(l => alternar(l, id))}/>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
          <X size={14}/> Cancelar
        </button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
          disabled={!ids.length || enviando}
          onClick={async () => { setEnviando(true); await onConfirmar(ids); setEnviando(false); }}>
          {enviando ? 'Salvando...' : `Acrescentar${ids.length ? ` (${ids.length})` : ''}`}
        </button>
      </div>
    </Modal>
  );
}
