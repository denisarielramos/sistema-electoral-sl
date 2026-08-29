import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Database,
  Hash,
  LoaderCircle,
  MapPin,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import { resolverConsultaLocal } from "../utils/asistenteConsultas";
import { buildAsistenteResumen } from "../utils/asistenteResumen";

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "Hola. Puedo consultar la estructura y el padrón, mostrar fichas completas y explicar las cifras generales. Las búsquedas de personas se resuelven dentro de esta aplicación y no modifican datos.",
};

const SUGGESTIONS = [
  "¿Quiénes son los dirigentes sin coordinadores?",
  "Mostrame las personas de tercera edad",
  "Mostrame los votantes pendientes",
];

const formatAssistantMarkdown = (content) =>
  String(content || "")
    .replace(/^Resumen general:\s*$/gim, "### Resumen general")
    .replace(/^\s*-\s+En la estructura jerárquica:\s*$/gim, "\n#### Estructura jerárquica\n")
    .replace(/^\s*-\s+(Confirmación|Promedios):\s*$/gim, "\n#### $1\n")
    .replace(/^\s{2,}-\s+/gm, "- ")
    .trim();

const markdownComponents = {
  h3: ({ children }) => (
    <h3 className="mb-4 text-base font-bold tracking-tight text-slate-900">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-5 mb-2 border-t border-slate-100 pt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700 first:mt-0 first:border-0 first:pt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-6 text-slate-700 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => <ul className="my-2 space-y-2.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-2.5 pl-5">{children}</ol>,
  li: ({ children }) => (
    <li className="relative pl-4 text-sm leading-6 text-slate-700 before:absolute before:left-0 before:top-[0.52rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-brand-400">
      {children}
    </li>
  ),
  strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
      {children}
    </a>
  ),
};

const InfoItem = ({ icon: Icon, label, value, wide = false }) => {
  if (!value) return null;
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <p className="break-words text-xs font-medium leading-5 text-slate-700">{value}</p>
    </div>
  );
};

const LocalResult = ({ result }) => {
  const [visibleCount, setVisibleCount] = useState(10);
  const rows = result.rows || [];
  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;
  const isCount = result.kind === "count";

  return (
    <div className="mt-1">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 ring-1 ring-emerald-100">
          <Database className="h-3 w-3" />
          Consulta local
        </span>
        <span className="text-[11px] font-semibold text-slate-400">No enviada a OpenAI</span>
      </div>

      {isCount ? (
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5 text-center">
          <span className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Hash className="h-4 w-4" />
          </span>
          <p className="mt-3 text-5xl font-black tracking-tight text-brand-700">{result.total}</p>
          <h3 className="mt-2 text-sm font-bold leading-5 text-slate-900">{result.title}</h3>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-bold leading-6 text-slate-900">{result.title}</h3>
            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-700 ring-1 ring-brand-100">
              {result.total}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-600">{result.description}</p>
        </>
      )}

      {!isCount && result.total === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
          <Search className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xs font-medium text-slate-500">No hay registros para mostrar.</p>
        </div>
      ) : !isCount ? (
        <div className="mt-4 space-y-3">
          {visibleRows.map((row, index) => {
            const confirmed = row.confirmacion?.startsWith("Confirmado");
            return (
              <article
                key={`${row.id}-${index}`}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900">{row.nombreCompleto}</h4>
                    <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                      {row.rol}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                      confirmed
                        ? "bg-emerald-100 text-emerald-700"
                        : row.confirmacion === "Pendiente"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {row.confirmacion}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200 pt-3">
                  <InfoItem icon={UserRound} label="CI" value={row.ci || "Sin dato"} />
                  <InfoItem icon={Phone} label="Teléfono" value={row.telefono || "Sin dato"} />
                  <InfoItem icon={MapPin} label="Local" value={row.local || "Sin dato"} wide />
                  <InfoItem label="Mesa" value={row.mesa || "Sin dato"} />
                  <InfoItem label="Orden" value={row.orden || "Sin dato"} />
                  <InfoItem label="Seccional" value={row.seccional || "Sin dato"} />
                  <InfoItem label="Tercera edad" value={row.terceraEdad} />
                  <InfoItem label="Dirigente" value={row.dirigente} wide />
                  <InfoItem label="Coordinador" value={row.coordinador} wide />
                  <InfoItem label="Subcoordinador" value={row.subcoordinador} wide />
                  <InfoItem label="Asignado por" value={row.asignadoPor} wide />
                  <InfoItem label="Dirección" value={row.direccion} wide />
                </div>
              </article>
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 10)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Mostrar 10 más
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}

          {result.truncated && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
              Se muestran los primeros {rows.length} de {result.total} resultados. Refiná la pregunta para ver un grupo más específico.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

const AssistantMessage = ({ content, result }) => (
  <div className="flex w-full items-start gap-2.5">
    <div className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
      {result ? <Database className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
    </div>
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {result ? "Resultado del sistema" : "Análisis IA"}
        </span>
        <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden="true" />
      </div>
      <div className="overflow-hidden rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-4 shadow-sm">
        {content && <Markdown components={markdownComponents}>{formatAssistantMarkdown(content)}</Markdown>}
        {result && <LocalResult result={result} />}
      </div>
    </div>
  </div>
);

const getErrorMessage = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error || "No pude responder ahora.";
  } catch {
    return "No pude responder ahora.";
  }
};

const AsistenteIA = ({ estructura, estadisticas, padron }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const summary = useMemo(
    () => buildAsistenteResumen(estructura, estadisticas),
    [estructura, estadisticas]
  );

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const openAssistant = () => {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  const sendQuestion = async (text) => {
    const question = text.trim();
    if (!question || loading) return;

    const localResult = resolverConsultaLocal({ question, estructura, padron });
    const userMessage = { role: "user", content: question, localOnly: Boolean(localResult) };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    if (localResult) {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "", result: localResult, localOnly: true },
      ]);
      window.setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          summary,
          history: messages.filter((message) => !message.localOnly && !message.result).slice(-6),
        }),
      });

      if (!response.ok) throw new Error(await getErrorMessage(response));
      const payload = await response.json();
      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.answer || "No pude generar una respuesta." },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: error?.message || "No pude responder ahora." },
      ]);
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendQuestion(input);
  };

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-brand-600 px-4 text-sm font-semibold text-white shadow-xl shadow-brand-900/20 transition-all hover:-translate-y-0.5 hover:bg-brand-700"
        aria-label="Abrir Asistente IA"
      >
        <Sparkles className="w-5 h-5" />
        <span className="hidden sm:inline">Asistente IA</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-[2px] sm:items-stretch sm:justify-end">
          <section
            className="flex h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:my-4 sm:mr-4 sm:h-[calc(100dvh-2rem)] sm:w-[480px] sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-label="Asistente IA administrativo"
          >
            <header className="flex items-center justify-between gap-3 border-b border-brand-800 bg-brand-700 px-5 py-4 text-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold tracking-tight">Asistente IA</h2>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-brand-100">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="truncate">Consultas locales · solo lectura</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-white border-0 bg-transparent"
                aria-label="Cerrar Asistente IA"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/80 p-4 sm:p-5">
              {messages.map((message, index) => (
                message.role === "user" ? (
                  <div
                    key={`${message.role}-${index}`}
                    className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-4 py-3 text-sm leading-relaxed text-white shadow-sm"
                  >
                    {message.content}
                  </div>
                ) : (
                  <AssistantMessage
                    key={`${message.role}-${index}`}
                    content={message.content}
                    result={message.result}
                  />
                )
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="ml-10 inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    Analizando cifras...
                  </div>
                </div>
              )}

              {messages.length === 1 && !loading && (
                <div className="grid gap-2 pl-10 pt-1">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => sendQuestion(suggestion)}
                      className="rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-left text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value.slice(0, 500))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit(event);
                    }
                  }}
                  rows={2}
                  placeholder="Preguntá sobre las cifras actuales..."
                  className="min-h-11 max-h-28 flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || input.trim().length < 3}
                  className="w-11 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white flex items-center justify-center border-0 transition-colors shrink-0"
                  aria-label="Enviar pregunta"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 text-center">
                No consulta personas ni modifica información.
              </p>
            </form>
          </section>
        </div>
      )}
    </>
  );
};

export default AsistenteIA;
