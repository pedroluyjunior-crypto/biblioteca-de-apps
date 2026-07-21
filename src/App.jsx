import { useState, useRef, useEffect } from "react";
import { ref, set, remove, onValue } from "firebase/database";
import { db } from "./firebase";

const ACCEPTED_EXTS = [".html",".htm",".py",".bat",".jsx",".js",".txt",".json",".css",".csv",".md",".ts",".tsx"];

function readFileAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Erro ao ler arquivo"));
    r.readAsText(file);
  });
}

function slugify(name) { return name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase(); }

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("list");
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCode, setEditCode] = useState("");
  const [toast, setToast] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [renameValues, setRenameValues] = useState([]);
  const [groupModal, setGroupModal] = useState(null);
  const [groupName, setGroupName] = useState("");
  const [replaceModal, setReplaceModal] = useState(null);
  const fileRef = useRef();
  const replaceRef = useRef();

  // Realtime listener
  useEffect(() => {
    const dbRef = ref(db, "biblioteca-de-apps");
    const unsub = onValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setProjects(list);
      } else {
        setProjects([]);
      }
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const saveProject = async (p) => {
    await set(ref(db, `biblioteca-de-apps/${p.id}`), p);
  };

  const removeProject = async (id) => {
    await remove(ref(db, `biblioteca-de-apps/${id}`));
  };

  // ── UPLOAD ──────────────────────────────────────────────────────────────────
  const addProjects = async (files) => {
    setUploading(true);
    const validFiles = [...files].filter(f => ACCEPTED_EXTS.some(ext => f.name.toLowerCase().endsWith(ext)));
    if (!validFiles.length) {
      showToast("Tipo não suportado. Use: html, py, bat, js, txt...", "err");
      setUploading(false);
      return;
    }
    const parsed = await Promise.all(validFiles.map(async (f) => {
      const code = await readFileAsText(f);
      const ext = f.name.split(".").pop().toLowerCase();
      return { id: slugify(f.name) + "-" + Date.now(), name: f.name, ext, description: "", code, createdAt: new Date().toISOString() };
    }));
    setRenameModal({ files: parsed });
    setRenameValues(parsed.map(f => f.name));
    setUploading(false);
  };

  const confirmRename = () => {
    if (!renameModal) return;
    const renamed = renameModal.files.map((f, i) => ({
      ...f, name: renameValues[i] || f.name,
      ext: (renameValues[i] || f.name).split(".").pop().toLowerCase(),
    }));
    setRenameModal(null);
    if (renamed.length > 1) {
      setGroupModal({ files: renamed });
      setGroupName(renamed[0].name.replace(/\.[^.]+$/, ""));
    } else {
      renamed.forEach(saveProject);
      showToast("Arquivo salvo!");
    }
  };

  const saveGrouped = async () => {
    if (!groupModal) return;
    const group = {
      id: slugify(groupName) + "-" + Date.now(),
      name: groupName, ext: "group",
      description: groupModal.files.map(f => f.name).join(", "),
      code: groupModal.files.map(f => `// ===== ${f.name} =====\n${f.code}`).join("\n\n"),
      files: groupModal.files,
      createdAt: new Date().toISOString(),
    };
    await saveProject(group);
    showToast("Projeto agrupado salvo!");
    setGroupModal(null); setGroupName("");
  };

  const saveSeparate = async () => {
    if (!groupModal) return;
    await Promise.all(groupModal.files.map(saveProject));
    showToast(`${groupModal.files.length} arquivos salvos!`);
    setGroupModal(null); setGroupName("");
  };

  const startReplace = (project) => {
    setReplaceModal({ project });
    setTimeout(() => replaceRef.current?.click(), 100);
  };

  const handleReplaceFile = async (files) => {
    if (!files?.[0] || !replaceModal) return;
    const f = files[0];
    const code = await readFileAsText(f);
    const ext = f.name.split(".").pop().toLowerCase();
    const updated = { ...replaceModal.project, code, ext, updatedAt: new Date().toISOString() };
    await saveProject(updated);
    showToast("Arquivo substituído!");
    setReplaceModal(null);
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); addProjects(e.dataTransfer.files); };
  const openPreview = (p) => { setActive(p); setView("preview"); };
  const openEdit = (p) => { setActive(p); setEditName(p.name); setEditDesc(p.description); setEditCode(p.code); setView("edit"); };

  const saveEdit = async () => {
    const updated = { ...active, name: editName, description: editDesc, code: editCode, updatedAt: new Date().toISOString() };
    await saveProject(updated);
    showToast("Projeto salvo!");
    setView("list");
  };

  const confirmDelete = async () => {
    await removeProject(confirmId);
    showToast("Removido.", "err");
    setConfirmId(null);
    if (view !== "list") setView("list");
  };

  const copyCode = (p) => {
    const ta = document.createElement("textarea");
    ta.value = p.code; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    showToast("Código copiado!");
  };

  const openInBrowser = (p) => {
    try {
      const blob = new Blob([p.code], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast("Aberto! Ctrl+S para salvar no PC.");
    } catch { showToast("Use 📋 Copiar código.", "err"); }
  };

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  if (!loaded) return (
    <div style={styles.loading}>
      <div style={styles.spinner} />
      <span style={{ color: "#94a3b8", marginTop: 12 }}>Conectando ao Firebase…</span>
    </div>
  );

  return (
    <div style={styles.root}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>{"</>"}</span>
          <span style={styles.logoText}>Meus Projetos</span>
        </div>
        <button style={styles.uploadBtn} onClick={() => fileRef.current.click()} disabled={uploading}>
          {uploading ? "Enviando…" : "+ Adicionar Arquivos"}
        </button>
        <input ref={fileRef} type="file" accept={ACCEPTED_EXTS.join(",")} multiple style={{ display: "none" }}
          onChange={e => { addProjects(e.target.files); e.target.value = ""; }} />
        <input ref={replaceRef} type="file" accept={ACCEPTED_EXTS.join(",")} style={{ display: "none" }}
          onChange={e => { handleReplaceFile(e.target.files); e.target.value = ""; }} />
        <div style={styles.sideStats}>
          <span style={styles.statNum}>{projects.length}</span>
          <span style={styles.statLabel}>arquivo{projects.length !== 1 ? "s" : ""} salvo{projects.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={styles.firebaseBadge}>🔥 Firebase</div>
        {view !== "list" && (
          <button style={styles.backBtn} onClick={() => setView("list")}>← Voltar à lista</button>
        )}
      </aside>

      <main style={styles.main}>
        {toast && <div style={{ ...styles.toast, background: toast.type === "err" ? "#ef4444" : "#22c55e" }}>{toast.msg}</div>}

        {view === "list" && (
          <>
            <div style={styles.topBar}>
              <input style={styles.search} placeholder="Buscar arquivo…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ ...styles.dropzone, borderColor: dragging ? "#6366f1" : "#334155", background: dragging ? "#1e293b" : "transparent" }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
              <span style={{ fontSize: 28, marginBottom: 6 }}>📂</span>
              <span style={{ color: "#64748b", fontSize: 14 }}>Arraste arquivos aqui (.html, .py, .bat, .js, .txt…)</span>
            </div>
            {filtered.length === 0 && (
              <div style={styles.empty}>{projects.length === 0 ? "Nenhum arquivo ainda." : `Sem resultados para "${search}".`}</div>
            )}
            <div style={styles.grid}>
              {filtered.map(p => (
                <ProjectCard key={p.id} project={p}
                  onPreview={() => openPreview(p)} onEdit={() => openEdit(p)}
                  onDelete={() => setConfirmId(p.id)} onCopy={() => copyCode(p)}
                  onOpen={() => openInBrowser(p)} onReplace={() => startReplace(p)} />
              ))}
            </div>
          </>
        )}

        {view === "preview" && active && (
          <div style={styles.previewWrap}>
            <div style={styles.previewHeader}>
              <span style={styles.previewTitle}>{active.name}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={styles.actionBtn} onClick={() => openEdit(active)}>✏️ Editar</button>
                <button style={styles.actionBtn} onClick={() => openInBrowser(active)}>🌐 Abrir</button>
                <button style={styles.actionBtn} onClick={() => copyCode(active)}>📋 Copiar</button>
                <button style={styles.actionBtn} onClick={() => startReplace(active)}>🔄 Substituir</button>
                <button style={{ ...styles.actionBtn, background: "#ef4444", border: "none", color: "#fff" }} onClick={() => setConfirmId(active.id)}>🗑️</button>
              </div>
            </div>
            <iframe style={styles.iframe} srcDoc={active.code} title={active.name} sandbox="allow-scripts allow-same-origin" />
          </div>
        )}

        {view === "edit" && active && (
          <div style={styles.editWrap}>
            <div style={styles.editHeader}>
              <span style={styles.previewTitle}>Editar: {active.name}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...styles.actionBtn, background: "#6366f1" }} onClick={saveEdit}>💾 Salvar</button>
                <button style={styles.actionBtn} onClick={() => setView("list")}>Cancelar</button>
              </div>
            </div>
            <div style={styles.editFields}>
              <label style={styles.label}>Nome</label>
              <input style={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
              <label style={styles.label}>Descrição (opcional)</label>
              <input style={styles.input} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              <label style={styles.label}>Código</label>
              <textarea style={styles.textarea} value={editCode} onChange={e => setEditCode(e.target.value)} spellCheck={false} />
            </div>
          </div>
        )}
      </main>

      {/* RENAME MODAL */}
      {renameModal && (
        <div style={styles.overlay}>
          <div style={{ ...styles.modal, minWidth: 360, maxWidth: 480, width: "90%" }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>✏️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Deseja renomear os arquivos?</div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 16 }}>Edite ou mantenha os nomes originais.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, textAlign: "left" }}>
              {renameModal.files.map((f, i) => (
                <div key={f.id}>
                  <label style={{ ...styles.label, marginBottom: 4, display: "block" }}>📄 {f.name}</label>
                  <input style={styles.input} value={renameValues[i]} onChange={e => { const v=[...renameValues]; v[i]=e.target.value; setRenameValues(v); }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...styles.actionBtn, flex: 1 }} onClick={() => setRenameModal(null)}>Cancelar</button>
              <button style={{ ...styles.actionBtn, flex: 1, background: "#6366f1", border: "none", color: "#fff", fontWeight: 700 }} onClick={confirmRename}>Continuar →</button>
            </div>
          </div>
        </div>
      )}

      {/* GROUP MODAL */}
      {groupModal && (
        <div style={styles.overlay}>
          <div style={{ ...styles.modal, minWidth: 340 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Como salvar os {groupModal.files.length} arquivos?</div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 12, textAlign: "left", background: "#0f172a", borderRadius: 8, padding: "10px 12px" }}>
              {groupModal.files.map(f => <div key={f.id} style={{ marginBottom: 2 }}>📄 {f.name}</div>)}
            </div>
            <div style={{ marginBottom: 16, textAlign: "left" }}>
              <label style={styles.label}>Nome do projeto (se agrupar)</label>
              <input style={styles.input} value={groupName} onChange={e => setGroupName(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <button style={{ ...styles.actionBtn, background: "#6366f1", border: "none", color: "#fff", fontWeight: 700 }} onClick={saveGrouped}>📦 Agrupar como um projeto só</button>
              <button style={styles.actionBtn} onClick={saveSeparate}>📄 Salvar cada arquivo separado</button>
              <button style={{ ...styles.actionBtn, color: "#64748b" }} onClick={() => setGroupModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirmId && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Deletar projeto?</div>
            <div style={{ color: "#475569", fontSize: 12, marginBottom: 20 }}>Esta ação não pode ser desfeita.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...styles.actionBtn, flex: 1 }} onClick={() => setConfirmId(null)}>Cancelar</button>
              <button style={{ ...styles.actionBtn, flex: 1, background: "#ef4444", border: "none", color: "#fff", fontWeight: 700 }} onClick={confirmDelete}>Deletar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onPreview, onEdit, onDelete, onCopy, onOpen, onReplace }) {
  const dateStr = formatDate(project.updatedAt || project.createdAt);
  const wasUpdated = !!project.updatedAt;
  const preview = project.code.slice(0, 80).replace(/<[^>]+>/g, "").trim();
  const ext = project.ext || "html";
  const extColors = {
    html:"#6366f1",htm:"#6366f1",py:"#3b82f6",bat:"#f59e0b",
    js:"#eab308",jsx:"#06b6d4",ts:"#3b82f6",tsx:"#06b6d4",
    json:"#10b981",txt:"#94a3b8",css:"#ec4899",md:"#8b5cf6",group:"#f97316",
  };
  const color = extColors[ext] || "#64748b";
  const badgeLabel = ext === "group" ? `📦 ${project.files?.length || ""}` : `.${ext}`;

  return (
    <div style={styles.card}>
      <div style={styles.cardTop} onClick={onPreview}>
        <div style={{ ...styles.cardIcon, background: color+"22", color, border:`1px solid ${color}44` }}>{badgeLabel}</div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div style={styles.cardName}>{project.name}</div>
          {project.description && <div style={styles.cardDesc}>{project.description}</div>}
          {preview && <div style={styles.cardPreview}>{preview}</div>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
          <div style={styles.cardDateBadge}>{dateStr}</div>
          {wasUpdated && <div style={{ fontSize:10, color:"#f59e0b", fontWeight:600 }}>🔄 atualizado</div>}
        </div>
      </div>
      <div style={styles.cardActions}>
        <button style={styles.cardBtn} onClick={onPreview}>👁️ <span style={styles.btnLabel}>Ver</span></button>
        <button style={styles.cardBtn} onClick={onEdit}>✏️ <span style={styles.btnLabel}>Editar</span></button>
        <button style={styles.cardBtn} onClick={onOpen}>🌐 <span style={styles.btnLabel}>Abrir</span></button>
        <button style={styles.cardBtn} onClick={onCopy}>📋 <span style={styles.btnLabel}>Copiar</span></button>
        <button style={styles.cardBtn} onClick={onReplace}>🔄 <span style={styles.btnLabel}>Substituir</span></button>
        <button style={{ ...styles.cardBtn, color:"#ef4444" }} onClick={onDelete}>🗑️ <span style={{ ...styles.btnLabel, color:"#ef4444" }}>Deletar</span></button>
      </div>
    </div>
  );
}

const styles = {
  root:{display:"flex",height:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'Inter',system-ui,sans-serif",overflow:"hidden"},
  sidebar:{width:220,background:"#1e293b",display:"flex",flexDirection:"column",padding:"24px 16px",gap:12,flexShrink:0,borderRight:"1px solid #334155"},
  logo:{display:"flex",alignItems:"center",gap:8,marginBottom:8},
  logoIcon:{background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,padding:"4px 8px",borderRadius:6},
  logoText:{fontWeight:700,fontSize:15,color:"#e2e8f0"},
  uploadBtn:{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,fontWeight:600,cursor:"pointer"},
  sideStats:{display:"flex",flexDirection:"column",alignItems:"center",background:"#0f172a",borderRadius:8,padding:"12px 8px"},
  statNum:{fontSize:28,fontWeight:700,color:"#6366f1"},
  statLabel:{fontSize:12,color:"#64748b"},
  firebaseBadge:{background:"#1a1a2e",border:"1px solid #f97316",color:"#f97316",fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:8,textAlign:"center"},
  backBtn:{marginTop:"auto",background:"transparent",border:"1px solid #334155",color:"#94a3b8",borderRadius:8,padding:"8px 12px",fontSize:13,cursor:"pointer"},
  main:{flex:1,display:"flex",flexDirection:"column",overflow:"auto",padding:24,position:"relative"},
  topBar:{display:"flex",gap:12,marginBottom:16},
  search:{flex:1,background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"10px 14px",color:"#e2e8f0",fontSize:14,outline:"none"},
  dropzone:{border:"2px dashed #334155",borderRadius:12,padding:"20px",display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20,transition:"all .2s"},
  empty:{color:"#475569",textAlign:"center",marginTop:60,fontSize:15},
  grid:{display:"flex",flexDirection:"column",gap:12},
  card:{background:"#1e293b",border:"1px solid #334155",borderRadius:12,overflow:"hidden"},
  cardTop:{padding:"18px 16px 14px",display:"flex",gap:12,cursor:"pointer",alignItems:"flex-start"},
  cardIcon:{fontWeight:700,fontSize:11,padding:"5px 7px",borderRadius:6,flexShrink:0,marginTop:2},
  cardName:{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4,lineHeight:1.3},
  cardDesc:{fontSize:12,color:"#6366f1",marginBottom:4},
  cardPreview:{fontSize:11,color:"#475569",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:260},
  cardDateBadge:{background:"#0f172a",color:"#94a3b8",fontSize:11,fontWeight:500,padding:"3px 8px",borderRadius:6,whiteSpace:"nowrap"},
  cardActions:{display:"flex",borderTop:"1px solid #1e3a5f",padding:"8px 10px",gap:2,background:"#162032",flexWrap:"wrap"},
  cardBtn:{background:"transparent",border:"none",color:"#64748b",cursor:"pointer",fontSize:12,padding:"5px 6px",borderRadius:6,display:"flex",alignItems:"center",gap:3},
  btnLabel:{fontSize:11,color:"#64748b",fontWeight:500},
  toast:{position:"fixed",top:16,right:16,color:"#fff",padding:"10px 18px",borderRadius:8,fontWeight:600,fontSize:13,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,.4)"},
  previewWrap:{display:"flex",flexDirection:"column",height:"100%",gap:12},
  previewHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8},
  previewTitle:{fontWeight:700,fontSize:17},
  actionBtn:{background:"#1e293b",border:"1px solid #334155",color:"#e2e8f0",padding:"7px 14px",borderRadius:8,fontSize:13,cursor:"pointer"},
  iframe:{flex:1,border:"none",borderRadius:10,background:"#fff"},
  editWrap:{display:"flex",flexDirection:"column",gap:12,height:"100%"},
  editHeader:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  editFields:{display:"flex",flexDirection:"column",gap:8,flex:1},
  label:{fontSize:12,color:"#64748b",fontWeight:600},
  input:{background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"},
  textarea:{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"12px",color:"#a5b4fc",fontSize:12,fontFamily:"monospace",outline:"none",resize:"none",minHeight:300},
  loading:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a"},
  spinner:{width:32,height:32,border:"3px solid #1e293b",borderTop:"3px solid #6366f1",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16},
  modal:{background:"#1e293b",border:"1px solid #334155",borderRadius:14,padding:"28px 24px",minWidth:280,textAlign:"center",maxHeight:"90vh",overflowY:"auto"},
};
