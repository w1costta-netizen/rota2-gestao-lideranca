import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Arrow, Circle, Rect, Text, Transformer } from 'react-konva';
import { Minus, Type, Circle as CircleIcon, ArrowRight, Square, Trash2, RotateCcw, Check } from 'lucide-react';

const COLORS = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#ffffff','#000000'];
const TOOLS  = [
  { id: 'arrow',  label: 'Seta',      Icon: ArrowRight },
  { id: 'circle', label: 'Círculo',   Icon: CircleIcon },
  { id: 'rect',   label: 'Retângulo', Icon: Square },
  { id: 'text',   label: 'Texto',     Icon: Type },
];

function useImage(url) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!url) return;
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.src = url;
  }, [url]);
  return img;
}

export default function FotoEditor({ photoUrl, initialAnnotations, onSave, onCancel }) {
  const containerRef = useRef(null);
  const stageRef     = useRef(null);
  const [dims, setDims]       = useState({ w: 0, h: 0 });
  const [scale, setScale]     = useState(1);
  const [tool, setTool]       = useState('arrow');
  const [color, setColor]     = useState('#ef4444');
  const [shapes, setShapes]   = useState(initialAnnotations?.shapes || []);
  const [drawing, setDrawing] = useState(null);
  const [selId, setSelId]     = useState(null);
  const [history, setHistory] = useState([initialAnnotations?.shapes || []]);
  const [hIdx, setHIdx]       = useState(0);
  const trRef  = useRef(null);
  const imgRef = useRef(null);
  const photo  = useImage(photoUrl);

  // Calcula dimensões responsivas
  useEffect(() => {
    if (!containerRef.current || !photo) return;
    const cw = containerRef.current.clientWidth;
    const ratio = photo.height / photo.width;
    const maxH  = window.innerHeight * 0.55;
    let w = cw, h = cw * ratio;
    if (h > maxH) { h = maxH; w = maxH / ratio; }
    setDims({ w, h });
    setScale(w / photo.width);
  }, [photo, containerRef]);

  // Transformer para seleção
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return;
    if (selId) {
      const node = stageRef.current.findOne('#' + selId);
      if (node) { trRef.current.nodes([node]); trRef.current.getLayer().batchDraw(); }
    } else {
      trRef.current.nodes([]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selId, shapes]);

  const pushHistory = useCallback((next) => {
    const newH = history.slice(0, hIdx + 1).concat([next]);
    setHistory(newH);
    setHIdx(newH.length - 1);
    setShapes(next);
  }, [history, hIdx]);

  const undo = () => {
    if (hIdx === 0) return;
    setHIdx(h => h - 1);
    setShapes(history[hIdx - 1]);
    setSelId(null);
  };

  const deleteSelected = () => {
    if (!selId) return;
    const next = shapes.filter(s => s.id !== selId);
    pushHistory(next);
    setSelId(null);
  };

  const getId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

  const getPos = (e) => {
    const stage = stageRef.current;
    const ptr   = stage.getPointerPosition();
    return { x: ptr.x / scale, y: ptr.y / scale };
  };

  const onMouseDown = (e) => {
    if (e.target !== imgRef.current) return;
    const pos = getPos(e);
    const id  = getId();
    if (tool === 'arrow') {
      setDrawing({ id, type: 'arrow', color, points: [pos.x, pos.y, pos.x, pos.y] });
    } else if (tool === 'circle') {
      setDrawing({ id, type: 'circle', color, x: pos.x, y: pos.y, radius: 0 });
    } else if (tool === 'rect') {
      setDrawing({ id, type: 'rect', color, x: pos.x, y: pos.y, width: 0, height: 0 });
    } else if (tool === 'text') {
      const text = window.prompt('Digite o texto da anotação:');
      if (!text?.trim()) return;
      pushHistory([...shapes, { id, type: 'text', color, x: pos.x, y: pos.y, text: text.trim(), fontSize: 18 }]);
    }
    setSelId(null);
  };

  const onMouseMove = (e) => {
    if (!drawing) return;
    const pos = getPos(e);
    if (drawing.type === 'arrow') {
      setDrawing(d => ({ ...d, points: [d.points[0], d.points[1], pos.x, pos.y] }));
    } else if (drawing.type === 'circle') {
      const r = Math.hypot(pos.x - drawing.x, pos.y - drawing.y);
      setDrawing(d => ({ ...d, radius: r }));
    } else if (drawing.type === 'rect') {
      setDrawing(d => ({ ...d, width: pos.x - d.x, height: pos.y - d.y }));
    }
  };

  const onMouseUp = () => {
    if (!drawing) return;
    const minSize = 5;
    let valid = false;
    if (drawing.type === 'arrow') valid = Math.hypot(drawing.points[2]-drawing.points[0], drawing.points[3]-drawing.points[1]) > minSize;
    if (drawing.type === 'circle') valid = drawing.radius > minSize;
    if (drawing.type === 'rect')   valid = Math.abs(drawing.width) > minSize && Math.abs(drawing.height) > minSize;
    if (valid) pushHistory([...shapes, drawing]);
    setDrawing(null);
  };

  const updateShape = (id, attrs) => {
    const next = shapes.map(s => s.id === id ? { ...s, ...attrs } : s);
    pushHistory(next);
  };

  const exportAnnotations = () => {
    // Exporta como imagem com anotações renderizadas
    if (!stageRef.current) return null;
    setSelId(null);
    setTimeout(() => {}, 0);
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1 / scale });
    return { dataUrl, shapes };
  };

  const handleSave = () => {
    setSelId(null);
    // Espera transformer sumir antes de capturar
    requestAnimationFrame(() => {
      const dataUrl = stageRef.current?.toDataURL({ pixelRatio: 1 / scale });
      onSave({ dataUrl, shapes });
    });
  };

  const renderShape = (s, isPreview = false) => {
    const common = {
      key: s.id, id: s.id,
      draggable: !isPreview,
      onClick: isPreview ? undefined : () => setSelId(s.id),
      onTap:   isPreview ? undefined : () => setSelId(s.id),
      onDragEnd: isPreview ? undefined : (e) => updateShape(s.id, { x: e.target.x(), y: e.target.y() }),
    };
    const sx = isPreview ? 1 : scale;
    if (s.type === 'arrow') return (
      <Arrow {...common} points={s.points.map((p,i) => i % 2 === 0 ? p * sx : p * sx)}
        stroke={s.color} strokeWidth={3} fill={s.color} pointerLength={10} pointerWidth={8}/>
    );
    if (s.type === 'circle') return (
      <Circle {...common} x={s.x * sx} y={s.y * sx} radius={s.radius * sx}
        stroke={s.color} strokeWidth={3} fill="transparent"/>
    );
    if (s.type === 'rect') return (
      <Rect {...common} x={s.x * sx} y={s.y * sx} width={s.width * sx} height={s.height * sx}
        stroke={s.color} strokeWidth={3} fill="transparent"/>
    );
    if (s.type === 'text') return (
      <Text {...common} x={s.x * sx} y={s.y * sx} text={s.text}
        fontSize={(s.fontSize || 18) * sx} fill={s.color}
        fontStyle="bold" shadowColor="rgba(0,0,0,0.6)" shadowBlur={4} shadowOffsetX={1} shadowOffsetY={1}/>
    );
    return null;
  };

  if (!photo) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:40, color:'var(--text-muted)' }}>
      Carregando imagem...
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Barra de ferramentas */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {TOOLS.map(({ id, label, Icon }) => (
          <button key={id} title={label}
            onClick={() => { setTool(id); setSelId(null); }}
            style={{
              display:'flex', alignItems:'center', gap:4, padding:'6px 12px',
              borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
              background: tool === id ? 'var(--primary)' : 'var(--surface)',
              color: tool === id ? '#fff' : 'var(--text)',
              border: `1px solid ${tool === id ? 'var(--primary)' : 'var(--border)'}`,
            }}>
            <Icon size={14}/>{label}
          </button>
        ))}
        <div style={{ width:1, height:28, background:'var(--border)', margin:'0 4px' }}/>
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            style={{
              width:24, height:24, borderRadius:'50%', background:c, border:'none', cursor:'pointer',
              outline: color === c ? `3px solid var(--primary)` : `2px solid var(--border)`,
              outlineOffset:2, flexShrink:0,
            }}/>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button title="Desfazer" onClick={undo} disabled={hIdx === 0}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px',
              cursor: hIdx===0 ? 'not-allowed' : 'pointer', color: hIdx===0 ? 'var(--text-muted)' : 'var(--text)' }}>
            <RotateCcw size={14}/>
          </button>
          {selId && (
            <button title="Apagar selecionado" onClick={deleteSelected}
              style={{ background:'#ef444420', border:'1px solid #ef4444', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'#ef4444' }}>
              <Trash2 size={14}/>
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ width:'100%', touchAction:'none', cursor: tool === 'text' ? 'text' : 'crosshair' }}>
        {dims.w > 0 && (
          <Stage ref={stageRef} width={dims.w} height={dims.h}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onTouchStart={onMouseDown} onTouchMove={onMouseMove} onTouchEnd={onMouseUp}>
            <Layer>
              <KonvaImage ref={imgRef} image={photo} width={dims.w} height={dims.h}/>
              {shapes.map(s => renderShape(s))}
              {drawing && renderShape(drawing)}
              <Transformer ref={trRef} rotateEnabled={false}
                boundBoxFunc={(old, n) => ({ ...n, width: Math.max(20, n.width), height: Math.max(20, n.height) })}/>
            </Layer>
          </Stage>
        )}
      </div>

      <p style={{ fontSize:11, color:'var(--text-muted)', margin:0 }}>
        Clique e arraste para desenhar • Clique numa forma para selecionar e mover • Texto: clique no ponto desejado
      </p>

      {/* Ações */}
      <div style={{ display:'flex', gap:10 }}>
        <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center' }} onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" style={{ flex:1, justifyContent:'center' }} onClick={handleSave}>
          <Check size={15}/> Confirmar anotações
        </button>
      </div>
    </div>
  );
}
