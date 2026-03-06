import { useState, useRef, useCallback, useEffect } from "react";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const callClaude = async (prompt, maxTokens = 80) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20240620", // using standard Claude 3.5 Sonnet identifier
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Anthropic API Error:", res.status, errorBody);
    throw new Error(`Anthropic API Error: ${res.status}`);
  }

  const d = await res.json();
  return d.content[0].text.trim();
};

const countWords = t => t.trim() ? t.trim().split(/\s+/).length : 0;
const countSentences = t => t.trim() ? (t.match(/[^.!?]*[.!?]+/g) || [t]).length : 0;
const countParagraphs = t => t.trim() ? t.split(/\n\s*\n/).filter(p => p.trim()).length || 1 : 0;
const avgSentenceLength = t => { const w = countWords(t), s = countSentences(t); return s ? (w / s).toFixed(1) : 0; };
const avgWordLength = t => { const ws = t.trim().split(/\s+/).filter(Boolean); return ws.length ? (ws.reduce((a, w) => a + w.replace(/[^a-z]/gi, '').length, 0) / ws.length).toFixed(1) : 0; };
const readingTime = t => { const m = countWords(t) / 200; return m < 1 ? `${Math.ceil(m * 60)}s` : `${m.toFixed(1)}m`; };
const fleschScore = t => {
  const w = countWords(t), s = countSentences(t);
  if (!w || !s) return 0;
  const syl = t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).reduce((a, word) => a + Math.max(1, (word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g) || []).length), 0);
  return Math.max(0, Math.min(100, +(206.835 - 1.015 * (w / s) - 84.6 * (syl / w)).toFixed(0)));
};
const readingLevel = score => {
  if (score >= 90) return { label: 'Very Easy', color: '#16a34a' };
  if (score >= 70) return { label: 'Easy', color: '#22c55e' };
  if (score >= 60) return { label: 'Standard', color: '#3b82f6' };
  if (score >= 50) return { label: 'Fairly Hard', color: '#d97706' };
  if (score >= 30) return { label: 'Difficult', color: '#ea580c' };
  return { label: 'Very Hard', color: '#dc2626' };
};

const VERSIONS = [
  { key: 'original_enhanced', label: 'Enhanced', icon: '✦', desc: 'Your voice, lightly polished' },
  { key: 'advanced', label: 'Advanced', icon: '◈', desc: 'Richer vocabulary, still clear' },
  { key: 'professional', label: 'Professional', icon: '⬡', desc: 'Business-ready & concise' },
  { key: 'native_speaker', label: 'Fluent', icon: '◎', desc: 'Natural & idiomatic' },
];

const ACCENT = '#4f46e5';
const ACCENT_LIGHT = '#eef2ff';
const ACCENT_BDR = '#c7d2fe';

export default function App() {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [showSug, setShowSug] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [tone, setTone] = useState(null);
  const [toneLoading, setToneLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('editor');

  const typingT = useRef(null);
  const toneT = useRef(null);
  const aborted = useRef(false);
  const taRef = useRef(null);

  const words = countWords(text);
  const hasText = words >= 4;
  const fk = fleschScore(text);
  const rl = readingLevel(fk);

  const fetchSuggestion = useCallback(async (t) => {
    if (countWords(t) < 4) { setSuggestion(''); setShowSug(false); return; }
    aborted.current = false; setSuggesting(true);
    try {
      const s = await callClaude(`Continue this text with 5–8 clear simple words only. Just the words:\n\n"${t}"`, 40);
      if (!aborted.current) { setSuggestion(s); setShowSug(true); }
    } catch (_) { }
    if (!aborted.current) setSuggesting(false);
  }, []);

  const fetchTone = useCallback(async (t) => {
    if (countWords(t) < 10) { setTone(null); return; }
    setToneLoading(true);
    try {
      const raw = await callClaude(`Respond ONLY with JSON: {"tone":"<one word>","emoji":"<emoji>","clarity":<0-100>}\n\nText: "${t}"`, 80);
      setTone(JSON.parse(raw.replace(/```json|```/g, '')));
    } catch (_) { }
    setToneLoading(false);
  }, []);

  const handleChange = e => {
    const v = e.target.value; setText(v);
    setShowSug(false); setSuggestion(''); aborted.current = true;
    clearTimeout(typingT.current); clearTimeout(toneT.current);
    if (v.trim()) {
      typingT.current = setTimeout(() => fetchSuggestion(v), 900);
      toneT.current = setTimeout(() => fetchTone(v), 1600);
    } else { setTone(null); }
  };

  const acceptSug = () => {
    setText(t => t.trimEnd() + ' ' + suggestion);
    setShowSug(false); setSuggestion(''); taRef.current?.focus();
  };

  const handleKey = e => {
    if (showSug && e.key === 'Tab') { e.preventDefault(); acceptSug(); }
    if (showSug && e.key === 'Escape') setShowSug(false);
  };

  useEffect(() => () => { clearTimeout(typingT.current); clearTimeout(toneT.current); }, []);

  const enhance = async () => {
    if (!text.trim()) return;
    setProcessing(true); setShowSug(false);
    try {
      const raw = await callClaude(`You are an expert writing coach focused on clarity and simplicity. Return ONLY valid JSON:
{
  "versions":{
    "original_enhanced":"light corrections, preserve voice, improve clarity",
    "advanced":"richer vocabulary, still clear and accessible",
    "professional":"business-appropriate, concise and direct",
    "native_speaker":"natural, fluent, idiomatic but easy to read"
  },
  "mistakes_analysis":{
    "grammar_errors":["..."],
    "vocabulary_improvements":["..."],
    "style_issues":["..."],
    "overall_feedback":"..."
  }
}
Text: "${text}"`, 2000);
      setResults(JSON.parse(raw.replace(/```json\s*/, '').replace(/```\s*$/, '')));
      setActiveSection('results'); setActiveTab(0);
    } catch (_) { alert('Error. Please try again.'); }
    setProcessing(false);
  };

  const copyText = t => {
    const el = document.createElement('textarea');
    el.value = t; el.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const clarityPct = tone?.clarity ?? 0;
  const clarityColor = clarityPct >= 70 ? '#16a34a' : clarityPct >= 45 ? '#d97706' : '#dc2626';

  const Stat = ({ label, val, sub }) => (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{label}{sub ? ` (${sub})` : ''}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", background: '#f1f5f9', minHeight: '100vh', color: '#1e293b' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
        .fade { animation: fadeIn .2s ease }
        textarea { font-family: 'Inter', system-ui, sans-serif }
        textarea::-webkit-scrollbar { width: 4px }
        textarea::-webkit-scrollbar-track { background: #f8fafc }
        textarea::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px }
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-track { background: #f1f5f9 }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px }
        .nav-btn:hover { background: #f1f5f9 !important }
        .version-tab:hover { background: #f8fafc !important }
      `}</style>

      {/* Top Bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 54, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: ACCENT, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#fff' }}>✦</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: '-0.3px' }}>WriteAI</span>
          <span style={{ background: ACCENT_LIGHT, color: ACCENT, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.5px', border: `1px solid ${ACCENT_BDR}` }}>PRO</span>
        </div>

        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 9, padding: 3, border: '1px solid #e2e8f0' }}>
          {['Editor', 'Results'].map(s => {
            const k = s.toLowerCase(), active = activeSection === k;
            return (
              <button key={k} className="nav-btn" onClick={() => setActiveSection(k)}
                style={{ background: active ? '#fff' : 'transparent', color: active ? '#0f172a' : '#64748b', border: 'none', padding: '5px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, transition: 'all .15s', boxShadow: active ? '0 1px 3px rgba(0,0,0,.08)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                {s}
                {s === 'Results' && results && <span style={{ background: ACCENT, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>4</span>}
              </button>
            );
          })}
        </div>

        <button onClick={enhance} disabled={!text.trim() || processing}
          style={{ background: processing ? '#6366f1' : ACCENT, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 9, cursor: processing ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, opacity: !text.trim() ? 0.45 : 1, transition: 'all .2s', boxShadow: '0 1px 4px rgba(79,70,229,.3)' }}>
          {processing
            ? <><span style={{ width: 13, height: 13, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Processing…</>
            : <>✦ Enhance</>}
        </button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 54px)' }}>
        {/* Sidebar */}
        <div style={{ width: 252, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ padding: '16px 16px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase' }}>Text Stats</div>
          <div style={{ padding: '0 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {[
              { label: 'Words', val: words },
              { label: 'Sentences', val: hasText ? countSentences(text) : 0 },
              { label: 'Paragraphs', val: hasText ? countParagraphs(text) : 0 },
              { label: 'Read time', val: hasText ? readingTime(text) : '—' },
              { label: 'Avg sent.', val: hasText ? avgSentenceLength(text) : '—', sub: 'wds' },
              { label: 'Avg word', val: hasText ? avgWordLength(text) : '—', sub: 'ch' },
            ].map(s => <Stat key={s.label} {...s} />)}
          </div>

          <div style={{ margin: '10px 12px 0', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>Reading Level</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: hasText ? rl.color : '#cbd5e1' }}>{hasText ? rl.label : '—'}</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Score {hasText ? fk : 0}</span>
            </div>
            <div style={{ height: 5, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: hasText ? `${fk}%` : '0%', background: rl.color, borderRadius: 4, transition: 'width .5s' }} />
            </div>
          </div>

          <div style={{ margin: '10px 12px 0', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>Tone & Clarity</div>
            {toneLoading
              ? <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, border: '1.5px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Analyzing…</span>
              : tone
                ? <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{tone.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{tone.tone}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Clarity</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: clarityColor }}>{clarityPct}/100</span>
                  </div>
                  <div style={{ height: 5, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${clarityPct}%`, background: clarityColor, borderRadius: 4, transition: 'width .5s' }} />
                  </div>
                </>
                : <span style={{ fontSize: 12, color: '#cbd5e1' }}>Type 10+ words…</span>
            }
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8' }}>
            {text.length > 0 ? `${text.length} characters` : 'No content yet'}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeSection === 'editor' && (
            <div className="fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', boxSizing: 'border-box' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Document</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {suggesting && !showSug && (
                      <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, border: '1.5px solid #4f46e5', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        Suggesting…
                      </span>
                    )}
                    {showSug && suggestion && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{suggestion}"</span>
                        <button onClick={acceptSug} style={{ background: ACCENT_LIGHT, border: `1px solid ${ACCENT_BDR}`, color: ACCENT, fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Accept <kbd style={{ background: '#c7d2fe', padding: '0 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 9 }}>Tab</kbd>
                        </button>
                        <button onClick={() => setShowSug(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer', padding: '3px 6px', borderRadius: 5 }}>Esc</button>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ position: 'relative', flex: 1 }}>
                  <textarea ref={taRef} value={text} onChange={handleChange} onKeyDown={handleKey}
                    placeholder="Start writing or paste your text here…"
                    style={{ width: '100%', height: '100%', minHeight: 300, background: 'transparent', border: 'none', outline: 'none', padding: 20, fontSize: 15, lineHeight: 1.85, color: '#1e293b', resize: 'none', boxSizing: 'border-box', position: 'relative', zIndex: 2 }} />
                  {showSug && suggestion && (
                    <div style={{ position: 'absolute', inset: 0, padding: 20, fontSize: 15, lineHeight: 1.85, pointerEvents: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word', zIndex: 1 }}>
                      <span style={{ color: 'transparent' }}>{text}</span>
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}> {suggestion}</span>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={enhance} disabled={!text.trim() || processing}
                  style={{ background: processing ? '#6366f1' : ACCENT, color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 10, cursor: processing ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, opacity: !text.trim() ? 0.4 : 1, transition: 'all .2s', boxShadow: '0 2px 6px rgba(79,70,229,.3)' }}>
                  {processing
                    ? <><span style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Processing…</>
                    : <>✦ Enhance Writing</>}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'results' && (
            <div className="fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!results
                ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 }}>
                  <div style={{ width: 56, height: 56, background: ACCENT_LIGHT, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: `1px solid ${ACCENT_BDR}` }}>✦</div>
                  <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>Run an enhancement to see results here.</p>
                  <button onClick={() => setActiveSection('editor')} style={{ background: '#fff', color: ACCENT, border: `1px solid ${ACCENT_BDR}`, padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>Go to Editor</button>
                </div>
                : <>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                      {VERSIONS.map((v, i) => (
                        <button key={v.key} className="version-tab" onClick={() => setActiveTab(i)}
                          style={{ flex: 1, padding: '12px 4px', background: activeTab === i ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === i ? `2px solid ${ACCENT}` : '2px solid transparent', color: activeTab === i ? '#0f172a' : '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === i ? 700 : 400, transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontSize: 15, color: activeTab === i ? ACCENT : '#94a3b8' }}>{v.icon}</span>
                          <span>{v.label}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ padding: 24 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, fontWeight: 500 }}>{VERSIONS[activeTab].desc}</div>
                      <p style={{ fontSize: 15, lineHeight: 1.85, color: '#1e293b', margin: '0 0 20px', whiteSpace: 'pre-wrap' }}>{results.versions[VERSIONS[activeTab].key]}</p>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => copyText(results.versions[VERSIONS[activeTab].key])}
                          style={{ background: copied ? '#f0fdf4' : ACCENT_LIGHT, border: `1px solid ${copied ? '#86efac' : ACCENT_BDR}`, color: copied ? '#16a34a' : ACCENT, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s' }}>
                          {copied ? '✓ Copied!' : '⎘ Copy'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: ACCENT }}>◈</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Writing Analysis</span>
                    </div>
                    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { title: 'Grammar Errors', items: results.mistakes_analysis.grammar_errors, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                        { title: 'Vocabulary', items: results.mistakes_analysis.vocabulary_improvements, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                        { title: 'Style Issues', items: results.mistakes_analysis.style_issues, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
                        { title: 'Overall Feedback', items: [results.mistakes_analysis.overall_feedback], color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                      ].map(sec => (
                        <div key={sec.title} style={{ background: sec.bg, border: `1px solid ${sec.border}`, borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: sec.color, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>{sec.title}</div>
                          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {sec.items.map((item, i) => (
                              <li key={i} style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, paddingLeft: 12, position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, color: sec.color, fontWeight: 700 }}>·</span>{item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}