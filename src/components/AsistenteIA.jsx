import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { buildAsistenteResumen } from "../utils/asistenteResumen";

const INITIAL_MESSAGE = {
  role: "assistant",
  content:
    "Hola. Puedo explicar el resumen general, la confirmación y posibles inconsistencias de la estructura. Solo analizo cifras agregadas y no modifico datos.",
};

const SUGGESTIONS = [
  "Dame un resumen general",
  "¿Qué inconsistencias debería revisar?",
  "Explicame el nivel de confirmación",
];

const getErrorMessage = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error || "No pude responder ahora.";
  } catch {
    return "No pude responder ahora.";
  }
};

const AsistenteIA = ({ estructura, estadisticas }) => {
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

    const userMessage = { role: "user", content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          summary,
          history: messages.slice(-6),
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
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 h-12 text-sm font-semibold text-white shadow-lg hover:bg-brand-700 transition-colors border-0"
        aria-label="Abrir Asistente IA"
      >
        <Sparkles className="w-5 h-5" />
        <span className="hidden sm:inline">Asistente IA</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-950/30 flex items-end sm:items-stretch sm:justify-end">
          <section
            className="w-full sm:w-[420px] h-[82vh] sm:h-full bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-none"
            role="dialog"
            aria-modal="true"
            aria-label="Asistente IA administrativo"
          >
            <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-brand-700 text-white rounded-t-2xl sm:rounded-none">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm">Asistente IA</h2>
                  <p className="text-xs text-brand-100 truncate">Solo lectura · datos agregados</p>
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                      message.role === "user"
                        ? "bg-brand-600 text-white rounded-br-md"
                        : "bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm text-slate-500 shadow-sm">
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    Analizando cifras...
                  </div>
                </div>
              )}

              {messages.length === 1 && !loading && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => sendQuestion(suggestion)}
                      className="px-3 py-2 rounded-xl border border-brand-200 bg-white text-brand-700 text-xs font-medium hover:bg-brand-50 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white">
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
                  className="flex-1 min-h-11 max-h-28 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500"
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
