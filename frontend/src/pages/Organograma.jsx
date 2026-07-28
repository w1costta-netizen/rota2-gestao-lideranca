import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight, Users, Share2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../api';
import { useToast } from '../components/Toast';

const ACCESS_LABEL = { master:'Master', admin:'Admin', supervisor:'Supervisor', lider:'Líder', colaborador:'Colaborador' };

function Avatar({ pessoa, size = 44 }) {
  const [err, setErr] = useState(false);
  if (pessoa.avatar_url && !err) {
    return (
      <img src={pessoa.avatar_url} alt={pessoa.full_name} onError={() => setErr(true)}
        style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover',
          border:'2px solid var(--primary)', flexShrink:0 }}/>
    );
  }
  return (
    <div style={{ width:size, height:size, borderRadius:'50%',
      background:'var(--primary)22', border:'2px solid var(--primary)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.36, fontWeight:800, color:'var(--primary)', flexShrink:0 }}>
      {pessoa.full_name?.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
    </div>
  );
}

function MembroRow({ pessoa, selecionado, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
      background: selecionado ? 'var(--primary)11' : 'var(--surface)',
      border: selecionado ? '1.5px solid var(--primary)66' : '1px solid var(--border)',
      borderRadius:10, cursor:'pointer', width:'100%', textAlign:'left',
      transition:'all .15s',
    }}>
      <Avatar pessoa={pessoa} size={36}/>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>{pessoa.full_name}</div>
        <div style={{ fontSize:11, color:'var(--text-muted)' }}>
          {ACCESS_LABEL[pessoa.access_level]}{pessoa.sector ? ` · ${pessoa.sector}` : ''}
        </div>
      </div>
      <div style={{
        width:22, height:22, borderRadius:6, flexShrink:0,
        background: selecionado ? 'var(--primary)' : 'transparent',
        border: selecionado ? '2px solid var(--primary)' : '2px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {selecionado && <Check size={13} color="#fff"/>}
      </div>
    </button>
  );
}

// Card do organograma visual
const TEAM_COLOR = '#34D399';

function OrgCard({ node, isRoot, isLevel1 }) {
  const bg     = isRoot ? 'var(--primary)' : isLevel1 ? TEAM_COLOR : 'var(--surface)';
  const border  = isRoot || isLevel1 ? 'none' : '1.5px solid var(--border)';
  const shadow  = isRoot ? '0 4px 16px var(--primary)44' : isLevel1 ? `0 4px 16px ${TEAM_COLOR}44` : '0 2px 6px #0002';
  const textCol = isRoot || isLevel1 ? '#fff' : 'var(--text)';
  const subCol  = isRoot || isLevel1 ? 'rgba(255,255,255,.75)' : 'var(--text-muted)';
  const size    = isRoot ? 52 : isLevel1 ? 44 : 36;

  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:10,
      background: bg, border, borderRadius: isRoot ? 14 : 12,
      padding: isRoot ? '10px 16px' : isLevel1 ? '9px 14px' : '8px 13px',
      boxShadow: shadow, minWidth:150, maxWidth:190,
    }}>
      <Avatar pessoa={node} size={size}/>
      <div style={{ minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize: isRoot ? 13 : 11, color: textCol,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }}>
          {node.full_name}
        </div>
        <div style={{ fontSize:10, color: subCol, marginTop:1 }}>
          {ACCESS_LABEL[node.access_level]}{node.sector ? ` · ${node.sector}` : ''}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ node, isRoot = false, depth = 0 }) {
  const children = node._children || [];
  return (
    <li>
      <OrgCard node={node} isRoot={isRoot} isLevel1={!isRoot && depth === 1}/>
      {children.length > 0 && (
        <ul>
          {children.map(child => <TreeNode key={child.id} node={child} depth={depth + 1}/>)}
        </ul>
      )}
    </li>
  );
}

export default function Organograma({ userId, profile }) {
  const toast    = useToast();
  const treeRef  = useRef(null);
  const isAdmin  = ['admin','master'].includes(profile?.access_level);
  const [exporting, setExporting] = useState(false);
  const [pessoas,   setPessoas]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  // modo: 'arvore' | 'step1' | 'step2' | 'step3'
  const [modo,        setModo]      = useState('arvore');
  // step1: quem reporta ao usuário logado
  const [meuTime,     setMeuTime]   = useState([]);
  // step2: time de um supervisor direto
  const [liderEdit,   setLiderEdit] = useState(null);
  const [subTime,     setSubTime]   = useState([]);
  // step3: time de um líder dentro do step2
  const [liderEdit3,  setLiderEdit3]  = useState(null);
  const [subTime3,    setSubTime3]    = useState([]);
  const company = profile?.company || '';

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const q = company ? `&company=${encodeURIComponent(company)}` : '';
      const r = await api.get(`/organograma?requester_id=${userId}${q}`);
      setPessoas(Array.isArray(r.data) ? r.data : []);
    } catch { toast('Erro ao carregar', 'error'); }
    finally { setLoading(false); }
  }, [userId, company]);

  useEffect(() => { load(); }, [load]);

  // Membros que reportam a uma pessoa
  const getTime = (pid) => pessoas.filter(p => (p.reports_to_list||[]).includes(pid));

  // Constrói árvore a partir do usuário logado
  const buildTree = () => {
    const getChildren = (parentId, visited = new Set()) => {
      if (visited.has(parentId)) return [];
      const nx = new Set(visited); nx.add(parentId);
      return pessoas
        .filter(p => !nx.has(p.id) && (p.reports_to_list || []).includes(parentId))
        .map(p => ({ ...p, _children: getChildren(p.id, nx) }));
    };
    // Diretos do usuário logado
    const rootVisited = new Set([userId]);
    return pessoas
      .filter(p => !rootVisited.has(p.id) && (p.reports_to_list || []).includes(userId))
      .map(p => ({ ...p, _children: getChildren(p.id, rootVisited) }));
  };

  // Salva os vínculos de reports_to_list para um conjunto de membros de um líder
  const salvarTime = async (liderId, novosIds, antesIds) => {
    const adicionados = novosIds.filter(id => !antesIds.includes(id));
    const removidos   = antesIds.filter(id => !novosIds.includes(id));
    const ops = [
      ...adicionados.map(id => {
        const p = pessoas.find(x => x.id === id);
        return api.put(`/organograma/${id}`, { requester_id:userId, reports_to_list:[...new Set([...(p.reports_to_list||[]), liderId])] });
      }),
      ...removidos.map(id => {
        const p = pessoas.find(x => x.id === id);
        return api.put(`/organograma/${id}`, { requester_id:userId, reports_to_list:(p.reports_to_list||[]).filter(x => x !== liderId) });
      }),
    ];
    const results = await Promise.all(ops);
    setPessoas(prev => {
      let u = [...prev];
      results.forEach(r => { u = u.map(p => p.id === r.data.id ? {...p, reports_to_list:r.data.reports_to_list} : p); });
      return u;
    });
  };

  // ── STEP 1: Selecionar meu time direto ──
  const iniciarStep1 = () => {
    setMeuTime(getTime(userId).map(p => p.id));
    setModo('step1');
  };

  const salvarStep1 = async () => {
    setSaving(true);
    try {
      const antes = getTime(userId).map(p => p.id);
      await salvarTime(userId, meuTime, antes);
      toast('Seu time salvo!');
      await load();
      setModo('arvore');
    } catch { toast('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  };

  // ── STEP 2: Selecionar time de um supervisor ──
  const abrirStep2 = (lider) => {
    setLiderEdit(lider);
    setSubTime(getTime(lider.id).map(p => p.id));
    setModo('step2');
  };

  const salvarStep2 = async () => {
    setSaving(true);
    try {
      const antes = getTime(liderEdit.id).map(p => p.id);
      await salvarTime(liderEdit.id, subTime, antes);
      toast(`Time de ${liderEdit.full_name.split(' ')[0]} salvo!`);
      await load();
      setModo('step1');
    } catch { toast('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  };

  // ── STEP 3: Selecionar time de um líder dentro do step2 ──
  const abrirStep3 = (lider) => {
    setLiderEdit3(lider);
    setSubTime3(getTime(lider.id).map(p => p.id));
    setModo('step3');
  };

  const salvarStep3 = async () => {
    setSaving(true);
    try {
      const antes = getTime(liderEdit3.id).map(p => p.id);
      await salvarTime(liderEdit3.id, subTime3, antes);
      toast(`Time de ${liderEdit3.full_name.split(' ')[0]} salvo!`);
      await load();
      setModo('step2');
    } catch { toast('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  };

  // Árvore somente de liderança (sem colaboradores)
  const buildLeadershipTree = () => {
    const isLider = p => ['master','admin','supervisor','lider'].includes(p.access_level);
    const getChildren = (parentId, visited = new Set()) => {
      if (visited.has(parentId)) return [];
      const nx = new Set(visited); nx.add(parentId);
      return pessoas
        .filter(p => isLider(p) && !nx.has(p.id) && (p.reports_to_list||[]).includes(parentId))
        .map(p => ({ ...p, _children: getChildren(p.id, nx) }));
    };
    const rootVisited = new Set([userId]);
    return pessoas
      .filter(p => isLider(p) && !rootVisited.has(p.id) && (p.reports_to_list||[]).includes(userId))
      .map(p => ({ ...p, _children: getChildren(p.id, rootVisited) }));
  };

  const exportarOrganograma = async () => {
    if (!treeRef.current || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(treeRef.current, {
        backgroundColor: '#111111',
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], 'organograma-lideranca.pdf', { type: 'application/pdf' });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Organograma de Liderança' });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url; a.download = 'organograma-lideranca.pdf'; a.click();
        URL.revokeObjectURL(url);
        toast('PDF baixado! Envie pelo WhatsApp manualmente.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast('Erro ao exportar', 'error');
    } finally { setExporting(false); }
  };

  if (loading) return <div style={{ color:'var(--text-muted)', padding:40, textAlign:'center' }}>Carregando...</div>;

  // ─────────────────────────────────────────────
  // STEP 1: Escolha seu time direto
  // ─────────────────────────────────────────────
  if (modo === 'step1') {
    const disponiveis = pessoas.filter(p => p.id !== userId && p.access_level !== 'master');
    const selecionados = disponiveis.filter(p => meuTime.includes(p.id));
    const lideresDoTime = selecionados.filter(p => ['supervisor','lider','admin'].includes(p.access_level));

    // Passo 3: líderes dentro dos times do passo 2 que podem ter sub-times
    const lideresNivel3 = lideresDoTime.flatMap(sup =>
      getTime(sup.id).filter(p => ['supervisor','lider','admin'].includes(p.access_level))
    ).filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i); // dedup

    const renderSecaoLideres = (titulo, lista, abrirFn) => lista.length > 0 && (
      <div style={{ marginBottom:16, padding:'14px 16px',
        background:'var(--primary)0d', border:'1px solid var(--primary)33', borderRadius:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--primary)', marginBottom:10 }}>{titulo}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {lista.map(l => (
            <button key={l.id} onClick={() => abrirFn(l)} style={{
              display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
              cursor:'pointer', width:'100%', textAlign:'left',
            }}>
              <Avatar pessoa={l} size={34}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{l.full_name}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {getTime(l.id).length > 0 ? `${getTime(l.id).length} membros configurados` : 'Sem time definido ainda'}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4, color:'var(--primary)', fontSize:12, fontWeight:600 }}>
                Editar <ChevronRight size={13}/>
              </div>
            </button>
          ))}
        </div>
      </div>
    );

    return (
      <div>
        <button onClick={() => setModo('arvore')} style={{
          display:'flex', alignItems:'center', gap:6, background:'none', border:'none',
          cursor:'pointer', color:'var(--text-muted)', fontSize:13, fontWeight:600, padding:'0 0 20px 0' }}>
          <ChevronLeft size={16}/> Voltar
        </button>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:16, color:'var(--text)', marginBottom:4 }}>
            Passo 1 — Quem reporta diretamente a você?
          </div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>
            Selecione as pessoas do seu time direto.
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
          {disponiveis.map(p => (
            <MembroRow key={p.id} pessoa={p} selecionado={meuTime.includes(p.id)}
              onClick={() => setMeuTime(d => d.includes(p.id) ? d.filter(x=>x!==p.id) : [...d,p.id])}/>
          ))}
        </div>

        {renderSecaoLideres('Passo 2 — Configure o time de cada supervisor', lideresDoTime, abrirStep2)}
        {renderSecaoLideres('Passo 3 — Configure o time de cada líder', lideresNivel3, abrirStep3)}

        <div style={{ position:'sticky', bottom:16, display:'flex', gap:10, marginTop: (lideresDoTime.length > 0 || lideresNivel3.length > 0) ? 0 : 60 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setModo('arvore')}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={salvarStep1} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar meu time'}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // STEP 2: Escolha o time de um líder
  // ─────────────────────────────────────────────
  if (modo === 'step2' && liderEdit) {
    const disponiveis = pessoas.filter(p => p.id !== liderEdit.id && p.access_level !== 'master');
    // Líderes já selecionados no sub-time que podem ter sub-times próprios
    const lideresNoSubTime = disponiveis.filter(p =>
      subTime.includes(p.id) && ['supervisor','lider','admin'].includes(p.access_level)
    );
    return (
      <div>
        <button onClick={() => setModo('step1')} style={{
          display:'flex', alignItems:'center', gap:6, background:'none', border:'none',
          cursor:'pointer', color:'var(--text-muted)', fontSize:13, fontWeight:600, padding:'0 0 20px 0' }}>
          <ChevronLeft size={16}/> Voltar ao passo 1
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20,
          padding:'14px 18px', background:'var(--surface)', borderRadius:12,
          borderLeft:'4px solid var(--primary)' }}>
          <Avatar pessoa={liderEdit} size={48}/>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>{liderEdit.full_name}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>
              Quem reporta diretamente a {liderEdit.full_name.split(' ')[0]}?
            </div>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
          {disponiveis.map(p => (
            <MembroRow key={p.id} pessoa={p} selecionado={subTime.includes(p.id)}
              onClick={() => setSubTime(d => d.includes(p.id) ? d.filter(x=>x!==p.id) : [...d,p.id])}/>
          ))}
        </div>

        {lideresNoSubTime.length > 0 && (
          <div style={{ marginBottom:80, padding:'14px 16px',
            background:'var(--primary)0d', border:'1px solid var(--primary)33', borderRadius:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--primary)', marginBottom:10 }}>
              Passo 3 — Configure o time de cada líder deste grupo (opcional)
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {lideresNoSubTime.map(l => (
                <button key={l.id} onClick={() => abrirStep3(l)} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                  background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10,
                  cursor:'pointer', width:'100%', textAlign:'left',
                }}>
                  <Avatar pessoa={l} size={34}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{l.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                      {getTime(l.id).length > 0 ? `${getTime(l.id).length} membros configurados` : 'Sem time definido ainda'}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, color:'var(--primary)', fontSize:12, fontWeight:600 }}>
                    Editar <ChevronRight size={13}/>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ position:'sticky', bottom:16, display:'flex', gap:10, marginTop: lideresNoSubTime.length > 0 ? 0 : 60 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setModo('step1')}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={salvarStep2} disabled={saving}>
            {saving ? 'Salvando...' : `Salvar time de ${liderEdit.full_name.split(' ')[0]}`}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // STEP 3: Time de um líder dentro do step2
  // ─────────────────────────────────────────────
  if (modo === 'step3' && liderEdit3) {
    const disponiveis3 = pessoas.filter(p => p.id !== liderEdit3.id && p.access_level !== 'master');
    return (
      <div>
        <button onClick={() => setModo('step2')} style={{
          display:'flex', alignItems:'center', gap:6, background:'none', border:'none',
          cursor:'pointer', color:'var(--text-muted)', fontSize:13, fontWeight:600, padding:'0 0 20px 0' }}>
          <ChevronLeft size={16}/> Voltar ao passo 2
        </button>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--primary)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
            Passo 3
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:14,
            padding:'14px 18px', background:'var(--surface)', borderRadius:12,
            borderLeft:'4px solid var(--primary)' }}>
            <Avatar pessoa={liderEdit3} size={48}/>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>{liderEdit3.full_name}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                Quem reporta diretamente a {liderEdit3.full_name.split(' ')[0]}?
              </div>
            </div>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:80 }}>
          {disponiveis3.map(p => (
            <MembroRow key={p.id} pessoa={p} selecionado={subTime3.includes(p.id)}
              onClick={() => setSubTime3(d => d.includes(p.id) ? d.filter(x=>x!==p.id) : [...d,p.id])}/>
          ))}
        </div>

        <div style={{ position:'sticky', bottom:16, display:'flex', gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={() => setModo('step2')}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:2, justifyContent:'center' }} onClick={salvarStep3} disabled={saving}>
            {saving ? 'Salvando...' : `Salvar time de ${liderEdit3.full_name.split(' ')[0]}`}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // ÁRVORE VISUAL
  // ─────────────────────────────────────────────
  const directReports = buildTree();
  const leadershipReports = buildLeadershipTree();

  const rootNode = {
    id: userId,
    full_name: profile?.full_name || 'Você',
    access_level: profile?.access_level,
    sector: profile?.sector,
    avatar_url: profile?.avatar_url,
    _children: directReports,
  };

  const leadershipRootNode = {
    ...rootNode,
    _children: leadershipReports,
  };

  const orgTreeCSS = `
    .org-tree { overflow-x:auto; padding:16px 8px 32px; }
    .org-tree ul {
      display:flex; justify-content:center; align-items:flex-start;
      padding-top:28px; position:relative;
      list-style:none; margin:0; padding-left:0;
    }
    .org-tree > ul { padding-top:0; }
    .org-tree ul::before {
      content:''; position:absolute; top:0; left:50%; transform:translateX(-50%);
      border-left:2px solid var(--primary); height:28px;
    }
    .org-tree > ul::before { display:none; }
    .org-tree li {
      display:flex; flex-direction:column; align-items:center;
      padding:0 8px; position:relative;
    }
    .org-tree ul li::before, .org-tree ul li::after {
      content:''; position:absolute; top:0; width:50%;
      border-top:2px solid var(--primary);
    }
    .org-tree ul li::before { right:50%; }
    .org-tree ul li::after  { left:50%;  }
    .org-tree ul li:only-child::before,
    .org-tree ul li:only-child::after { display:none; }
    .org-tree ul li:first-child::before,
    .org-tree ul li:last-child::after  { border-color:transparent; }
  `;

  return (
    <div>
      <style>{orgTreeCSS}</style>

      <div className="page-header">
        <div>
          <div className="page-title">Organograma</div>
          <div className="page-subtitle">{pessoas.length} pessoas na equipe</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {directReports.length > 0 && (
            <button className="btn btn-ghost" onClick={exportarOrganograma} disabled={exporting}
              title="Exportar liderança e compartilhar no WhatsApp"
              style={{ gap:6 }}>
              <Download size={15}/>
              {exporting ? 'Gerando...' : 'Exportar'}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={iniciarStep1}>
              <Users size={15}/> Configurar times
            </button>
          )}
        </div>
      </div>

      {directReports.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--text-muted)',
          background:'var(--surface)', borderRadius:14, border:'1px dashed var(--border)' }}>
          <Share2 size={32} style={{ opacity:.25, marginBottom:12 }}/>
          <p style={{ fontWeight:600, marginBottom:6 }}>Nenhuma hierarquia configurada ainda.</p>
          {isAdmin && (
            <p style={{ fontSize:13 }}>
              Clique em <strong style={{ color:'var(--primary)' }}>Configurar times</strong> para começar.
            </p>
          )}
        </div>
      ) : (
        <div ref={treeRef} className="org-tree" style={{ background:'var(--bg)', padding:'24px 12px 40px' }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <div style={{ fontWeight:800, fontSize:18, color:'var(--text)' }}>Organograma de Liderança</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{profile?.company || ''}</div>
          </div>
          <ul style={{ paddingTop:0 }}>
            <TreeNode key={leadershipRootNode.id} node={leadershipRootNode} isRoot={true}/>
          </ul>
        </div>
      )}
    </div>
  );
}
