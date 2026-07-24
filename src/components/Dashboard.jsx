  1	import React, { useCallback, useEffect, useMemo, useState } from "react";
  2	import { supabase } from "../supabaseClient";
  3	import { generarAccessCode } from "../utils/accessCode";
  4	
  5	import {
  6	  UserPlus,
  7	  LogOut,
  8	  FileText,
  9	  ChevronDown,
  10	  ChevronRight,
  11	  Copy,
  12	  Phone,
  13	  Check,
  14	  X,
  15	  MapPin,
  16	  Users,
  17	  Search,
  18	  CheckCircle2,
  19	  Clock,
  20	  TrendingUp,
  21	  Shield,
  22	  AlertCircle,
  23	} from "lucide-react";
  24	
  25	import AddPersonModal from "../AddPersonModal";
  26	import ModalTelefono from "./ModalTelefono";
  27	import ModalDireccion from "./ModalDireccion";
  28	import ConfirmVotoModal from "./ConfirmVotoModal";
  29	import {
  30	  generateSuperadminPDF,
  31	  generateCoordinadorPDF,
  32	  generateSubcoordinadorPDF,
  33	} from "../services/pdfService";
  34	
  35	import { getEstadisticas } from "../services/estadisticasService";
  36	
  37	import {
  38	  normalizeCI,
  39	  getMisSubcoordinadores,
  40	  getVotantesDeSubcoord,
  41	  getMisVotantes,
  42	  getPersonasDisponibles,
  43	  getCoordsDeDigente,
  44	  getSubsDeDigente,
  45	  getVotantesDirectosDirigente,
  46	  getTodosVotantesDirigente,
  47	} from "../utils/estructuraHelpers";
  48	
  49	// ======================= SMALL REUSABLE COMPONENTS =======================
  50	
  50	const Badge = ({ children, variant = "default" }) => {
  51	  const variants = {
  52	    default: "bg-slate-100 text-slate-700",
  53	    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  54	    red: "bg-red-50 text-red-700 border border-red-200",
  55	    blue: "bg-blue-50 text-blue-700 border border-blue-200",
  56	    amber: "bg-amber-50 text-amber-700 border border-amber-200",
  57	    purple: "bg-purple-50 text-purple-700 border border-purple-200",
  58	  };
  59	  return (
  59	    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}>
  60	      {children}
  61	    </span>
  62	  );
  63	};
  64	
  65	const ActionBtn = ({ onClick, title, variant = "default", children }) => {
  66	  const base =
  67	    "inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0";
  68	  const variants = {
  69	    default: "border border-slate-200 text-slate-600 hover:bg-slate-50",
  70	    green: "border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
  71	    blue: "border border-blue-200 text-blue-700 hover:bg-blue-50",
  72	    danger: "border border-red-200 text-red-600 hover:bg-red-50",
  73	    "danger-solid": "bg-red-600 text-white hover:bg-red-700",
  74	    "success-solid": "bg-emerald-600 text-white hover:bg-emerald-700",
  75	  };
  76	  return (
  77	    <button
  78	      onClick={onClick}
  79	      title={title}
  80	      className={`${base} ${variants[variant]}`}
  81	    >
  82	      {children}
  83	    </button>
  84	  );
  85	};
  86	
  87	// ======================= TERCERA EDAD BADGE =======================
  88	const TerceraEdadBadge = () => (
  89	  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
  90	    <AlertCircle className="w-3 h-3" />
  90	    TERCERA EDAD
  91	  </span>
  91	);
  92	
  93	// ======================= STAT CARD =======================
  94	const StatCard = ({ label, value, icon: Icon, accent = false }) => (
  95	  <div
  95	    className={`rounded-xl p-4 flex flex-col gap-2 ${
  96	      accent
  97	        ? "bg-brand-700 text-white shadow-card-md"
  98	        : "bg-white border border-slate-200 shadow-card"
  99	    }`}
  100	  >
  101	    <div className="flex items-center justify-between">
  102	      <p
  103	        className={`text-xs font-semibold uppercase tracking-wide ${
  104	          accent ? "text-brand-200" : "text-slate-500"
  105	        }`}
  106	      >
  107	        {label}
  108	      </p>
  109	      {Icon && (
  110	        <div
  111	          className={`p-1.5 rounded-lg ${
  112	            accent ? "bg-white/10" : "bg-brand-50"
  113	          }`}
  114	        >
  115	          <Icon
  116	            className={`w-4 h-4 ${accent ? "text-white" : "text-brand-600"}`}
  117	          />
  118	        </div>
  119	      )}
  120	    </div>
  121	    <p
  122	      className={`text-3xl font-bold leading-none ${
  123	        accent ? "text-white" : "text-slate-800"
  124	      }`}
  125	    >
  126	      {value ?? 0}
  127	    </p>
  128	  </div>
  129	);
  130	
  131	// ======================= VOTE PROGRESS CARD =======================
  132	const VoteProgressCard = ({ confirmed, total, percentage }) => (
  133	  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-card">
  134	    <div className="flex items-center justify-between">
  135	      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
  136	        Votos Confirmados
  137	      </p>
  138	      <div className="p-1.5 rounded-lg bg-emerald-50">
  139	        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  140	      </div>
  141	    </div>
  142	    <div>
  143	      <p className="text-3xl font-bold text-slate-800 leading-none">
  144	        {confirmed ?? 0}
  145	        <span className="text-lg text-slate-400 font-normal">/{total ?? 0}</span>
  146	      </p>
  147	    </div>
  148	    <div>
  149	      <div className="flex items-center justify-between mb-1.5">
  150	        <span className="text-xs text-slate-500">Progreso</span>
  151	        <span
  152	          className={`text-xs font-bold ${
  153	            percentage >= 75
  154	              ? "text-emerald-600"
  155	              : percentage >= 50
  156	              ? "text-amber-600"
  157	              : "text-slate-600"
  158	          }`}
  159	        >
  160	          {percentage ?? 0}%
  161	        </span>
  162	      </div>
  163	      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
  164	        <div
  165	          className={`h-2 rounded-full transition-all duration-500 ${
  166	            percentage >= 75
  167	              ? "bg-emerald-500"
  168	              : percentage >= 50
  169	              ? "bg-amber-500"
  170	              : "bg-brand-500"
  171	          }`}
  172	          style={{ width: `${percentage ?? 0}%` }}
  173	        />
  174	      </div>
  175	    </div>
  176	  </div>
  177	);
  178	
  179	// ======================= VOTE COUNTER BADGE =======================
  180	const VoteCounter = ({ confirmed, total }) => {
  181	  if (total === undefined || total === null) return null;
  182	  return (
  183	    <span className="inline-flex items-center gap-0.5 text-xs font-medium shrink-0">
  184	      <span className="text-emerald-600 font-bold">{confirmed ?? 0}</span>
  185	      <span className="text-slate-400">/</span>
  186	      <span className="text-slate-500">{total}</span>
  187	    </span>
  188	  );
  189	};
  190	
  191	// ======================= PERSONA DATA =======================
  192	const DatosPersona = ({ persona, rol, loginCode, onCopy, counter }) => {
  193	  const direccionMostrar = persona.direccion_override || persona.direccion;
  194	  const hasName = Boolean(persona.nombre);
  195	  const displayName = hasName
  196	    ? `${persona.nombre} ${persona.apellido || ""}`.trim()
  197	    : "Cargando...";
  198	  return (
  199	    <div className="space-y-0.5 text-xs sm:text-sm">
  200	      <p className={`font-semibold flex items-center gap-1 flex-wrap ${hasName ? "text-slate-800" : "text-slate-400 italic"}`}>
  201	        <span>{displayName}</span>
  201	        {counter}
  202	      </p>
  203	      <p className="text-slate-500 truncate">
  204	        CI: <span className="text-slate-700 font-medium">{persona.ci}</span>
  205	        {rol && <span className="ml-2 text-slate-400">• {rol}</span>}
  206	      </p>
  206	      {loginCode && (
  207	        <button
  208	          onClick={(e) => {
  209	            e.stopPropagation();
  210	            onCopy?.(loginCode);
  211	          }}
  212	          className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-200 text-brand-600 text-xs hover:bg-brand-50 transition-colors bg-transparent shadow-none"
  213	        >
  214	          <Copy className="w-3 h-3" />
  214	          Copiar acceso
  215	        </button>
  216	      )}
  217	      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500 mt-0.5">
  218	        {persona.seccional && <span>Seccional: {persona.seccional}</span>}
  219	        {persona.local_votacion && <span className="truncate">Local: {persona.local_votacion}</span>}
  219	        {persona.mesa && <span>Mesa: {persona.mesa}</span>}
  220	        {persona.orden && <span>Orden: {persona.orden}</span>}
  221	        {direccionMostrar && <span className="truncate">Dir: {direccionMostrar}</span>}
  222	        {persona.telefono && <span className="truncate">Tel: {persona.telefono}</span>}
  223	      </div>
  224	    </div>
  225	  );
  226	};
  227	
  228	// ======================= VOTANTE ROW =======================
  229	const VotanteRow = ({
  230	  v,
  230	  onTelefono,
  231	  onDireccion,
  232	  onConfirmar,
  233	  onAnular,
  234	  canConfirmar,
  235	  canAnular,
  236	}) => (
  236	  <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 hover:border-slate-300 transition-colors">
  237	    <div className="flex-1 min-w-0">
  238	      <DatosPersona persona={v} rol={null} />
  239	      <div className="mt-1.5 flex flex-wrap gap-1.5">
  240	        {v.voto_confirmado && (
  240	          <Badge variant="green">
  241	            <Check className="w-3 h-3 mr-1" />
  242	            Confirmado
  243
  244	          </Badge>
  244	        )}
  245	        {v.tercera_edad === true && <TerceraEdadBadge />}
  246	      </div>
  247	    </div>
  248	    <div className="flex gap-1.5 shrink-0 flex-wrap">
  249	      <ActionBtn onClick={() => onTelefono("votante", v)} title="Editar telefono" variant="green">
  250	        <Phone className="w-3.5 h-3.5" />
  250	      </ActionBtn>
  251	      <ActionBtn onClick={() => onDireccion("votante", v)} title="Editar direccion" variant="blue">
  252	        <MapPin className="w-3.5 h-3.5" />
  252	      </ActionBtn>
  253	      {!v.voto_confirmado && canConfirmar(v) && (
  253	        <ActionBtn onClick={() => onConfirmar(v)} title="Confirmar voto" variant="success-solid">
  254	          <Check className="w-3.5 h-3.5" />
  254	        </ActionBtn>
  255	      )}
  256	      {v.voto_confirmado && canAnular(v) && (
  256	        <ActionBtn onClick={() => onAnular(v)} title="Anular confirmacion" variant="danger">
  257	          <X className="w-3.5 h-3.5" />
  257	        </ActionBtn>
  258	      )}
  259	    </div>
  260	  </div>
  261	);
  262	
  263	// ======================= MODAL AGREGAR DIRIGENTE =======================
  264	const ModalAgregarDirigente = ({
  265	  show,
  265	  onClose,
  266	  disponibles,
  267	  onAgregarDesdePadron,
  268	  onAgregarExterno,
  269	}) => {
  270	  const [modo, setModo] = useState(null); // null | "padron" | "externo"
  271	  const [searchTerm, setSearchTerm] = useState("");
  272	  const [page, setPage] = useState(1);
  273	  // Externo
  274	  const [extCI, setExtCI] = useState("");
  275	  const [extNombre, setExtNombre] = useState("");
  276	  const [extApellido, setExtApellido] = useState("");
  277	  const [extTelefono, setExtTelefono] = useState("");
  278	  // Código generado para mostrar
  279	  const [codigoGenerado, setCodigoGenerado] = useState(null);
  280	  const [saving, setSaving] = useState(false);
  281	
  281	  useEffect(() => {
  282	    if (!show) {
  283	      setModo(null);
  284	      setSearchTerm("");
  285	      setPage(1);
  286	      setExtCI("");
  287	      setExtNombre("");
  288	      setExtApellido("");
  289	      setExtTelefono("");
  290	      setCodigoGenerado(null);
  291	      setSaving(false);
  292	    }
  293	  }, [show]);
  293
  294	  if (!show) return null;
  295
  296	  const normalize = (text) =>
  297	    (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  298
  299	  const pageSize = 20;
  299	  const filtered = searchTerm
  300	    ? disponibles
  300	        .filter((p) => {
  301	          const words = normalize(searchTerm).split(" ").filter(Boolean);
  302	          const full = normalize(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
  303	          const ci = (p.ci ?? "").toString();
  304	          return words.every((w) => ci.includes(w) || full.includes(w));
  305	        })
  305	        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
  306	    : [];
  307	  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  308	  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);
  308
  309	  const handleSelectPadron = async (persona) => {
  310	    await onAgregarDesdePadron(persona);
  311	  };
  311
  312	  const handleSubmitExterno = async () => {
  313	    const ci = String(extCI).replace(/\D/g, "");
  314	    if (!ci) { alert("El CI es obligatorio y debe ser numerico."); return; }
  315	    if (!extNombre.trim()) { alert("El nombre es obligatorio."); return; }
  316	    setSaving(true);
  317	    const code = await onAgregarExterno({
  318	      ci,
  319	      nombre: extNombre.trim(),
  320	      apellido: extApellido.trim(),
  321	      telefono: extTelefono.trim(),
  322	    });
  323	    setSaving(false);
  323	    if (code) setCodigoGenerado(code);
  324	  };
  324
  325	  // --- Vista: código generado ---
  326	  if (codigoGenerado) {
  326	    return (
  327	      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  328	        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal p-6 flex flex-col gap-4 animate-fade-in">
  328
  329	          <div className="text-center">
  329	            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
  330	              <Check className="w-6 h-6 text-emerald-600" />
  330	            </div>
  331	            <h3 className="text-base font-bold text-slate-800">Dirigente creado</h3>
  332	            <p className="text-sm text-slate-500 mt-1">
  332	              Codigo de acceso generado. Comparta con el dirigente.
  333
  334	            </p>
  335
  336
  337
  338	          </div>
  339
  340
  341
  342	          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
  343	            <span className="font-mono font-bold text-xl tracking-widest text-brand-700">
  344	              {codigoGenerado}
  345
  346
  347

  348	            </span>
  349	            <button
  350	              onClick={() => navigator.clipboard.writeText(codigoGenerado).catch(() => {})}
  350	              className="flex items-center gap-1.5 px-3 h-8 border border-brand-200 rounded-lg text-xs text-brand-600 hover:bg-brand-50 transition-colors bg-transparent shadow-none"
  351	            >
  352	              <Copy className="w-3.5 h-3.5" />
  352	              Copiar
  353
  354

  355	            </button>
  356
  357

  358

  359

  360


  361

  362
  363

  364

  365

  366

  367

  368

  369

  370

  371
          </div>
  372
  373
  374
          <button
  375
            onClick={onClose}
  376
            className="w-full h-10 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold border-0 transition-colors"
  377
          >
  378
            Cerrar
  379
          </button>
  380
        </div>
  381
      </div>
  382
    );
  383
  }
  384

  385
  // --- Vista: selector de modo ---
  386
  if (!modo) {
  387
    return (
  388
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  389
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
  390
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
  391
            <h3 className="text-base font-bold text-slate-800">Agregar Dirigente</h3>
  392
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
  393
              <X className="w-4 h-4" />
  393
            </button>
  394
          </div>
  395
          <div className="p-5 space-y-3">
  396
            <p className="text-sm text-slate-600">Seleccione como desea agregar al dirigente:</p>
  396
            <button
  397
              onClick={() => setModo("padron")}
  397
              className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white"
  398
            >
  399
              <div className="p-2 bg-brand-100 rounded-lg shrink-0">
  399
                <Users className="w-4 h-4 text-brand-600" />
  400
              </div>
  401
              <div>
  402
                <p className="font-semibold text-sm text-slate-800">Persona del padron</p>
  403
                <p className="text-xs text-slate-500">Buscar por CI o nombre en el padron electoral.</p>
  404
              </div>
  405
            </button>
  406
            <button
  407
              onClick={() => setModo("externo")}
  407
              className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white"
  408
            >
  409
              <div className="p-2 bg-slate-100 rounded-lg shrink-0">
  409
                <UserPlus className="w-4 h-4 text-slate-600" />
  410
              </div>
  411
              <div>
  412
                <p className="font-semibold text-sm text-slate-800">Dirigente externo</p>
  413
                <p className="text-xs text-slate-500">Cargar manualmente datos de un dirigente fuera del padron.</p>
  414
              </div>
  415
            </button>
  416
          </div>
  417
        </div>
  417
      </div>
  418
    );
  419
  }
  419

  420
  // --- Vista: padron ---
  421
  if (modo === "padron") {
  422
    return (
  423
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
  424
        <div className="bg-white rounded-2xl w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
  425
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
  426
            <div className="flex items-center gap-2">
  426
              <button onClick={() => setModo(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
  427
                <ChevronRight className="w-4 h-4 rotate-180" />
  427
              </button>
  428
              <h3 className="text-base font-bold text-slate-800">Persona del padron</h3>
  429
            </div>
  430
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
  431
              <X className="w-4 h-4" />
  431
            </button>
  432
          </div>
  433
          <div className="px-5 py-3 border-b border-slate-100 shrink-0">
  434
            <div className="relative">
  434
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
  435
              <input
  436
                type="text"
  436
                value={searchTerm}
  437
                placeholder="Buscar por CI, nombre o apellido..."
  438
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
  439
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
  440
                autoFocus
  441
              />
  442
            </div>
  443
          </div>
  443
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
  444
            {!searchTerm ? (
  444
              <div className="text-center py-10">
  445
                <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
  445
                <p className="text-sm text-slate-400">Escriba para buscar.</p>
  446
              </div>
  447
            ) : pageData.length === 0 ? (
  447
              <div className="text-center py-10">
  448
                <p className="text-sm text-slate-400">No se encontraron resultados.</p>
  449
              </div>
  450
            ) : (
  450
              pageData.map((persona) => {
  451
                const bloqueado = persona.asignado === true;
  452
                return (
  453
                  <div
  454
                    key={persona.ci}
  454
                    onClick={() => !bloqueado && handleSelectPadron(persona)}
  455
                    className={`p-3 border rounded-xl transition-colors ${bloqueado ? "bg-slate-50 opacity-60 cursor-not-allowed border-slate-200" : "bg-white hover:bg-brand-50 hover:border-brand-200 cursor-pointer border-slate-200"}`}
  456
                  >
  457
                    <p className="font-semibold text-sm text-slate-800">{(persona.nombre || "").toUpperCase()} {(persona.apellido || "").toUpperCase()}</p>
  458
                    <p className="text-xs text-slate-500 mt-0.5">CI: {persona.ci}</p>
  459
                    {bloqueado && <p className="text-xs text-brand-600 mt-0.5">Ya asignado ({persona.asignadoRol})</p>}
  460
                  </div>
  461
                );
  462
              })
  463
            )}
  464
          </div>
  465
          {filtered.length > pageSize && (
  465
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0 text-xs text-slate-500">
  466
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 h-8 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50">Anterior</button>
  467
              <span>Pag {page}/{totalPages}</span>
  468
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 h-8 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50">Siguiente</button>
  469
            </div>
  470
          )}
  470
          <div className="px-5 py-4 border-t border-slate-100 shrink-0">
  471
            <button onClick={onClose} className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium border-0">Cerrar</button>
  472
          </div>
  473
        </div>
  473
      </div>
  474
    );
  475
  }
  475

  476
  // --- Vista: externo ---
  477
  return (
  478
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  479
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
  480
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
  481
          <div className="flex items-center gap-2">
  481
            <button onClick={() => setModo(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
  482
              <ChevronRight className="w-4 h-4 rotate-180" />
  482
            </button>
  483
            <h3 className="text-base font-bold text-slate-800">Dirigente externo</h3>
  484
          </div>
  485
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
  486
            <X className="w-4 h-4" />
  486
          </button>
  487
        </div>
  488
        <div className="p-5 space-y-4">
  489
          <div>
  489
            <label className="block text-xs font-semibold text-slate-700 mb-1">CI <span className="text-red-500">*</span></label>
  490
            <input type="text" inputMode="numeric" value={extCI} onChange={(e) => setExtCI(e.target.value.replace(/\D/g, ""))} placeholder="Solo numeros" className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50" />
  491
          </div>
  491
          <div>
  492
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
  493
            <input type="text" value={extNombre} onChange={(e) => setExtNombre(e.target.value)} className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50" />
  494
          </div>
  494
          <div>
  495
            <label className="block text-xs font-semibold text-slate-700 mb-1">Apellido</label>
  496
            <input type="text" value={extApellido} onChange={(e) => setExtApellido(e.target.value)} className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50" />
  497
          </div>
  497
          <div>
  498
            <label className="block text-xs font-semibold text-slate-700 mb-1">Telefono</label>
  499
            <input type="tel" value={extTelefono} onChange={(e) => setExtTelefono(e.target.value)} placeholder="+595 9XX XXX XXX" className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50" />
  500
          </div>
  501
          <button
  502
            onClick={handleSubmitExterno}
  502
            disabled={saving}
  503
            className="w-full h-10 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl text-sm font-semibold border-0 transition-colors"
  504
          >
  505
            {saving ? "Guardando..." : "Crear Dirigente Externo"}
  506
          </button>
  506
          <button onClick={onClose} className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium border-0 transition-colors">Cancelar</button>
  507
        </div>
  507
      </div>
  508
    </div>
  509
  );
  510
};
  511

  512
// ======================= MAIN COMPONENT =======================
  513
const Dashboard = ({ currentUser, onLogout }) => {
  514
  // ======================= STATE =======================
  515
  const [padron, setPadron] = useState([]);
  516
  const [estructura, setEstructura] = useState({
  517
    dirigentes: [],
  518
    coordinadores: [],
  519
    subcoordinadores: [],
  520
    votantes: [],
  521
  });
  522

  523
  const [showAddModal, setShowAddModal] = useState(false);
  524
  const [modalType, setModalType] = useState("");
  525
  const [expandedCoords, setExpandedCoords] = useState({});
  526
  const [searchCI, setSearchCI] = useState("");
  527

  527
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  528
  const [phoneTarget, setPhoneTarget] = useState(null);
  529
  const [phoneValue, setPhoneValue] = useState("+595");
  530

  530
  const [direccionModalOpen, setDireccionModalOpen] = useState(false);
  531
  const [direccionTarget, setDireccionTarget] = useState(null);
  532
  const [direccionValue, setDireccionValue] = useState("");
  533

  533
  const [confirmVotoModalOpen, setConfirmVotoModalOpen] = useState(false);
  534
  const [confirmVotoTarget, setConfirmVotoTarget] = useState(null);
  535
  const [isVotoUndoing, setIsVotoUndoing] = useState(false);
  536
  const [isConfirmVotoLoading, setIsConfirmVotoLoading] = useState(false);
  537

  537
  const [confirmSubModalOpen, setConfirmSubModalOpen] = useState(false);
  538
  const [confirmSubTarget, setConfirmSubTarget] = useState(null);
  539
  const [isSubUndoing, setIsSubUndoing] = useState(false);
  540
  const [isConfirmSubLoading, setIsConfirmSubLoading] = useState(false);
  541

  541
  const [loadingEstructura, setLoadingEstructura] = useState(true);
  542

  542
  // Modal agregar dirigente (superadmin)
  543
  const [showAddDirigenteModal, setShowAddDirigenteModal] = useState(false);
  544

  544
  // Non-blocking toast
  545
  const [toastMsg, setToastMsg] = useState(null);
  546
  const toastTimer = React.useRef(null);
  547
  const showToast = useCallback((msg, duration = 2500) => {
  548
    if (toastTimer.current) clearTimeout(toastTimer.current);
  549
    setToastMsg(msg);
  550
    toastTimer.current = setTimeout(() => setToastMsg(null), duration);
  551
  }, []);
  552

  552
  // ======================= HELPERS =======================
  553
  const copyToClipboard = useCallback(async (text) => {
  554
    if (!text) return;
  555
    try {
  556
      await navigator.clipboard.writeText(text);
  557
      showToast("Codigo copiado");
  558
    } catch {
  559
      showToast("No se pudo copiar");
  560
    }
  561
  }, [showToast]);
  562

  562
  const toggleExpand = useCallback((ci) => {
  563
    const key = normalizeCI(ci);
  564
    setExpandedCoords((prev) => ({ ...prev, [key]: !prev[key] }));
  565
  }, []);
  566

  566
  // ======================= CARGAR PADRON =======================
  567
  const cargarPadronCompleto = async () => {
  568
    try {
  569
      const { count, error: countError } = await supabase
  570
        .from("padron")
  571
        .select("ci", { count: "exact", head: true });
  572
      if (countError) { console.error("Error count padron:", countError); return []; }
  573
      if (!count || count <= 0) { setPadron([]); return []; }
  574
      const { data, error } = await supabase.from("padron").select("*").range(0, count - 1);
  575
      if (error) { console.error("Error cargando padron:", error); return []; }
  576
      const result = data || [];
  577
      setPadron(result);
  578
      return result;
  579
    } catch (e) {
  580
      console.error("Error cargando padron:", e);
  581
      return [];
  582
    }
  583
  };
  584

  584
  // ======================= RECARGAR ESTRUCTURA =======================
  585
  const recargarEstructura = useCallback(async (padronDataOverride) => {
  586
    try {
  587
      setLoadingEstructura(true);
  588
      let padronData = padronDataOverride || padron;
  589
      if (!padronData || padronData.length === 0) {
  590
        const { data: p } = await supabase.from("padron").select("*");
  591
        padronData = p || [];
  592
        setPadron(padronData);
  593
      }
  594
      const padronMap = new Map((padronData || []).map((p) => [normalizeCI(p.ci), p]));
  595

  595
      const { data: dirsRaw, error: dirsErr } = await supabase.from("dirigentes").select("*").eq("activo", true);
  596
      if (dirsErr) console.error("Error dirigentes:", dirsErr);
  597

  597
      const { data: coordsRaw, error: coordsErr } = await supabase.from("coordinadores").select("*");
  598
      if (coordsErr) console.error("Error coords:", coordsErr);
  598

  599
      const { data: subsRaw, error: subsErr } = await supabase.from("subcoordinadores").select("*");
  600
      if (subsErr) console.error("Error subs:", subsErr);
  600

  601
      const { data: votosRaw, error: votosErr } = await supabase.from("votantes").select("*");
  602
      if (votosErr) console.error("Error votos:", votosErr);
  602

  603
      // Dirigentes: no se enriquecen con padron porque pueden ser externos.
  604
      const dirsActivos = (dirsRaw || []).map((d) => ({
  605
        ...d,
  605
        ci: normalizeCI(d.ci),
  606
      }));
  607

  607
      const mergePadron = (arr) =>
  608
        (arr || []).map((x) => {
  609
          const ci = normalizeCI(x.ci);
  610
          const p = padronMap.get(ci);
  611
          return { ...(p || {}), ...x, ci };
  612
        });
  613

  613
      setEstructura({
  614
        dirigentes: dirsActivos,
  615
        coordinadores: mergePadron(coordsRaw).filter((c) => c.activo !== false),
  616
        subcoordinadores: mergePadron(subsRaw).filter((s) => s.activo !== false),
  617
        votantes: mergePadron(votosRaw).filter((v) => v.activo !== false),
  618
      });
  619
    } catch (e) {
  620
      console.error("Error recargando estructura:", e);
  621
    } finally {
  622
      setLoadingEstructura(false);
  623
    }
  624
  // eslint-disable-next-line react-hooks/exhaustive-deps
  625
  }, []);
  626

  626
  useEffect(() => {
  627
    if (!currentUser) return;
  628
    let cancelled = false;
  629
    const init = async () => {
  630
      const padronData = await cargarPadronCompleto();
  631
      if (!cancelled) await recargarEstructura(padronData);
  632
    };
  633
    init();
  634
    return () => { cancelled = true; };
  635
  }, [currentUser, recargarEstructura]);
  636

  636
  // ======================= RBAC =======================
  637
  const canEditarTelefono = (tipo, persona) => {
  638
    const role = currentUser?.role;
  638
    if (!role || !persona) return false;
  639
    if (role === "superadmin") return true;
  640
    if (role === "dirigente") {
  640
      const miCI = normalizeCI(currentUser.ci);
  641
      if (tipo === "coordinador") return normalizeCI(persona.dirigente_ci) === miCI;
  641
      if (tipo === "votante") return normalizeCI(persona.dirigente_ci) === miCI;
  642
      return false;
  643
    }
  643
    if (role === "coordinador") {
  644
      const miCI = normalizeCI(currentUser.ci);
  644
      if (tipo === "subcoordinador") return normalizeCI(persona.coordinador_ci) === miCI;
  645
      if (tipo === "votante") return normalizeCI(persona.coordinador_ci) === miCI;
  646
      return false;
  647
    }
  647
    if (role === "subcoordinador") {
  648
      if (tipo !== "votante") return false;
  648
      return normalizeCI(persona.asignado_por) === normalizeCI(currentUser.ci);
  649
    }
  649
    return false;
  650
  };
  651

  651
  const canConfirmarVoto = useCallback((votante) => {
  652
    const role = currentUser?.role;
  652
    if (!role || !votante) return false;
  653
    if (role === "superadmin") return false;
  654
    if (role === "dirigente") return normalizeCI(votante.dirigente_ci) === normalizeCI(currentUser.ci) && !votante.coordinador_ci;
  655
    if (role === "coordinador") return normalizeCI(votante.coordinador_ci) === normalizeCI(currentUser.ci);
  656
    if (role === "subcoordinador") return normalizeCI(votante.asignado_por) === normalizeCI(currentUser.ci);
  657
    return false;
  658
  }, [currentUser]);
  659

  659
  const canAnularConfirmacion = useCallback((votante) => {
  660
    const role = currentUser?.role;
  660
    if (!role || !votante) return false;
  661
    if (role === "dirigente") return normalizeCI(votante.dirigente_ci) === normalizeCI(currentUser.ci) && !votante.coordinador_ci;
  662
    if (role === "coordinador") return normalizeCI(votante.coordinador_ci) === normalizeCI(currentUser.ci);
  663
    if (role === "subcoordinador") return normalizeCI(votante.asignado_por) === normalizeCI(currentUser.ci);
  664
    return false;
  665
  }, [currentUser]);
  666

  666
  // ======================= CONFIRM VOTO =======================
  667
  const abrirConfirmVoto = (votante) => {
  668
    if (!canConfirmarVoto(votante)) return;
  669
    setConfirmVotoTarget(votante);
  670
    setIsVotoUndoing(false);
  671
    setConfirmVotoModalOpen(true);
  672
  };
  673

  673
  const abrirAnularConfirmacion = (votante) => {
  674
    if (!canAnularConfirmacion(votante)) return;
  675
    setConfirmVotoTarget(votante);
  676
    setIsVotoUndoing(true);
  677
    setConfirmVotoModalOpen(true);
  678
  };
  679

  679
  const handleConfirmVoto = async () => {
  680
    if (!confirmVotoTarget) return;
  681
    setIsConfirmVotoLoading(true);
  682
    try {
  683
      const newStatus = !isVotoUndoing;
  684
      const targetCI = normalizeCI(confirmVotoTarget.ci);
  685
      const { error } = await supabase.from("votantes").update({ voto_confirmado: newStatus }).eq("ci", targetCI);
  686
      if (error) { console.error("Error confirmando voto:", error); alert(error.message || "Error procesando confirmacion"); setIsConfirmVotoLoading(false); return; }
  687
      setEstructura((prev) => ({
  688
        ...prev,
  688
        votantes: prev.votantes.map((v) =>
  689
          normalizeCI(v.ci) === targetCI ? { ...v, voto_confirmado: newStatus } : v
  690
        ),
  691
      }));
  692
      setConfirmVotoModalOpen(false);
  693
      setConfirmVotoTarget(null);
  694
    } catch (e) {
  695
      console.error("Error confirmando voto:", e);
  696
      alert("Error procesando confirmacion");
  697
    } finally {
  698
      setIsConfirmVotoLoading(false);
  699
    }
  700
  };
  701

  701
  // ======================= CONFIRM SUB =======================
  702
  const abrirConfirmSub = (sub) => { setConfirmSubTarget(sub); setIsSubUndoing(false); setConfirmSubModalOpen(true); };
  703
  const abrirAnularConfirmSub = (sub) => { setConfirmSubTarget(sub); setIsSubUndoing(true); setConfirmSubModalOpen(true); };
  704

  704
  const handleConfirmSub = async () => {
  705
    if (!confirmSubTarget) return;
  705
    setIsConfirmSubLoading(true);
  706
    try {
  707
      const newStatus = !isSubUndoing;
  708
      const targetCI = normalizeCI(confirmSubTarget.ci);
  709
      const { error } = await supabase.from("subcoordinadores").update({ confirmado: newStatus }).eq("ci", targetCI);
  710
      if (error) { console.error("Error confirmando sub:", error); alert(error.message || "Error"); setIsConfirmSubLoading(false); return; }
  711
      setEstructura((prev) => ({
  712
        ...prev,
  712
        subcoordinadores: prev.subcoordinadores.map((s) =>
  713
          normalizeCI(s.ci) === targetCI ? { ...s, confirmado: newStatus } : s
  714
        ),
  715
      }));
  716
      setConfirmSubModalOpen(false);
  717
      setConfirmSubTarget(null);
  718
    } catch (e) {
  719
      console.error("Error confirmando sub:", e);
  720
      alert("Error procesando confirmacion de subcoordinador");
  721
    } finally {
  722
      setIsConfirmSubLoading(false);
  723
    }
  724
  };
  725

  725
  // ======================= LOGOUT =======================
  726
  const handleLogout = () => { setExpandedCoords({}); setSearchCI(""); onLogout?.(); };
  727

  727
  // ======================= TELEFONO =======================
  728
  const abrirTelefono = (tipo, p) => { setPhoneTarget({ tipo, ...p }); setPhoneValue(p.telefono || "+595"); setPhoneModalOpen(true); };
  729

  729
  const guardarTelefono = async () => {
  730
    if (!phoneTarget) return;
  730
    if (currentUser.role !== "superadmin") {
  731
      if (!canEditarTelefono(phoneTarget.tipo, phoneTarget)) {
  731
        alert("No tiene permiso para editar el telefono de esta persona."); return;
  732
      }
  733
    }
  733
    const telefono = String(phoneValue || "").trim();
  734
    if (!telefono) { alert("Ingrese numero de telefono."); return; }
  735
    let tabla = "votantes";
  736
    if (phoneTarget.tipo === "coordinador") tabla = "coordinadores";
  737
    if (phoneTarget.tipo === "subcoordinador") tabla = "subcoordinadores";
  738
    if (phoneTarget.tipo === "dirigente") tabla = "dirigentes";
  739
    const targetCI = normalizeCI(phoneTarget.ci);
  740
    const { error } = await supabase.from(tabla).update({ telefono }).eq("ci", targetCI);
  741
    if (error) { console.error("Error guardando telefono:", error); alert(error.message || "Error guardando telefono"); return; }
  742
    const key = phoneTarget.tipo === "dirigente" ? "dirigentes" : phoneTarget.tipo === "coordinador" ? "coordinadores" : phoneTarget.tipo === "subcoordinador" ? "subcoordinadores" : "votantes";
  743
    setEstructura((prev) => ({ ...prev, [key]: prev[key].map((x) => normalizeCI(x.ci) === targetCI ? { ...x, telefono } : x) }));
  744
    setPhoneModalOpen(false); setPhoneTarget(null); setPhoneValue("+595");
  745
    showToast("Telefono actualizado correctamente");
  746
  };
  747

  747
  // ======================= DIRECCION =======================
  748
  const abrirDireccion = (tipo, p) => { setDireccionTarget({ tipo, ...p }); setDireccionValue(p.direccion_override || p.direccion || ""); setDireccionModalOpen(true); };
  749

  749
  const guardarDireccion = async () => {
  750
    if (!direccionTarget) return;
  750
    if (currentUser.role !== "superadmin") {
  751
      if (!canEditarTelefono(direccionTarget.tipo, direccionTarget)) {
  751
        alert("No tiene permiso para editar la direccion de esta persona."); return;
  752
      }
  753
    }
  753
    let tabla = "votantes";
  754
    if (direccionTarget.tipo === "coordinador") tabla = "coordinadores";
  755
    if (direccionTarget.tipo === "subcoordinador") tabla = "subcoordinadores";
  756
    const direccion_override = String(direccionValue || "").trim();
  757
    const targetCI = normalizeCI(direccionTarget.ci);
  758
    const { error } = await supabase.from(tabla).update({ direccion_override }).eq("ci", targetCI);
  759
    if (error) { console.error("Error guardando direccion:", error); alert(error.message || "Error guardando direccion"); return; }
  760
    const key = direccionTarget.tipo === "coordinador" ? "coordinadores" : direccionTarget.tipo === "subcoordinador" ? "subcoordinadores" : "votantes";
  761
    setEstructura((prev) => ({ ...prev, [key]: prev[key].map((x) => normalizeCI(x.ci) === targetCI ? { ...x, direccion_override } : x) }));
  762
    setDireccionModalOpen(false); setDireccionTarget(null); setDireccionValue("");
  763
    showToast("Direccion actualizada correctamente");
  764
  };
  765

  765
  // ======================= AGREGAR PERSONA =======================
  766
  const handleAgregarPersona = async (persona) => {
  767
    if (!modalType) return alert("Seleccione tipo.");
  768
    const ci = normalizeCI(persona.ci);
  769

  769
    // ---- COORDINADOR ----
  770
    if (modalType === "coordinador") {
  771
      // Superadmin lo agrega sin dirigente_ci
  772
      // Dirigente lo agrega con su CI como dirigente_ci
  773
      const isDirigente = currentUser.role === "dirigente";
  774
      const isSuperadmin = currentUser.role === "superadmin";
  774
      if (!isDirigente && !isSuperadmin) { alert("No permitido."); return; }
  775
      const accessCode = generarAccessCode(8);
  776
      const insertPayload = {
  776
        ci,
  777
        login_code: accessCode,
  778
        asignado_por_ci: normalizeCI(currentUser.ci),
  779
        asignado_por_rol: currentUser.role,
  780
        asignado_por_nombre: isDirigente
  781
          ? `${currentUser.nombre} ${currentUser.apellido}`.trim()
  782
          : "Superadmin",
  783
        ...(isDirigente ? { dirigente_ci: normalizeCI(currentUser.ci) } : {}),
  784
        activo: true,
  785
      };
  785
      const { data: inserted, error } = await supabase.from("coordinadores").insert([insertPayload]).select();
  786
      if (error) { console.error("Error creando coordinador:", error); alert(error.message || "Error creando coordinador"); return; }
  787
      const padronEntry = padron.find((p) => normalizeCI(p.ci) === ci) || {};
  787
      const newCoord = { ...padronEntry, ...(inserted?.[0] || insertPayload), ci };
  788
      setEstructura((prev) => ({ ...prev, coordinadores: [...prev.coordinadores, newCoord] }));
  789
      showToast(`Coordinador creado. Codigo: ${accessCode}`);
  790
      try { await navigator.clipboard.writeText(accessCode); } catch { /* noop */ }
  791
      setShowAddModal(false);
  792
      return;
  793
    }
  793

  794
    // ---- SUBCOORDINADOR ----
  795
    if (modalType === "subcoordinador") {
  796
      if (currentUser.role !== "coordinador") { alert("Solo un coordinador puede agregar subcoordinadores."); return; }
  797
      const accessCode = generarAccessCode(8);
  798
      const insertPayload = {
  798
        ci,
  799
        coordinador_ci: normalizeCI(currentUser.ci),
  800
        login_code: accessCode,
  801
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`,
  802
        activo: true,
  803
      };
  803
      const { data: inserted, error } = await supabase.from("subcoordinadores").insert([insertPayload]).select();
  804
      if (error) { console.error("Error creando subcoordinador:", error); alert(error.message || "Error creando subcoordinador"); return; }
  804
      const padronEntry = padron.find((p) => normalizeCI(p.ci) === ci) || {};
  805
      const newSub = { ...padronEntry, ...(inserted?.[0] || insertPayload), ci };
  806
      setEstructura((prev) => ({ ...prev, subcoordinadores: [...prev.subcoordinadores, newSub] }));
  807
      showToast(`Subcoordinador creado. Codigo: ${accessCode}`);
  808
      try { await navigator.clipboard.writeText(accessCode); } catch { /* noop */ }
  808
      setShowAddModal(false);
  809
      return;
  810
    }
  810

  811
    // ---- VOTANTE ----
  811
    if (modalType === "votante") {
  812
      const role = currentUser.role;
  812
      if (role !== "coordinador" && role !== "subcoordinador" && role !== "dirigente") { alert("No permitido."); return; }
  813

  813
      const telefono = String(persona.telefono || "").trim();
  814
      const tercera_edad = persona.tercera_edad;
  815
      if (!telefono) { alert("El telefono es obligatorio."); return; }
  815
      if (tercera_edad === null || tercera_edad === undefined) { alert("Debe indicar si es tercera edad."); return; }
  816

  816
      let insertPayload = { ci, telefono, tercera_edad, activo: true };
  817

  817
      if (role === "dirigente") {
  818
        insertPayload = {
  818
          ...insertPayload,
  819
          asignado_por: normalizeCI(currentUser.ci),
  820
          asignado_por_rol: "dirigente",
  821
          asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`.trim(),
  822
          dirigente_ci: normalizeCI(currentUser.ci),
  823
          coordinador_ci: null,
  824
        };
  824
      } else if (role === "coordinador") {
  825
        // Resolve dirigente_ci from the coord's own record
  825
        const coordRecord = (estructura.coordinadores || []).find(
  826
          (c) => normalizeCI(c.ci) === normalizeCI(currentUser.ci)
  827
        );
  828
        insertPayload = {
  828
          ...insertPayload,
  829
          asignado_por: normalizeCI(currentUser.ci),
  830
          asignado_por_rol: "coordinador",
  831
          asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`.trim(),
  832
          dirigente_ci: coordRecord?.dirigente_ci ? normalizeCI(coordRecord.dirigente_ci) : null,
  833
          coordinador_ci: normalizeCI(currentUser.ci),
  834
        };
  834
      } else if (role === "subcoordinador") {
  835
        const sub = (estructura.subcoordinadores || []).find(
  836
          (s) => normalizeCI(s.ci) === normalizeCI(currentUser.ci)
  837
        );
  837
        const coordCI = normalizeCI(sub?.coordinador_ci);
  838
        if (!coordCI) { alert("Error interno: no se pudo resolver coordinador_ci"); return; }
  838
        const coordRecord = (estructura.coordinadores || []).find(
  839
          (c) => normalizeCI(c.ci) === coordCI
  840
        );
  840
        insertPayload = {
  841
          ...insertPayload,
  841
          asignado_por: normalizeCI(currentUser.ci),
  842
          asignado_por_rol: "subcoordinador",
  843
          asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`.trim(),
  844
          dirigente_ci: coordRecord?.dirigente_ci ? normalizeCI(coordRecord.dirigente_ci) : null,
  845
          coordinador_ci: coordCI,
  846
        };
  846
      }
  847

  847
      const { data: inserted, error } = await supabase.from("votantes").insert([insertPayload]).select();
  848
      if (error) { console.error("Error creando votante:", error); alert(error.message || "Error creando votante"); return; }
  848
      const padronEntry = padron.find((p) => normalizeCI(p.ci) === ci) || {};
  849
      const newVotante = { ...padronEntry, ...(inserted?.[0] || insertPayload), ci };
  850
      setEstructura((prev) => ({ ...prev, votantes: [...prev.votantes, newVotante] }));
  851
      setShowAddModal(false);
  852
    }
  853
  };
  854

  854
  // ======================= AGREGAR DIRIGENTE (superadmin) =======================
  855
  const handleAgregarDirigenteDesdePadron = async (persona) => {
  856
    const ci = normalizeCI(persona.ci);
  856
    const accessCode = generarAccessCode(8);
  857
    const insertPayload = {
  857
      ci,
  858
      nombre: persona.nombre,
  859
      apellido: persona.apellido || "",
  860
      telefono: persona.telefono || "",
  861
      login_code: accessCode,
  862
      es_externo: false,
  863
      activo: true,
  864
      asignado_por_nombre: "Superadmin",
  865
    };
  865
    const { data: inserted, error } = await supabase.from("dirigentes").insert([insertPayload]).select();
  866
    if (error) { console.error("Error creando dirigente:", error); alert(error.message || "Error creando dirigente"); return; }
  867
    const newDir = inserted?.[0] || { ...insertPayload };
  868
    setEstructura((prev) => ({ ...prev, dirigentes: [...prev.dirigentes, { ...newDir, ci }] }));
  869
    showToast(`Dirigente creado. Codigo: ${accessCode}`);
  870
    try { await navigator.clipboard.writeText(accessCode); } catch { /* noop */ }
  871
    setShowAddDirigenteModal(false);
  872
  };
  873

  873
  const handleAgregarDirigenteExterno = async ({ ci, nombre, apellido, telefono }) => {
  874
    const accessCode = generarAccessCode(8);
  874
    const insertPayload = {
  875
      ci,
  875
      nombre,
  876
      apellido: apellido || "",
  877
      telefono: telefono || "",
  878
      login_code: accessCode,
  879
      es_externo: true,
  880
      activo: true,
  881
      asignado_por_nombre: "Superadmin",
  882
    };
  882
    const { data: inserted, error } = await supabase.from("dirigentes").insert([insertPayload]).select();
  883
    if (error) { console.error("Error creando dirigente externo:", error); alert(error.message || "Error creando dirigente externo"); return null; }
  884
    const newDir = inserted?.[0] || { ...insertPayload };
  885
    setEstructura((prev) => ({ ...prev, dirigentes: [...prev.dirigentes, { ...newDir, ci }] }));
  886
    return accessCode;
  887
  };
  888

  888
  // ======================= STATS =======================
  889
  const stats = useMemo(() => getEstadisticas(estructura, currentUser), [estructura, currentUser]);
  890

  890
  // ======================= PER-PERSON VOTE COUNTS =======================
  891
  const voteCountsByCoord = useMemo(() => {
  892
    const map = {};
  892
    (estructura.coordinadores || []).forEach((coord) => {
  893
      const ci = normalizeCI(coord.ci);
  893
      const subs = (estructura.subcoordinadores || []).filter((s) => normalizeCI(s.coordinador_ci) === ci);
  894
      const voters = (estructura.votantes || []).filter((v) => normalizeCI(v.coordinador_ci) === ci);
  895
      const subsConfirmed = subs.filter((s) => s.confirmado === true).length;
  896
      const votersConfirmed = voters.filter((v) => v.voto_confirmado === true).length;
  897
      map[ci] = { total: 1 + subs.length + voters.length, confirmed: 1 + subsConfirmed + votersConfirmed };
  898
    });
  898
    return map;
  899
  }, [estructura]);
  900

  900
  const voteCountsBySub = useMemo(() => {
  901
    const map = {};
  901
    (estructura.subcoordinadores || []).forEach((sub) => {
  902
      const ci = normalizeCI(sub.ci);
  902
      const voters = (estructura.votantes || []).filter((v) => normalizeCI(v.asignado_por) === ci);
  903
      const votersConfirmed = voters.filter((v) => v.voto_confirmado === true).length;
  904
      map[ci] = { total: 1 + voters.length, confirmed: 1 + votersConfirmed };
  905
    });
  905
    return map;
  906
  }, [estructura]);
  907

  907
  // ======================= DISPONIBLES =======================
  908
  const disponibles = useMemo(() => getPersonasDisponibles(padron, estructura), [padron, estructura]);
  909

  909
  // ======================= BUSCADOR =======================
  910
  const normalizeText = (v) =>
  910
    (v ?? "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  911

  911
  const personasVisibles = useMemo(() => {
  912
    const role = currentUser?.role;
  912
    const miCI = normalizeCI(currentUser?.ci);
  913
    const dirs = estructura.dirigentes || [];
  913
    const coords = estructura.coordinadores || [];
  914
    const subs = estructura.subcoordinadores || [];
  914
    const vots = estructura.votantes || [];
  915
    const out = [];
  915
    const seen = new Set();
  916
    const pushUnique = (tipo, persona) => {
  916
      const key = `${tipo}:${normalizeCI(persona?.ci)}`;
  917
      if (seen.has(key)) return;
  918
      seen.add(key);
  919
      out.push({ tipo, persona });
  920
    };
  920
    if (role === "superadmin") {
  921
      dirs.forEach((p) => pushUnique("dirigente", p));
  921
      coords.forEach((p) => pushUnique("coordinador", p));
  922
      subs.forEach((p) => pushUnique("subcoordinador", p));
  922
      vots.forEach((p) => pushUnique("votante", p));
  923
      return out;
  924
    }
  924
    if (role === "dirigente") {
  925
      const misCoordsCI = new Set(
  925
        coords.filter((c) => normalizeCI(c.dirigente_ci) === miCI).map((c) => normalizeCI(c.ci))
  926
      );
  926
      const misSubsCI = new Set(
  927
        subs.filter((s) => misCoordsCI.has(normalizeCI(s.coordinador_ci))).map((s) => normalizeCI(s.ci))
  928
      );
  928
      coords.filter((c) => misCoordsCI.has(normalizeCI(c.ci))).forEach((p) => pushUnique("coordinador", p));
  929
      subs.filter((s) => misSubsCI.has(normalizeCI(s.ci))).forEach((p) => pushUnique("subcoordinador", p));
  929
      vots.filter((v) => normalizeCI(v.dirigente_ci) === miCI).forEach((p) => pushUnique("votante", p));
  930
      return out;
  931
    }
  931
    if (role === "coordinador") {
  932
      const misSubs = subs.filter((s) => normalizeCI(s.coordinador_ci) === miCI);
  932
      const misSubsSet = new Set(misSubs.map((s) => normalizeCI(s.ci)));
  933
      misSubs.forEach((p) => pushUnique("subcoordinador", p));
  933
      vots.filter((v) => normalizeCI(v.asignado_por) === miCI).forEach((p) => pushUnique("votante", p));
  934
      vots.filter((v) => misSubsSet.has(normalizeCI(v.asignado_por))).forEach((p) => pushUnique("votante", p));
  935
      return out;
  936
    }
  936
    if (role === "subcoordinador") {
  937
      vots.filter((v) => normalizeCI(v.asignado_por) === miCI).forEach((p) => pushUnique("votante", p));
  938
      return out;
  939
    }
  939
    return [];
  940
  }, [estructura, currentUser]);
  941

  941
  const resultadosBusqueda = useMemo(() => {
  942
    const qRaw = normalizeText(searchCI);
  942
    if (!qRaw) return personasVisibles;
  943
    const tokens = qRaw.split(" ").filter(Boolean);
  943
    return personasVisibles.filter(({ persona }) => {
  944
      const ci = normalizeText(persona?.ci);
  944
      const nombre = normalizeText(persona?.nombre);
  945
      const apellido = normalizeText(persona?.apellido);
  945
      const full1 = `${nombre} ${apellido}`.trim();
  946
      const full2 = `${apellido} ${nombre}`.trim();
  946
      return tokens.every((t) => ci.includes(t) || nombre.includes(t) || apellido.includes(t) || full1.includes(t) || full2.includes(t));
  947
    });
  948
  }, [searchCI, personasVisibles]);
  949

  949
  // ======================= PDF =======================
  950
  const descargarPDF = async () => {
  951
    if (!currentUser) { alert("Usuario no valido"); return; }
  952
    try {
  953
      let doc;
  953
      let filename = "reporte";
  954
      if (currentUser.role === "superadmin") { doc = await generateSuperadminPDF({ estructura, currentUser }); filename = "reporte-superadmin"; }
  955
      else if (currentUser.role === "coordinador") { doc = await generateCoordinadorPDF({ estructura, currentUser }); filename = "reporte-coordinador"; }
  956
      else if (currentUser.role === "subcoordinador") { doc = await generateSubcoordinadorPDF({ estructura, currentUser }); filename = "reporte-subcoordinador"; }
  957
      else { alert("Rol no soportado para reportes"); return; }
  958
      const timestamp = new Date().toISOString().slice(0, 10);
  959
      doc.save(`${filename}-${timestamp}.pdf`);
  960
    } catch (error) {
  961
      console.error("Error generando PDF:", error);
  961
      alert("Error al generar el reporte PDF");
  962
    }
  963
  };
  964

  964
  // ======================= ROLE LABEL =======================
  965
  const roleLabel = {
  965
    superadmin: "Superadmin",
  966
    dirigente: "Dirigente",
  967
    coordinador: "Coordinador",
  968
    subcoordinador: "Sub-coordinador",
  969
  }[currentUser.role] ?? currentUser.role;
  970

  970
  // ======================= UI =======================
  971
  return (
  972
    <div className="min-h-screen bg-slate-100">
  973

  973
      {/* LOADING SPLASH */}
  974
      {loadingEstructura && (
  975
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center">
  976
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
  977
          <p className="mt-4 text-brand-700 font-semibold text-sm">Cargando estructura...</p>
  978
        </div>
  979
      )}
  980

  980
      {/* HEADER */}
  981
      <header className="bg-brand-700 shadow-md sticky top-0 z-40">
  982
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
  983
          <div className="flex items-center gap-3 min-w-0">
  983
            <div className="p-1.5 bg-white/10 rounded-lg shrink-0">
  984
              <Shield className="w-5 h-5 text-white" />
  984
            </div>
  985
            <div className="min-w-0">
  985
              <h1 className="text-base sm:text-lg font-bold text-white leading-tight truncate">Sistema Electoral</h1>
  986
              <p className="text-brand-200 text-xs truncate">
  987
                {currentUser.nombre} {currentUser.apellido}
  988
                <span className="ml-1.5 px-1.5 py-0.5 bg-white/10 rounded text-brand-100 text-xs">{roleLabel}</span>
  989
              </p>
  990
            </div>
  991
          </div>
  991
          <button onClick={handleLogout} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 h-9 rounded-lg text-sm font-medium transition-colors shrink-0 border-0 shadow-none">
  992
            <LogOut className="w-4 h-4" />
  992
            <span className="hidden sm:inline">Salir</span>
  993
          </button>
  994
        </div>
  995
      </header>
  996

  996
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
  997

  997
        {/* =========== STATS CARDS =========== */}
  998
        <section aria-label="Resumen estadistico">
  999

  999
          {/* SUPERADMIN */}
  1000
          {currentUser.role === "superadmin" && (
  1001
            <>
  1001
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
  1002
                <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
  1002
                <StatCard label="Dirigentes" value={stats?.dirigentes} icon={Shield} />
  1003
                <StatCard label="Coordinadores" value={stats?.coordinadores} icon={Users} />
  1003
                <StatCard label="Subcoordinadores" value={stats?.subcoordinadores} icon={Users} />
  1004
                <StatCard label="Votantes" value={stats?.votantes} icon={Users} />
  1004
                <StatCard label="Confirmados" value={stats?.totalConfirmados} icon={CheckCircle2} />
  1005
                <StatCard label="Pendientes" value={stats?.votosPendientes} icon={AlertCircle} />
  1006
              </div>
  1007
              <div className="mt-3">
  1007
                <VoteProgressCard confirmed={stats?.totalConfirmados} total={stats?.totalConfirmable} percentage={stats?.porcentajeConfirmados} />
  1008
              </div>
  1009
            </>
  1010
          )}
  1010

  1011
          {/* DIRIGENTE */}
  1011
          {currentUser.role === "dirigente" && (
  1012
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
  1013
              <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
  1013
              <StatCard label="Coordinadores" value={stats?.coordinadores} icon={Users} />
  1014
              <StatCard label="Subcoordinadores" value={stats?.subcoordinadores} icon={Users} />
  1014
              <StatCard label="Votantes directos" value={stats?.votantesDirectos} icon={Users} />
  1015
              <StatCard label="Votantes de coords" value={stats?.votantesDeCoords} icon={Users} />
  1015
              <StatCard label="Votantes de subs" value={stats?.votantesDeSubs} icon={Users} />
  1016
            </div>
  1017
          )}
  1017

  1018
          {/* COORDINADOR */}
  1018
          {currentUser.role === "coordinador" && (
  1019
            <>
  1019
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
  1020
                <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
  1020
                <StatCard label="Subcoordinadores" value={stats?.subcoordinadores} icon={Users} />
  1021
                <StatCard label="Votantes directos" value={stats?.votantesDirectos} icon={Users} />
  1022
                <StatCard label="Total votantes" value={stats?.totalVotantes} icon={Users} />
  1022
                <StatCard label="Confirmados" value={stats?.totalConfirmados} icon={CheckCircle2} />
  1023
                <StatCard label="Pendientes" value={stats?.votosPendientes} icon={AlertCircle} />
  1024
              </div>
  1025
              <div className="mt-3">
  1025
                <VoteProgressCard confirmed={stats?.totalConfirmados} total={stats?.totalConfirmable} percentage={stats?.porcentajeConfirmados} />
  1026
              </div>
  1027
            </>
  1028
          )}
  1028

  1029
          {/* SUBCOORDINADOR */}
  1029
          {currentUser.role === "subcoordinador" && (
  1030
            <>
  1030
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
  1031
                <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
  1031
                <StatCard label="Mis votantes" value={stats?.votantes} icon={Users} />
  1032
                <StatCard label="Confirmados" value={stats?.totalConfirmados} icon={CheckCircle2} />
  1033
                <StatCard label="Pendientes" value={stats?.votosPendientes} icon={AlertCircle} />
  1034
              </div>
  1035
              <div className="mt-3">
  1035
                <VoteProgressCard confirmed={stats?.totalConfirmados} total={stats?.totalConfirmable} percentage={stats?.porcentajeConfirmados} />
  1036
              </div>
  1037
            </>
  1038
          )}
  1038
        </section>
  1039

  1039
        {/* =========== ACTION BUTTONS =========== */}
  1040
        <section className="flex flex-wrap gap-2" aria-label="Acciones">
  1040
          {/* Superadmin: agregar dirigente y coordinador */}
  1041
          {currentUser.role === "superadmin" && (
  1042
            <>
  1042
              <button
  1043
                onClick={() => setShowAddDirigenteModal(true)}
  1044
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto border-0"
  1045
              >
  1046
                <UserPlus className="w-4 h-4" />
  1046
                Agregar Dirigente
  1047
              </button>
  1048
              <button
  1049
                onClick={() => { setModalType("coordinador"); setShowAddModal(true); }}
  1050
                className="inline-flex items-center gap-2 border border-brand-300 bg-white hover:bg-brand-50 text-brand-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto"
  1051
              >
  1051
                <UserPlus className="w-4 h-4" />
  1052
                Agregar Coordinador
  1053
              </button>
  1054
            </>
  1055
          )}
  1055

  1056
          {/* Dirigente: agregar coordinador y votante */}
  1056
          {currentUser.role === "dirigente" && (
  1057
            <>
  1057
              <button
  1058
                onClick={() => { setModalType("coordinador"); setShowAddModal(true); }}
  1059
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto border-0"
  1060
              >
  1060
                <UserPlus className="w-4 h-4" />
  1061
                Agregar Coordinador
  1062
              </button>
  1063
              <button
  1064
                onClick={() => { setModalType("votante"); setShowAddModal(true); }}
  1065
                className="inline-flex items-center gap-2 border border-brand-300 bg-white hover:bg-brand-50 text-brand-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shadow-sm"
  1066
              >
  1066
                <UserPlus className="w-4 h-4" />
  1067
                Agregar Votante
  1068
              </button>
  1069
            </>
  1070
          )}
  1070

  1071
          {/* Coordinador */}
  1071
          {currentUser.role === "coordinador" && (
  1072
            <>
  1072
              <button
  1073
                onClick={() => { setModalType("subcoordinador"); setShowAddModal(true); }}
  1074
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto border-0"
  1075
              >
  1075
                <UserPlus className="w-4 h-4" />
  1076
                Agregar Subcoordinador
  1077
              </button>
  1078
              <button
  1079
                onClick={() => { setModalType("votante"); setShowAddModal(true); }}
  1080
                className="inline-flex items-center gap-2 border border-brand-300 bg-white hover:bg-brand-50 text-brand-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shadow-sm"
  1081
              >
  1081
                <UserPlus className="w-4 h-4" />
  1082
                Agregar Votante
  1083
              </button>
  1084
            </>
  1085
          )}
  1085

  1086
          {/* Subcoordinador */}
  1086
          {currentUser.role === "subcoordinador" && (
  1087
            <button
  1088
              onClick={() => { setModalType("votante"); setShowAddModal(true); }}
  1089
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto border-0"
  1090
            >
  1090
              <UserPlus className="w-4 h-4" />
  1091
              Agregar Votante
  1092
            </button>
  1093
          )}
  1093

  1094
          {currentUser.role !== "dirigente" && (
  1095
            <button
  1096
              onClick={descargarPDF}
  1097
              className="inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shadow-sm"
  1098
            >
  1098
              <FileText className="w-4 h-4" />
  1099
              Descargar PDF
  1100
            </button>
  1101
          )}
  1101
        </section>
  1102

  1102
        {/* =========== BUSCADOR =========== */}
  1103
        <section aria-label="Busqueda interna">
  1104
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
  1105
            <label htmlFor="searchCI" className="block text-sm font-semibold text-slate-700 mb-2">
  1106
              Buscar en mi estructura
  1107
            </label>
  1108
            <div className="relative">
  1108
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
  1109
              <input
  1110
                id="searchCI"
  1110
                value={searchCI}
  1111
                onChange={(e) => setSearchCI(e.target.value)}
  1112
                placeholder="CI, nombre, apellido o combinacion..."
  1113
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
  1114
              />
  1114
              {searchCI && (
  1115
                <button onClick={() => setSearchCI("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0 bg-transparent border-0 shadow-none">
  1116
                  <X className="w-4 h-4" />
  1116
                </button>
  1117
              )}
  1118
            </div>
  1118
            {normalizeText(searchCI) && (
  1119
              <p className="text-xs text-slate-500 mt-2">{resultadosBusqueda.length} resultado{resultadosBusqueda.length !== 1 ? "s" : ""}</p>
  1120
            )}
  1121
          </div>
  1122
        </section>
  1122

  1122
        {/* =========== RESULTADOS BUSQUEDA =========== */}
  1123
        {normalizeText(searchCI) && (
  1124
          <section aria-label="Resultados de busqueda">
  1125
            <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
  1126
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
  1126
                <h3 className="font-semibold text-sm text-slate-700">Resultados de busqueda</h3>
  1127
                <p className="text-xs text-slate-400 mt-0.5">Solo dentro de la estructura permitida para tu rol.</p>
  1128
              </div>
  1128
              <div className="p-4 space-y-2">
  1129
                {resultadosBusqueda.length === 0 ? (
  1130
                  <div className="text-center py-8">
  1131
                    <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
  1131
                    <p className="text-sm text-slate-500">No se encontraron coincidencias.</p>
  1132
                  </div>
  1133
                ) : (
  1134
                  resultadosBusqueda.slice(0, 50).map(({ tipo, persona }) => (
  1135
                    <div key={`${tipo}-${persona.ci}`} className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:bg-slate-50 transition-colors">
  1136
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
  1137
                        <div className="flex-1 min-w-0">
  1137
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
  1138
                            <span className={`font-semibold text-sm truncate ${persona.nombre ? "text-slate-800" : "text-slate-400 italic"}`}>
  1139
                              {persona.nombre ? `${persona.nombre} ${persona.apellido || ""}`.trim() : "Cargando..."}
  1140
                            </span>
  1140
                            <Badge variant={tipo === "dirigente" ? "purple" : tipo === "coordinador" ? "red" : tipo === "subcoordinador" ? "blue" : "default"}>
  1141
                              {tipo === "dirigente" ? "Dirigente" : tipo === "coordinador" ? "Coordinador" : tipo === "subcoordinador" ? "Subcoordinador" : "Votante"}
  1142
                            </Badge>
  1142
                            {tipo === "votante" && persona.voto_confirmado && (
  1143
                              <Badge variant="green"><Check className="w-3 h-3 mr-1" />Confirmado</Badge>
  1144
                            )}
  1144
                            {tipo === "votante" && persona.tercera_edad === true && <TerceraEdadBadge />}
  1145
                          </div>
  1145
                          <p className="text-xs text-slate-500">CI: {persona.ci}</p>
  1146
                          {persona.telefono && <p className="text-xs text-slate-500">Tel: {persona.telefono}</p>}
  1147
                        </div>
  1148
                        <div className="flex gap-1.5 shrink-0 flex-wrap">
  1148
                          {tipo !== "dirigente" && (
  1149
                            <>
  1149
                              <ActionBtn onClick={() => abrirTelefono(tipo, persona)} title="Editar telefono" variant="green"><Phone className="w-3.5 h-3.5" /></ActionBtn>
  1150
                              <ActionBtn onClick={() => abrirDireccion(tipo, persona)} title="Editar direccion" variant="blue"><MapPin className="w-3.5 h-3.5" /></ActionBtn>
  1151
                            </>
  1152
                          )}
  1152
                          {tipo === "votante" && !persona.voto_confirmado && canConfirmarVoto(persona) && (
  1153
                            <ActionBtn onClick={() => abrirConfirmVoto(persona)} title="Confirmar voto" variant="success-solid"><Check className="w-3.5 h-3.5" /></ActionBtn>
  1154
                          )}
  1154
                          {tipo === "votante" && persona.voto_confirmado && canAnularConfirmacion(persona) && (
  1155
                            <ActionBtn onClick={() => abrirAnularConfirmacion(persona)} title="Anular confirmacion" variant="danger"><X className="w-3.5 h-3.5" /></ActionBtn>
  1156
                          )}
  1157
                        </div>
  1158
                      </div>
  1159
                    </div>
  1160
                  ))
  1161
                )}
  1161
                {resultadosBusqueda.length > 50 && (
  1162
                  <p className="text-xs text-center text-slate-400 pt-2">Mostrando 50 resultados. Refine la busqueda para acotar.</p>
  1163
                )}
  1164
              </div>
  1165
            </div>
  1166
          </section>
  1167
        )}
  1167

  1168
        {/* =========== MI ESTRUCTURA =========== */}
  1169
        <section aria-label="Mi estructura">
  1170
          <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
  1171
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
  1172
              <Users className="w-4 h-4 text-slate-500" />
  1172
              <h2 className="text-base font-bold text-slate-800">Mi Estructura</h2>
  1173
            </div>
  1173
            <div className="p-4 sm:p-5">
  1174
              {loadingEstructura && (
  1175
                <div className="flex items-center justify-center py-12">
  1176
                  <div className="flex flex-col items-center gap-3">
  1176
                    <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
  1177
                    <p className="text-sm text-slate-400">Cargando estructura...</p>
  1178
                  </div>
  1179
                </div>
  1180
              )}
  1180

  1181
              {/* ====== SUPERADMIN ====== */}
  1182
              {!loadingEstructura && currentUser.role === "superadmin" && (
  1183
                <SuperadminTree
  1184
                  estructura={estructura}
  1184
                  expandedCoords={expandedCoords}
  1185
                  toggleExpand={toggleExpand}
  1186
                  voteCountsByCoord={voteCountsByCoord}
  1187
                  voteCountsBySub={voteCountsBySub}
  1188
                  copyToClipboard={copyToClipboard}
  1189
                  abrirTelefono={abrirTelefono}
  1190
                  abrirDireccion={abrirDireccion}
  1191
                  abrirConfirmVoto={abrirConfirmVoto}
  1192
                  abrirAnularConfirmacion={abrirAnularConfirmacion}
  1193
                  canConfirmarVoto={canConfirmarVoto}
  1194
                  canAnularConfirmacion={canAnularConfirmacion}
  1195
                  getVotantesDeSubcoord={getVotantesDeSubcoord}
  1196
                />
  1197
              )}
  1197

  1198
              {/* ====== DIRIGENTE ====== */}
  1198
              {!loadingEstructura && currentUser.role === "dirigente" && (
  1199
                <DirigenteTree
  1199
                  currentUser={currentUser}
  1200
                  estructura={estructura}
  1200
                  expandedCoords={expandedCoords}
  1201
                  toggleExpand={toggleExpand}
  1202
                  voteCountsByCoord={voteCountsByCoord}
  1203
                  voteCountsBySub={voteCountsBySub}
  1204
                  copyToClipboard={copyToClipboard}
  1205
                  abrirTelefono={abrirTelefono}
  1206
                  abrirDireccion={abrirDireccion}
  1207
                  abrirConfirmVoto={abrirConfirmVoto}
  1208
                  abrirAnularConfirmacion={abrirAnularConfirmacion}
  1209
                  canConfirmarVoto={canConfirmarVoto}
  1210
                  canAnularConfirmacion={canAnularConfirmacion}
  1211
                  getVotantesDeSubcoord={getVotantesDeSubcoord}
  1212
                />
  1213
              )}
  1213

  1214
              {/* ====== COORDINADOR ====== */}
  1214
              {!loadingEstructura && currentUser.role === "coordinador" && (
  1215
                <CoordinadorTree
  1215
                  currentUser={currentUser}
  1216
                  estructura={estructura}
  1217
                  expandedCoords={expandedCoords}
  1218
                  toggleExpand={toggleExpand}
  1219
                  voteCountsBySub={voteCountsBySub}
  1220
                  copyToClipboard={copyToClipboard}
  1221
                  abrirTelefono={abrirTelefono}
  1222
                  abrirDireccion={abrirDireccion}
  1223
                  abrirConfirmVoto={abrirConfirmVoto}
  1224
                  abrirAnularConfirmacion={abrirAnularConfirmacion}
  1225
                  abrirConfirmSub={abrirConfirmSub}
  1226
                  abrirAnularConfirmSub={abrirAnularConfirmSub}
  1227
                  canConfirmarVoto={canConfirmarVoto}
  1228
                  canAnularConfirmacion={canAnularConfirmacion}
  1229
                  getMisSubcoordinadores={getMisSubcoordinadores}
  1230
                  getMisVotantes={getMisVotantes}
  1231
                  getVotantesDeSubcoord={getVotantesDeSubcoord}
  1232
                />
  1233
              )}
  1233

  1234
              {/* ====== SUBCOORDINADOR ====== */}
  1234
              {!loadingEstructura && currentUser.role === "subcoordinador" && (
  1235
                <div className="space-y-1.5">
  1235
                  {getMisVotantes(estructura, currentUser).map((v) => (
  1236
                    <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />
  1237
                  ))}
  1238
                  {getMisVotantes(estructura, currentUser).length === 0 && (
  1239
                    <div className="text-center py-10">
  1239
                      <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
  1240
                      <p className="text-sm text-slate-400">No tiene votantes asignados.</p>
  1241
                    </div>
  1242
                  )}
  1243
                </div>
  1244
              )}
  1244
            </div>
  1245
          </div>
  1246
        </section>
  1247
      </main>
  1248

  1248
      {/* =========== MODALS =========== */}
  1249
      <ModalTelefono open={phoneModalOpen} persona={phoneTarget} value={phoneValue} onChange={setPhoneValue} onCancel={() => { setPhoneModalOpen(false); setPhoneTarget(null); setPhoneValue("+595"); }} onSave={guardarTelefono} />
  1250
      <ModalDireccion open={direccionModalOpen} persona={direccionTarget} value={direccionValue} onChange={setDireccionValue} onCancel={() => { setDireccionModalOpen(false); setDireccionTarget(null); setDireccionValue(""); }} onSave={guardarDireccion} />
  1251
      <AddPersonModal show={showAddModal} onClose={() => setShowAddModal(false)} tipo={modalType} onAdd={handleAgregarPersona} disponibles={disponibles} />
  1252
      <ConfirmVotoModal open={confirmVotoModalOpen} votante={confirmVotoTarget} isUndoing={isVotoUndoing} onCancel={() => { setConfirmVotoModalOpen(false); setConfirmVotoTarget(null); setIsVotoUndoing(false); }} onConfirm={handleConfirmVoto} isLoading={isConfirmVotoLoading} />
  1253
      <ConfirmVotoModal open={confirmSubModalOpen} votante={confirmSubTarget} isUndoing={isSubUndoing} onCancel={() => { setConfirmSubModalOpen(false); setConfirmSubTarget(null); setIsSubUndoing(false); }} onConfirm={handleConfirmSub} isLoading={isConfirmSubLoading} titleConfirm="Confirmar Subcoordinador" titleUndo="Anular Confirmacion de Sub" descConfirm="Confirmar al subcoordinador como activo y verificado." descUndo="Anular la confirmacion del subcoordinador." />
  1254
      <ModalAgregarDirigente
  1255
        show={showAddDirigenteModal}
  1256
        onClose={() => setShowAddDirigenteModal(false)}
  1257
        disponibles={disponibles}
  1258
        onAgregarDesdePadron={handleAgregarDirigenteDesdePadron}
  1259
        onAgregarExterno={handleAgregarDirigenteExterno}
  1260
      />
  1260

  1261
      {/* TOAST */}
  1261
      {toastMsg && (
  1262
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
  1263
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium shadow-lg">
  1264
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
  1265
            {toastMsg}
  1266
          </div>
  1267
        </div>
  1268
      )}
  1269
    </div>
  1270
  );
  1271
};
  1272

  1272
export default Dashboard;
  1273

  1273
// ======================= SUPERADMIN TREE =======================
  1274
const SuperadminTree = ({
  1275
  estructura,
  1276
  expandedCoords,
  1277
  toggleExpand,
  1278
  voteCountsByCoord,
  1279
  voteCountsBySub,
  1280
  copyToClipboard,
  1281
  abrirTelefono,
  1282
  abrirDireccion,
  1283
  abrirConfirmVoto,
  1284
  abrirAnularConfirmacion,
  1285
  canConfirmarVoto,
  1286
  canAnularConfirmacion,
  1287
  getVotantesDeSubcoord,
  1288
}) => {
  1288
  const { dirigentes, coordinadores, subcoordinadores, votantes } = estructura;
  1289

  1289
  // Group coordinadores by dirigente_ci (null = sin dirigente)
  1290
  const coordsByDirigente = {};
  1291
  (coordinadores || []).forEach((c) => {
  1292
    const key = c.dirigente_ci ? normalizeCI(c.dirigente_ci) : "__sin_dirigente__";
  1293
    if (!coordsByDirigente[key]) coordsByDirigente[key] = [];
  1294
    coordsByDirigente[key].push(c);
  1295
  });
  1295

  1296
  const renderCoord = (coord) => {
  1296
    const coordCI = normalizeCI(coord.ci);
  1297
    const coordCounts = voteCountsByCoord[coordCI] ?? { confirmed: 0, total: 0 };
  1297
    return (
  1298
      <div key={coord.ci} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
  1299
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(coord.ci)}>
  1300
          <div className="flex items-start gap-2 flex-1 min-w-0">
  1300
            <span className="text-brand-500 shrink-0 mt-0.5">
  1301
              {expandedCoords[coordCI] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
  1302
            </span>
  1302
            <div className="flex-1 min-w-0">
  1303
              <DatosPersona persona={coord} rol="Coordinador" loginCode={coord.login_code} onCopy={copyToClipboard} counter={<VoteCounter confirmed={coordCounts.confirmed} total={coordCounts.total} />} />
  1304
            </div>
  1305
          </div>
  1305
          <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
  1306
            <ActionBtn onClick={() => abrirTelefono("coordinador", coord)} title="Editar telefono" variant="green"><Phone className="w-3.5 h-3.5" /></ActionBtn>
  1307
            <ActionBtn onClick={() => abrirDireccion("coordinador", coord)} title="Editar direccion" variant="blue"><MapPin className="w-3.5 h-3.5" /></ActionBtn>
  1308
          </div>
  1308
        </div>
  1309
        {expandedCoords[coordCI] && (
  1310
          <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3 space-y-2 animate-fade-in">
  1311
            {/* Subcoords */}
  1311
            {(subcoordinadores || []).filter((s) => normalizeCI(s.coordinador_ci) === coordCI).map((sub) => {
  1312
              const subCI = normalizeCI(sub.ci);
  1312
              const subCounts = voteCountsBySub[subCI] ?? { confirmed: 0, total: 0 };
  1313
              return (
  1313
                <div key={sub.ci} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
  1314
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(sub.ci)}>
  1315
                    <div className="flex items-start gap-2 flex-1 min-w-0">
  1315
                      <span className="text-brand-400 shrink-0 mt-0.5">{expandedCoords[subCI] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</span>
  1316
                      <div className="flex-1 min-w-0">
  1316
                        <DatosPersona persona={sub} rol="Sub-coordinador" loginCode={sub.login_code} onCopy={copyToClipboard} counter={<VoteCounter confirmed={subCounts.confirmed} total={subCounts.total} />} />
  1317
                        {sub.confirmado && <div className="mt-1"><Badge variant="green"><Check className="w-3 h-3 mr-1" />Sub confirmado</Badge></div>}
  1318
                      </div>
  1318
                    </div>
  1319
                    <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
  1319
                      <ActionBtn onClick={() => abrirTelefono("subcoordinador", sub)} title="Editar telefono" variant="green"><Phone className="w-3.5 h-3.5" /></ActionBtn>
  1320
                      <ActionBtn onClick={() => abrirDireccion("subcoordinador", sub)} title="Editar direccion" variant="blue"><MapPin className="w-3.5 h-3.5" /></ActionBtn>
  1321
                    </div>
  1321
                  </div>
  1322
                  {expandedCoords[subCI] && (
  1323
                    <div className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2 space-y-1.5 animate-fade-in">
  1324
                      {getVotantesDeSubcoord(estructura, sub.ci).map((v) => (
  1325
                        <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />
  1326
                      ))}
  1327
                      {getVotantesDeSubcoord(estructura, sub.ci).length === 0 && <p className="text-xs text-slate-400 text-center py-2">Sin votantes asignados.</p>}
  1328
                    </div>
  1329
                  )}
  1330
                </div>
  1331
              );
  1331
            })}
  1332
            {/* Direct voters of coord */}
  1332
            {(() => {
  1333
              const dv = (votantes || []).filter((v) => normalizeCI(v.asignado_por) === coordCI && normalizeCI(v.asignado_por_rol) === "coordinador");
  1334
              if (dv.length === 0) return null;
  1334
              return (
  1335
                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
  1336
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
  1336
                    <p className="font-semibold text-xs text-slate-600 flex items-center gap-1.5">
  1337
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
  1337
                      Votantes directos del coordinador <span className="text-slate-400 font-normal">({dv.length})</span>
  1338
                    </p>
  1339
                  </div>
  1340
                  <div className="p-2.5 space-y-1.5">
  1340
                    {dv.map((v) => <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />)}
  1341
                  </div>
  1342
                </div>
  1343
              );
  1344
            })()}
  1345
          </div>
  1346
        )}
  1347
      </div>
  1348
    );
  1349
  };
  1349

  1350
  // If no dirigentes, show flat list of coordinadores
  1350
  if ((dirigentes || []).length === 0 && (coordinadores || []).length === 0) {
  1351
    return (
  1352
      <div className="text-center py-10">
  1352
        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
  1353
        <p className="text-sm text-slate-400">No hay dirigentes ni coordinadores aun.</p>
  1354
      </div>
  1355
    );
  1356
  }
  1356

  1357
  return (
  1358
    <div className="space-y-3">
  1359
      {/* Coords without a dirigente */}
  1360
      {(coordsByDirigente["__sin_dirigente__"] || []).length > 0 && (
  1361
        <div className="border border-slate-200 rounded-xl overflow-hidden">
  1362
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
  1362
            <p className="font-semibold text-sm text-slate-600">Sin dirigente asignado</p>
  1363
          </div>
  1364
          <div className="p-3 space-y-2">
  1364
            {(coordsByDirigente["__sin_dirigente__"] || []).map(renderCoord)}
  1365
          </div>
  1365
        </div>
  1366
      )}
  1366

  1367
      {/* Dirigentes with their trees */}
  1368
      {(dirigentes || []).map((dir) => {
  1368
        const dirCI = normalizeCI(dir.ci);
  1368
        const dirKey = `dir-${dirCI}`;
  1369
        const dirCoords = coordsByDirigente[dirCI] || [];
  1369
        const dirVotantesDirectos = (votantes || []).filter((v) => normalizeCI(v.dirigente_ci) === dirCI && normalizeCI(v.asignado_por_rol) === "dirigente");
  1370
        return (
  1371
          <div key={dirCI} className="border border-purple-200 rounded-xl overflow-hidden">
  1372
            {/* Dirigente header */}
  1373
            <div
  1374
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 cursor-pointer hover:bg-purple-50 transition-colors bg-white"
  1375
              onClick={() => toggleExpand(dirKey)}
  1376
            >
  1377
              <div className="flex items-start gap-2 flex-1 min-w-0">
  1377
                <span className="text-purple-600 shrink-0 mt-0.5">
  1378
                  {expandedCoords[dirKey] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
  1379
                </span>
  1379
                <div className="flex-1 min-w-0">
  1380
                  <DatosPersona persona={dir} rol="Dirigente" loginCode={dir.login_code} onCopy={copyToClipboard} />
  1381
                  {dir.es_externo && <Badge variant="amber">Externo</Badge>}
  1382
                </div>
  1382
              </div>
  1382
              <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
  1383
                <ActionBtn onClick={() => abrirTelefono("dirigente", dir)} title="Editar telefono" variant="green"><Phone className="w-3.5 h-3.5" /></ActionBtn>
  1384
              </div>
  1385
            </div>
  1385
            {expandedCoords[dirKey] && (
  1386
              <div className="border-t border-purple-100 bg-purple-50/30 px-4 pb-4 pt-3 space-y-2 animate-fade-in">
  1387
                {/* Coordinadores */}
  1388
                {dirCoords.length > 0 && (
  1388
                  <div className="space-y-2">
  1389
                    {dirCoords.map(renderCoord)}
  1389
                  </div>
  1390
                )}
  1390
                {/* Votantes directos del dirigente */}
  1391
                {dirVotantesDirectos.length > 0 && (
  1391
                  <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
  1392
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
  1392
                      <p className="font-semibold text-xs text-slate-600 flex items-center gap-1.5">
  1393
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
  1393
                        Votantes directos del dirigente <span className="text-slate-400 font-normal">({dirVotantesDirectos.length})</span>
  1394
                      </p>
  1394
                    </div>
  1395
                    <div className="p-2.5 space-y-1.5">
  1395
                      {dirVotantesDirectos.map((v) => <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />)}
  1396
                    </div>
  1397
                  </div>
  1398
                )}
  1398
                {dirCoords.length === 0 && dirVotantesDirectos.length === 0 && (
  1399
                  <p className="text-xs text-slate-400 text-center py-3">Sin coordinadores ni votantes aun.</p>
  1400
                )}
  1400
              </div>
  1401
            )}
  1402
          </div>
  1403
        );
  1404
      })}
  1404
    </div>
  1405
  );
  1406
};
  1407

  1407
// ======================= DIRIGENTE TREE =======================
  1408
const DirigenteTree = ({
  1409
  currentUser,
  1410
  estructura,
  1411
  expandedCoords,
  1412
  toggleExpand,
  1413
  voteCountsByCoord,
  1414
  voteCountsBySub,
  1415
  copyToClipboard,
  1416
  abrirTelefono,
  1417
  abrirDireccion,
  1418
  abrirConfirmVoto,
  1419
  abrirAnularConfirmacion,
  1420
  canConfirmarVoto,
  1421
  canAnularConfirmacion,
  1422
  getVotantesDeSubcoord,
  1423
}) => {
  1424
  const miCI = normalizeCI(currentUser.ci);
  1424
  const misCoords = getCoordsDeDigente(estructura, miCI);
  1425
  const misVotantesDirectos = getVotantesDirectosDirigente(estructura, miCI);
  1425

  1426
  if (misCoords.length === 0 && misVotantesDirectos.length === 0) {
  1427
    return (
  1428
      <div className="text-center py-10">
  1428
        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
  1429
        <p className="text-sm text-slate-400">No tiene coordinadores ni votantes directos aun.</p>
  1430
      </div>
  1431
    );
  1432
  }
  1432

  1433
  return (
  1434
    <div className="space-y-2">
  1434
      {misCoords.map((coord) => {
  1435
        const coordCI = normalizeCI(coord.ci);
  1435
        const coordCounts = voteCountsByCoord[coordCI] ?? { confirmed: 0, total: 0 };
  1436
        return (
  1436
          <div key={coord.ci} className="border border-slate-200 rounded-xl overflow-hidden">
  1437
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition-colors bg-white" onClick={() => toggleExpand(coord.ci)}>
  1438
              <div className="flex items-start gap-2 flex-1 min-w-0">
  1438
                <span className="text-brand-600 shrink-0 mt-0.5">{expandedCoords[coordCI] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
  1439
                <div className="flex-1 min-w-0">
  1439
                  <DatosPersona persona={coord} rol="Coordinador" loginCode={coord.login_code} onCopy={copyToClipboard} counter={<VoteCounter confirmed={coordCounts.confirmed} total={coordCounts.total} />} />
  1440
                </div>
  1441
              </div>
  1441
              <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
  1442
                <ActionBtn onClick={() => abrirTelefono("coordinador", coord)} title="Editar telefono" variant="green"><Phone className="w-3.5 h-3.5" /></ActionBtn>
  1443
                <ActionBtn onClick={() => abrirDireccion("coordinador", coord)} title="Editar direccion" variant="blue"><MapPin className="w-3.5 h-3.5" /></ActionBtn>
  1444
              </div>
  1444
            </div>
  1445
            {expandedCoords[coordCI] && (
  1446
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3 space-y-2 animate-fade-in">
  1447
                {/* Subs del coord */}
  1447
                {(estructura.subcoordinadores || []).filter((s) => normalizeCI(s.coordinador_ci) === coordCI).map((sub) => {
  1448
                  const subCI = normalizeCI(sub.ci);
  1448
                  const subCounts = voteCountsBySub[subCI] ?? { confirmed: 0, total: 0 };
  1449
                  return (
  1449
                    <div key={sub.ci} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
  1450
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(sub.ci)}>
  1451
                        <div className="flex items-start gap-2 flex-1 min-w-0">
  1451
                          <span className="text-brand-500 shrink-0 mt-0.5">{expandedCoords[subCI] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</span>
  1452
                          <div className="flex-1 min-w-0">
  1452
                            <DatosPersona persona={sub} rol="Sub-coordinador" loginCode={sub.login_code} onCopy={copyToClipboard} counter={<VoteCounter confirmed={subCounts.confirmed} total={subCounts.total} />} />
  1453
                            {sub.confirmado && <div className="mt-1"><Badge variant="green"><Check className="w-3 h-3 mr-1" />Sub confirmado</Badge></div>}
  1454
                          </div>
  1455
                        </div>
  1456
                      </div>
  1456
                      {expandedCoords[subCI] && (
  1457
                        <div className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2 space-y-1.5 animate-fade-in">
  1458
                          {getVotantesDeSubcoord(estructura, sub.ci).map((v) => (
  1459
                            <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />
  1460
                          ))}
  1461
                          {getVotantesDeSubcoord(estructura, sub.ci).length === 0 && <p className="text-xs text-slate-400 text-center py-2">Sin votantes asignados.</p>}
  1462
                        </div>
  1463
                      )}
  1464
                    </div>
  1465
                  );
  1465
                })}
  1466
                {/* Votantes directos del coord */}
  1466
                {(() => {
  1467
                  const dv = (estructura.votantes || []).filter((v) => normalizeCI(v.coordinador_ci) === coordCI && normalizeCI(v.asignado_por_rol) === "coordinador");
  1468
                  if (dv.length === 0) return null;
  1468
                  return (
  1469
                    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
  1470
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
  1470
                        <p className="font-semibold text-xs text-slate-600 flex items-center gap-1.5">
  1471
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
  1471
                          Votantes directos del coordinador <span className="text-slate-400 font-normal">({dv.length})</span>
  1472
                        </p>
  1473
                      </div>
  1474
                      <div className="p-2.5 space-y-1.5">
  1475
                        {dv.map((v) => <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />)}
  1476
                      </div>
  1477
                    </div>
  1478
                  );
  1479
                })()}
  1479
              </div>
  1480
            )}
  1481
          </div>
  1482
        );
  1483
      })}
  1483

  1484
      {/* Votantes directos del dirigente */}
  1484
      {misVotantesDirectos.length > 0 && (
  1485
        <div className="border border-slate-200 rounded-xl overflow-hidden">
  1486
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
  1486
            <p className="font-semibold text-sm text-slate-700 flex items-center gap-2">
  1487
              <Clock className="w-4 h-4 text-slate-400" />
  1487
              Mis votantes directos <span className="text-slate-400 font-normal text-xs">({misVotantesDirectos.length})</span>
  1488
            </p>
  1489
          </div>
  1490
          <div className="p-3 space-y-1.5">
  1490
            {misVotantesDirectos.map((v) => <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />)}
  1491
          </div>
  1492
        </div>
  1493
      )}
  1493
    </div>
  1494
  );
  1495
};
  1496

  1496
// ======================= COORDINADOR TREE =======================
  1497
const CoordinadorTree = ({
  1498
  currentUser,
  1499
  estructura,
  1500
  expandedCoords,
  1501
  toggleExpand,
  1502
  voteCountsBySub,
  1503
  copyToClipboard,
  1504
  abrirTelefono,
  1505
  abrirDireccion,
  1506
  abrirConfirmVoto,
  1507
  abrirAnularConfirmacion,
  1508
  abrirConfirmSub,
  1509
  abrirAnularConfirmSub,
  1510
  canConfirmarVoto,
  1511
  canAnularConfirmacion,
  1512
  getMisSubcoordinadores,
  1513
  getMisVotantes,
  1514
  getVotantesDeSubcoord,
  1515
}) => {
  1516
  const misSubs = getMisSubcoordinadores(estructura, currentUser);
  1516
  const misVotantesDirectos = getMisVotantes(estructura, currentUser);
  1517

  1518
  if (misSubs.length === 0 && misVotantesDirectos.length === 0) {
  1519
    return (
  1520
      <div className="text-center py-10">
  1520
        <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
  1521
        <p className="text-sm text-slate-400">Aun no tiene subcoordinadores ni votantes asignados.</p>
  1522
      </div>
  1523
    );
  1524
  }
  1524

  1525
  return (
  1526
    <div className="space-y-2">
  1526
      {misSubs.map((sub) => {
  1527
        const subCI = normalizeCI(sub.ci);
  1527
        const subCounts = voteCountsBySub[subCI] ?? { confirmed: 0, total: 0 };
  1528
        return (
  1528
          <div key={sub.ci} className="border border-slate-200 rounded-xl overflow-hidden">
  1529
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition-colors bg-white" onClick={() => toggleExpand(sub.ci)}>
  1530
              <div className="flex items-start gap-2 flex-1 min-w-0">
  1530
                <span className="text-brand-600 shrink-0 mt-0.5">{expandedCoords[subCI] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
  1531
                <div className="flex-1 min-w-0">
  1531
                  <DatosPersona persona={sub} rol="Sub-coordinador" loginCode={sub.login_code} onCopy={copyToClipboard} counter={<VoteCounter confirmed={subCounts.confirmed} total={subCounts.total} />} />
  1532
                  {sub.confirmado && <div className="mt-1"><Badge variant="green"><Check className="w-3 h-3 mr-1" />Sub confirmado</Badge></div>}
  1533
                </div>
  1534
              </div>
  1534
              <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
  1535
                {!sub.confirmado && <ActionBtn onClick={() => abrirConfirmSub(sub)} title="Confirmar sub" variant="success-solid"><Check className="w-3.5 h-3.5" /></ActionBtn>}
  1536
                {sub.confirmado && <ActionBtn onClick={() => abrirAnularConfirmSub(sub)} title="Anular confirmacion sub" variant="danger"><X className="w-3.5 h-3.5" /></ActionBtn>}
  1537
                <ActionBtn onClick={() => abrirTelefono("subcoordinador", sub)} title="Editar telefono" variant="green"><Phone className="w-3.5 h-3.5" /></ActionBtn>
  1538
                <ActionBtn onClick={() => abrirDireccion("subcoordinador", sub)} title="Editar direccion" variant="blue"><MapPin className="w-3.5 h-3.5" /></ActionBtn>
  1539
              </div>
  1539
            </div>
  1540
            {expandedCoords[subCI] && (
  1541
              <div className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2 space-y-1.5 animate-fade-in">
  1542
                <p className="text-xs font-semibold text-slate-600 mb-1">Votantes asignados</p>
  1542
                {getVotantesDeSubcoord(estructura, sub.ci).map((v) => (
  1543
                  <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />
  1544
                ))}
  1545
                {getVotantesDeSubcoord(estructura, sub.ci).length === 0 && <p className="text-xs text-slate-400 text-center py-2">Sin votantes asignados.</p>}
  1546
              </div>
  1547
            )}
  1548
          </div>
  1549
        );
  1550
      })}
  1550

  1551
      {misVotantesDirectos.length > 0 && (
  1552
        <div className="border border-slate-200 rounded-xl overflow-hidden">
  1552
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
  1553
            <p className="font-semibold text-sm text-slate-700 flex items-center gap-2">
  1553
              <Clock className="w-4 h-4 text-slate-400" />
  1554
              Mis votantes directos
  1555
            </p>
  1556
          </div>
  1556
          <div className="p-3 space-y-1.5">
  1557
            {misVotantesDirectos.map((v) => (
  1558
              <VotanteRow key={v.ci} v={v} onTelefono={abrirTelefono} onDireccion={abrirDireccion} onConfirmar={abrirConfirmVoto} onAnular={abrirAnularConfirmacion} canConfirmar={canConfirmarVoto} canAnular={canAnularConfirmacion} />
  1559
            ))}
  1560
          </div>
  1561
        </div>
  1562
      )}
  1563
    </div>
  1564
  );
  1565
};
