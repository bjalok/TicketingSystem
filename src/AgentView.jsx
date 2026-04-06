import React, { useState, useEffect } from 'react';
import {
  Search, Inbox, Bot, Activity, Send, Cpu, GitBranch, Database,
  Zap, BookOpen, UserCheck, Check, Terminal, CheckCircle, User, Layers
} from 'lucide-react';


const ThinkingDots = ({ color = 'blue' }) => (
  <span className="flex gap-0.5 items-center">
    {[0, 150, 300].map(d => (
      <span key={d} className={`w-1 h-1 bg-${color}-400 rounded-full animate-bounce`} style={{ animationDelay: `${d}ms` }} />
    ))}
  </span>
);

const S3_STEPS = [
  'Loading scenario library…',
  'Tokenising incident description…',
  'Matching keyword intent patterns…',
  'Scoring confidence across scenarios…',
];
const S4_STEPS = [
  'Connecting to resolution knowledge base…',
  'Embedding incident context…',
  'Computing similarity scores…',
  'Ranking top historical matches…',
];

const AgentView = ({
  tickets,
  setTickets,
  thinkingTicketId,
  routingTicketId,
  setThinkingTicketId,
  setRoutingTicketId,
  processAIEnrichment,
  matchScenario,
  matchPastResolution,
  scenarioLibrary,
}) => {
  const [agentSelectedTicketId, setAgentSelectedTicketId] = useState(null);
  const [agentActiveTab, setAgentActiveTab] = useState('Overview');
  const [workNote, setWorkNote] = useState('');
  const [agentKBMessages, setAgentKBMessages] = useState([]);
  const [agentKBInput, setAgentKBInput] = useState('');
  const [s3Steps, setS3Steps] = useState([]);
  const [s4Steps, setS4Steps] = useState([]);
  const [s3Done, setS3Done] = useState(false);
  const [s4Done, setS4Done] = useState(false);
  const [s3AnimSolution, setS3AnimSolution] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const allQueueTickets = tickets;
  const filteredQueue = searchQuery.trim()
    ? allQueueTickets.filter(t =>
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allQueueTickets;

  // S3/S4 animation effect
  useEffect(() => {
    const isRouting = routingTicketId === agentSelectedTicketId && agentSelectedTicketId != null;
    if (!isRouting) return;

    setS3Steps([]);
    setS4Steps([]);
    setS3Done(false);
    setS4Done(false);
    setS3AnimSolution(null);

    const ticket = allQueueTickets.find(t => t.id === agentSelectedTicketId);
    const match = ticket ? matchScenario(ticket.description) : null;

    const timers = [];
    S3_STEPS.forEach((step, i) => {
      timers.push(setTimeout(() => setS3Steps(prev => [...prev, step]), i * 2000));
    });
    timers.push(setTimeout(() => setS3AnimSolution(match || 'none'), 6500));
    S4_STEPS.forEach((step, i) => {
      timers.push(setTimeout(() => setS4Steps(prev => [...prev, step]), 7500 + i * 2000));
    });

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingTicketId, agentSelectedTicketId]);

  useEffect(() => {
    if (agentSelectedTicketId != null && routingTicketId == null) {
      setS3Done(true);
      setS4Done(true);
    }
  }, [routingTicketId, agentSelectedTicketId]);

  // Pipeline state helper
  const getPipelineState = (ticketId) => {
    const t = tickets.find(x => x.id === ticketId);
    if (!t) return { enrichment: null, sopMatch: null, historicalMatch: null, escalation: null };
    const comments = t.comments || [];
    const routingComment = comments.find(c => c.routedAfterEnrichment);
    return {
      enrichment: comments.find(c => c.missingFields) || null,
      sopMatch: comments.find(c => c.scenario) || (routingComment?.matchedScenario ? { scenario: routingComment.matchedScenario.scenario, sop: routingComment.matchedScenario.sop } : null),
      historicalMatch: comments.find(c => c.pastResolution) || (routingComment?.matchedPast ? { pastResolution: routingComment.matchedPast } : null),
      escalation: comments.find(c => c.escalation) || null,
    };
  };

  const agentTicket = allQueueTickets.find(t => t.id === agentSelectedTicketId) || null;
  const pipeline = agentTicket ? getPipelineState(agentTicket.id) : null;
  const isThinking = thinkingTicketId === agentSelectedTicketId;
  const agentComments = agentTicket?.comments || [];
  const resolutionComment = agentComments.find(c => (c.scenario || c.pastResolution) && c.awaitingApproval)
    || agentComments.find(c => c.scenario || c.pastResolution)
    || agentComments.find(c => c.routedAfterEnrichment);
  const resolutionIdx = resolutionComment ? agentComments.indexOf(resolutionComment) : -1;
  const sopResolutionText = resolutionComment?.solution
    || (resolutionComment?.matchedScenario ? scenarioLibrary.find(s => s.scenario === resolutionComment.matchedScenario.scenario)?.solution : null);
  const ragResolutionText = resolutionComment?.pastResolution?.steps || resolutionComment?.matchedPast?.steps || null;

  // Handlers
  const handleWorkNote = () => {
    if (!workNote.trim() || !agentSelectedTicketId) return;
    setTickets(prev => prev.map(t => t.id === agentSelectedTicketId
      ? { ...t, comments: [...t.comments, { author: 'Agent (You)', role: 'agent-note', timestamp: new Date().toLocaleTimeString(), text: workNote.trim() }] }
      : t
    ));
    setWorkNote('');
  };

  const handleAgentKBSend = () => {
    const q = agentKBInput.trim();
    if (!q) return;
    setAgentKBMessages(prev => [...prev, { role: 'user', text: q, timestamp: new Date().toLocaleTimeString() }]);
    setAgentKBInput('');
    setTimeout(() => {
      const ticket = allQueueTickets.find(t => t.id === agentSelectedTicketId);
      const desc = ticket?.description || '';
      const match = matchScenario(desc + ' ' + q);
      const past = matchPastResolution(desc + ' ' + q);
      let answer = '';
      if (match) answer += `**SOP Match — ${match.scenario} (${match.sop}):**\n${match.solution}`;
      if (past) { if (answer) answer += '\n\n'; answer += `**Historical Reference — ${past.ticketRef} (${past.similarity} similarity):**\n${past.steps}`; }
      if (!answer) answer = "I couldn't find a specific KB article matching your query. Please check the SOP library or escalate to L3 if the issue persists.";
      setAgentKBMessages(prev => [...prev, { role: 'bot', text: answer, timestamp: new Date().toLocaleTimeString() }]);
    }, 800);
  };

  const handleAgentApply = (ticketId, commentIdx) => {
    const ticket = allQueueTickets.find(t => t.id === ticketId);
    const comment = ticket?.comments[commentIdx];
    const sopText = comment?.solution
      || (comment?.matchedScenario ? scenarioLibrary.find(s => s.scenario === comment.matchedScenario.scenario)?.solution : null)
      || '';
    const ragText = comment?.pastResolution?.steps || comment?.matchedPast?.steps || '';
    const stepsText = sopText && ragText ? `${sopText}\n${ragText}` : sopText || ragText;
    let steps = stepsText.split('\n').filter(line => /^\d+\./.test(line.trim())).map(line => line.replace(/^\d+\.\s*/, '').trim());
    if (steps.length === 0) {
      steps = [
        'Authenticating agent credentials and validating ticket context',
        'Connecting to affected system and verifying current state',
        'Applying recommended configuration changes',
        'Running post-fix validation checks',
        'Logging resolution and updating ticket record',
      ];
    }
    const subStepDefs = {
      0: ['Loading agent credentials', 'Verifying OAuth2 token scope', 'Checking ticket assignment rights'],
      2: ['Snapshotting current config state', 'Writing updated parameters', 'Schema validation — passed'],
      3: ['Service health ping — 200 OK', 'Verifying API response codes', 'Post-change stability confirmed'],
    };
    const SUB_FIRST_DELAY = 380, SUB_INTERVAL = 560, SUB_DONE_OFFSET = 380, STEP_NO_SUB_DONE = 850, NEXT_GAP = 180;
    let cursor = 0;
    const stepTimings = steps.map((_, i) => {
      const subs = subStepDefs[i] || [];
      const start = cursor;
      const done = subs.length > 0 ? start + SUB_FIRST_DELAY + (subs.length - 1) * SUB_INTERVAL + SUB_DONE_OFFSET : start + STEP_NO_SUB_DONE;
      cursor = done + NEXT_GAP;
      return { start, done, subs };
    });
    const mutateTel = (prev, mutate) => prev.map(t => {
      if (t.id !== ticketId) return t;
      return { ...t, comments: t.comments.map((c, idx) => { if (idx !== commentIdx) return c; const tel = c.telemetry ? [...c.telemetry] : []; mutate(tel); return { ...c, telemetry: tel }; }) };
    });
    setTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      return { ...t, comments: t.comments.map((c, i) => i === commentIdx ? { ...c, awaitingApproval: false, telemetry: [], telemetryComplete: false } : c) };
    }));
    steps.forEach((step, i) => {
      const { start, done, subs } = stepTimings[i];
      setTimeout(() => setTickets(prev => mutateTel(prev, tel => { tel[i] = { text: step, status: 'running', subSteps: [] }; })), start);
      subs.forEach((subText, j) => {
        const subStart = start + SUB_FIRST_DELAY + j * SUB_INTERVAL;
        setTimeout(() => setTickets(prev => mutateTel(prev, tel => { if (!tel[i]) return; const ss = [...(tel[i].subSteps || [])]; ss[j] = { text: subText, status: 'running' }; tel[i] = { ...tel[i], subSteps: ss }; })), subStart);
        setTimeout(() => setTickets(prev => mutateTel(prev, tel => { if (!tel[i]) return; const ss = [...(tel[i].subSteps || [])]; if (ss[j]) ss[j] = { ...ss[j], status: 'done' }; tel[i] = { ...tel[i], subSteps: ss }; })), subStart + 300);
      });
      setTimeout(() => setTickets(prev => mutateTel(prev, tel => { if (tel[i]) tel[i] = { ...tel[i], status: 'done' }; })), done);
    });
    const totalTime = stepTimings[steps.length - 1].done + 400;
    setTimeout(() => {
      setTickets(prev => prev.map(t => {
        if (t.id !== ticketId) return t;
        return { ...t, status: 'Resolved', comments: t.comments.map((c, i) => i === commentIdx ? { ...c, telemetryComplete: true } : c) };
      }));
    }, totalTime);
  };

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* Left Sidebar: Ticket Queue */}
      <div className="w-60 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2.5">
            <Inbox className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Queue</span>
            <span className="ml-auto text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">{filteredQueue.length}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tickets..."
              className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-indigo-300"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Inbox className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs italic text-center">No tickets in queue</p>
            </div>
          ) : filteredQueue.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setAgentSelectedTicketId(t.id);
                setAgentActiveTab('Overview');
                // Trigger AI pipeline if ticket hasn't been processed yet
                const hasComments = t.comments && t.comments.length > 0;
                if (!hasComments) {
                  setThinkingTicketId(t.id);
                  setTimeout(() => {
                    setThinkingTicketId(null);
                    processAIEnrichment(t.id, t.description);
                  }, 3000);
                }
              }}
              className={`w-full text-left p-2.5 rounded-lg transition-colors border ${agentSelectedTicketId === t.id ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-indigo-600">{t.id}</span>
                <div className="flex items-center gap-1">
                  {t.hasUpdate && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                  <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-bold border border-blue-100">Open</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">{t.description}</p>
              <p className="text-[10px] text-slate-400 mt-1">{t.createdAt}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      {!agentTicket ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
          <Layers className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-sm font-semibold">Select a ticket from the queue</p>
          <p className="text-xs mt-1 opacity-70">AI agent pipeline · SOP matching · resolution recommendations</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Ticket Title Bar */}
          <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-start gap-4 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-indigo-600">{agentTicket.id}</span>
                <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200 font-bold">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />{agentTicket.status}
                </span>
                <span className="text-[10px] text-slate-400">{agentTicket.createdAt}</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 line-clamp-1">{agentTicket.description}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border-b border-slate-200 px-5 flex gap-1 flex-shrink-0">
            {['Overview', 'Activity', 'Details', 'Playbook'].map(tab => (
              <button
                key={tab}
                onClick={() => setAgentActiveTab(tab)}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${agentActiveTab === tab ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ---- OVERVIEW TAB ---- */}
          {agentActiveTab === 'Overview' && (
            <div className="flex-1 flex overflow-hidden">

              {/* Col 1: Summary */}
              <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto flex-shrink-0">
                <div className="p-4 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Summary</p>
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3 mb-4">{agentTicket.description}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                    <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Number</p><p className="text-xs font-semibold text-indigo-600 mt-0.5">{agentTicket.id}</p></div>
                    <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Priority</p><p className="text-xs font-semibold text-orange-600 mt-0.5">2 – High</p></div>
                    <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Opened</p><p className="text-xs text-slate-600 mt-0.5">{agentTicket.createdAt}</p></div>
                    <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">State</p><p className="text-xs font-semibold text-green-600 mt-0.5">{agentTicket.status}</p></div>
                    <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Impact</p><p className="text-xs text-slate-600 mt-0.5">3 – Low</p></div>
                    <div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Urgency</p><p className="text-xs text-slate-600 mt-0.5">2 – High</p></div>
                  </div>
                </div>
                <div className="p-4 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Caller</p>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">{agentTicket.email[0].toUpperCase()}</div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{agentTicket.email}</p>
                      <p className="text-[10px] text-slate-400">Employee</p>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Assigned To</p>
                  {(() => {
                    const assignee = pipeline?.escalation?.escalation;
                    if (!assignee) return <p className="text-xs text-slate-400 italic">Unassigned</p>;
                    return (
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                          {assignee.agent.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{assignee.agent}</p>
                          <p className="text-[10px] text-slate-500">{assignee.agentTitle}</p>
                          <p className="text-[10px] text-indigo-500 font-medium">{assignee.department}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Col 2: AI Agent Pipeline */}
              <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">AI Agent Pipeline</p>
                <div className="space-y-3 max-w-2xl">

                  {/* S1 Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                        <Cpu className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Agent S1</span>
                            <p className="text-xs font-bold text-slate-800">Context Enrichment</p>
                          </div>
                          {isThinking ? (
                            <span className="flex items-center gap-1.5 text-[10px] text-blue-500 font-medium">Analyzing <ThinkingDots /></span>
                          ) : pipeline?.enrichment && pipeline?.escalation ? (
                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Context Provided</span>
                          ) : pipeline?.enrichment ? (
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">Enrichment Needed</span>
                          ) : (
                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Complete</span>
                          )}
                        </div>
                        {pipeline?.enrichment && !isThinking ? (() => {
                          const enrichmentIdx = agentComments.indexOf(pipeline.enrichment);
                          const reporterReply = agentComments.find((c, i) => c.role === 'user' && i > enrichmentIdx);
                          const enrichmentResolved = !!(pipeline.escalation);
                          return (
                            <div className="mt-2 space-y-2">
                              <div className="p-2.5 bg-orange-50 rounded-lg border border-orange-100">
                                <p className="text-[10px] font-bold text-orange-600 mb-1.5">Missing fields requested from requester:</p>
                                <div className="flex flex-wrap gap-1">
                                  {pipeline.enrichment.missingFields.map((f, i) => (
                                    <span key={i} className={`text-[10px] px-2 py-0.5 rounded-md border font-medium flex items-center gap-1 ${enrichmentResolved ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-orange-700 border-orange-200'}`}>
                                      {enrichmentResolved && <CheckCircle className="w-2.5 h-2.5" />}{f.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {enrichmentResolved && reporterReply && (
                                <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                                  <p className="text-[10px] font-bold text-blue-600 mb-1">Context provided by reporter:</p>
                                  <p className="text-[11px] text-slate-700 leading-relaxed italic">"{reporterReply.text}"</p>
                                </div>
                              )}
                            </div>
                          );
                        })() : !isThinking && (
                          <p className="text-[11px] text-slate-500 mt-0.5">All required context fields present. Ticket routed to resolution agents.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* S3 Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
                        <GitBranch className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-[9px] font-bold text-purple-400 uppercase tracking-wider">Agent S3</span>
                            <p className="text-xs font-bold text-slate-800">Scenario / SOP Mapping</p>
                          </div>
                          {(() => {
                            const isRouting = routingTicketId === agentSelectedTicketId;
                            if (isRouting && s3AnimSolution && s3AnimSolution !== 'none') return <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Match Found</span>;
                            if (isThinking || isRouting) return <span className="flex items-center gap-1.5 text-[10px] text-blue-500 font-medium">Matching <ThinkingDots /></span>;
                            if (pipeline?.sopMatch) return <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Match Found</span>;
                            if (s3Done || pipeline) return <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">No Match</span>;
                            return null;
                          })()}
                        </div>
                        {routingTicketId === agentSelectedTicketId && s3Steps.length > 0 && (
                          <div className="mt-2 space-y-1 font-mono">
                            {s3Steps.map((step, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <span className="text-purple-400">›</span>
                                <span>{step}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {routingTicketId === agentSelectedTicketId && s3AnimSolution && s3AnimSolution !== 'none' && (
                          <div className="mt-2 p-2.5 bg-purple-50 rounded-lg border border-purple-100">
                            <p className="text-[11px] font-bold text-purple-800">{s3AnimSolution.scenario}</p>
                            <p className="text-[10px] text-purple-500 mt-0.5">{s3AnimSolution.sop} · Intent mapped and SOP retrieved</p>
                            <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-purple-100">{s3AnimSolution.solution}</p>
                          </div>
                        )}
                        {!isThinking && routingTicketId !== agentSelectedTicketId && (
                          pipeline?.sopMatch ? (
                            <div className="mt-2 p-2.5 bg-purple-50 rounded-lg border border-purple-100">
                              <div className="mb-1.5 space-y-0.5 font-mono">
                                {S3_STEPS.map((step, i) => (
                                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <Check className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" />
                                    <span>{step}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-1.5 pt-1.5 border-t border-purple-100">
                                <p className="text-[11px] font-bold text-purple-800">{pipeline.sopMatch.scenario}</p>
                                <p className="text-[10px] text-purple-500 mt-0.5">{pipeline.sopMatch.sop} · Intent mapped and SOP retrieved</p>
                                {sopResolutionText && <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-purple-100">{sopResolutionText}</p>}
                              </div>
                            </div>
                          ) : (pipeline || s3Done) ? (
                            <p className="text-[11px] text-slate-500 mt-0.5">No matching scenario found in SOP library. Routing to historical RAG.</p>
                          ) : null
                        )}
                      </div>
                    </div>
                  </div>

                  {/* S4 Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                        <Database className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Agent S4</span>
                            <p className="text-xs font-bold text-slate-800">Resolution Recommendation Engine</p>
                          </div>
                          {(() => {
                            const isRouting = routingTicketId === agentSelectedTicketId;
                            if (isThinking || isRouting) return <span className="flex items-center gap-1.5 text-[10px] text-blue-500 font-medium">Searching <ThinkingDots /></span>;
                            if (pipeline?.historicalMatch) return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Match Found</span>;
                            if (s4Done || pipeline) return <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">No Match</span>;
                            return null;
                          })()}
                        </div>
                        {routingTicketId === agentSelectedTicketId && s4Steps.length > 0 && (
                          <div className="mt-2 space-y-1 font-mono">
                            {s4Steps.map((step, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <span className="text-amber-400">›</span>
                                <span>{step}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {!isThinking && routingTicketId !== agentSelectedTicketId && (
                          pipeline?.historicalMatch ? (
                            <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                              {s4Done && (
                                <div className="mb-1.5 space-y-0.5 font-mono">
                                  {S4_STEPS.map((step, i) => (
                                    <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                      <Check className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                                      <span>{step}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="mt-1.5 pt-1.5 border-t border-amber-100">
                                <p className="text-[11px] font-bold text-amber-800">{pipeline.historicalMatch.pastResolution.ticketRef}</p>
                                <p className="text-[10px] text-amber-600 mt-0.5">Resolved {pipeline.historicalMatch.pastResolution.resolvedOn} · {pipeline.historicalMatch.pastResolution.similarity} similarity</p>
                                {ragResolutionText && <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-2 pt-2 border-t border-amber-100">{ragResolutionText}</p>}
                              </div>
                            </div>
                          ) : (pipeline || s4Done) ? (
                            <p className="text-[11px] text-slate-500 mt-0.5">No similar resolved tickets found in knowledge base.</p>
                          ) : null
                        )}
                      </div>
                    </div>
                  </div>

                  {/* S5 Card */}
                  {resolutionComment && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center flex-shrink-0">
                          <Zap className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="mb-2">
                            <span className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Agent S5</span>
                            <p className="text-xs font-bold text-slate-800">Autonomous Execution</p>
                          </div>
                          {resolutionComment.telemetry && resolutionComment.telemetry.length > 0 ? (
                            <div className="mt-3">
                              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                                <Terminal className="w-3 h-3 text-slate-400" />
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Execution Trace</span>
                                {!resolutionComment.telemetryComplete && (
                                  <span className="ml-auto flex items-center gap-1 text-[9px] text-red-400 font-semibold animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Running
                                  </span>
                                )}
                                {resolutionComment.telemetryComplete && (
                                  <span className="ml-auto flex items-center gap-1 text-[9px] text-green-500 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Complete
                                  </span>
                                )}
                              </div>
                              <div className="relative">
                                {resolutionComment.telemetry.map((step, i) => (
                                  <div key={i} className="flex items-start gap-3 mb-1">
                                    <div className="relative flex flex-col items-center flex-shrink-0">
                                      <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${step.status === 'done' ? 'bg-green-500 border-green-500' : step.status === 'running' ? 'bg-red-500 border-red-400 animate-pulse' : 'bg-white border-slate-300'}`}>
                                        {step.status === 'done' && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                      </div>
                                      {i < resolutionComment.telemetry.length - 1 && <div className="w-px flex-1 min-h-[12px] bg-slate-200 mt-0.5" />}
                                    </div>
                                    <div className="flex-1 pb-3">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[11px] font-medium leading-snug transition-colors duration-200 ${step.status === 'done' ? 'text-slate-700' : step.status === 'running' ? 'text-red-600' : 'text-slate-400'}`}>{step.text}</span>
                                        {step.status === 'running' && <span className="text-[8px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100 font-bold uppercase tracking-wider animate-pulse">Processing</span>}
                                        {step.status === 'done' && <span className="text-[8px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100 font-bold uppercase tracking-wider">Done</span>}
                                      </div>
                                      {step.subSteps && step.subSteps.length > 0 && (
                                        <div className="mt-2 relative pl-4">
                                          <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-100" />
                                          {step.subSteps.map((sub, j) => (
                                            <div key={j} className="flex items-center gap-2 mb-1.5">
                                              <div className={`w-2 h-2 rounded-full flex-shrink-0 border transition-all duration-200 ${sub.status === 'done' ? 'bg-green-400 border-green-400' : 'bg-red-300 border-red-300 animate-pulse'}`} />
                                              <span className={`text-[10px] leading-snug transition-colors duration-200 ${sub.status === 'done' ? 'text-slate-500' : 'text-red-400'}`}>{sub.text}</span>
                                              {sub.status === 'done' && <Check className="w-2.5 h-2.5 text-green-400 flex-shrink-0" strokeWidth={3} />}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {resolutionComment.telemetryComplete && (
                                  <div className="flex items-center gap-3 pt-1">
                                    <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-500 flex items-center justify-center flex-shrink-0">
                                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                    </div>
                                    <span className="text-xs font-bold text-green-600">All steps executed — Resolution completed.</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (resolutionComment.routedAfterEnrichment || resolutionComment.awaitingApproval) ? (
                            <div>
                              <p className="text-[11px] font-semibold text-slate-600 mb-2">Apply this resolution to close the ticket?</p>
                              <button onClick={() => handleAgentApply(agentTicket.id, resolutionIdx)} className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Apply Fix</button>
                            </div>
                          ) : resolutionComment.applying ? (
                            <span className="text-xs font-semibold text-blue-500 flex items-center gap-1.5">Applying fix <ThinkingDots /></span>
                          ) : resolutionComment.approved ? (
                            <span className="text-xs font-bold text-green-600 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Fix applied — resolution steps executed successfully.</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Col 3: Record Info + Support Navigator */}
              <div className="w-72 border-l border-slate-200 bg-white overflow-y-auto flex-shrink-0">
                <div className="p-4 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">SLAs &amp; Timings</p>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Response SLA</span>
                      <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">Completed</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Resolution SLA</span>
                      <span className="text-[10px] text-slate-400">No matching SLA</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 mt-1">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Opened</p>
                      <p className="text-xs font-semibold text-slate-700">{agentTicket.createdAt}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 bg-indigo-500 rounded flex items-center justify-center flex-shrink-0">
                      <Zap className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Support Navigator</p>
                    <span className="text-[9px] text-slate-400 ml-auto">Answers generated by AI</span>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-3 mb-3 border border-indigo-100">
                    <p className="text-xs font-semibold text-indigo-900 mb-1">Hi Agent! 👋</p>
                    <p className="text-[11px] text-indigo-700 leading-relaxed">I've analyzed this ticket through the AI pipeline. Here's what I found:</p>
                  </div>
                  <div className="space-y-2.5 mb-4">
                    <div className="flex gap-2 items-start">
                      <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5"><Cpu className="w-2.5 h-2.5 text-blue-600" /></div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {pipeline?.enrichment ? `Enrichment triggered — requester asked for ${pipeline.enrichment.missingFields.length} missing field(s).` : 'Ticket had complete context — no enrichment needed.'}
                      </p>
                    </div>
                    <div className="flex gap-2 items-start">
                      <div className="w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5"><GitBranch className="w-2.5 h-2.5 text-purple-600" /></div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {pipeline?.sopMatch ? `Scenario: "${pipeline.sopMatch.scenario}" via ${pipeline.sopMatch.sop}.` : 'No matching SOP scenario found.'}
                      </p>
                    </div>
                    <div className="flex gap-2 items-start">
                      <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5"><Database className="w-2.5 h-2.5 text-amber-600" /></div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {pipeline?.historicalMatch ? `Past match: ${pipeline.historicalMatch.pastResolution.ticketRef} (${pipeline.historicalMatch.pastResolution.similarity}).` : 'No historical match found.'}
                      </p>
                    </div>
                    {pipeline?.escalation && (
                      <div className="flex gap-2 items-start">
                        <div className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5"><UserCheck className="w-2.5 h-2.5 text-orange-600" /></div>
                        <p className="text-[11px] text-slate-600 leading-snug">Escalated to {pipeline.escalation.escalation.agent} ({pipeline.escalation.escalation.department}).</p>
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ask Knowledge Base</p>
                    {agentKBMessages.length > 0 && (
                      <div className="mb-2 space-y-2 max-h-52 overflow-y-auto">
                        {agentKBMessages.map((m, i) => (
                          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
                              {m.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      <textarea
                        value={agentKBInput}
                        onChange={e => setAgentKBInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAgentKBSend())}
                        rows={2}
                        placeholder="Ask about SOP, past tickets…"
                        className="flex-1 px-3 py-2 text-[11px] border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 placeholder-slate-400"
                      />
                      <button onClick={handleAgentKBSend} className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex-shrink-0">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ---- ACTIVITY TAB ---- */}
          {agentActiveTab === 'Activity' && (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                <div className="p-4 border-b border-slate-100 flex-shrink-0">
                  <div className="flex items-center gap-4 mb-3">
                    <button className="text-xs font-bold text-indigo-600 border-b-2 border-indigo-600 pb-1">Work notes</button>
                    <button className="text-xs text-slate-400 hover:text-slate-600 pb-1">Additional comments (Customer visible)</button>
                  </div>
                  <textarea
                    value={workNote}
                    onChange={(e) => setWorkNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleWorkNote())}
                    rows={3}
                    placeholder="Enter your work notes here"
                    className="w-full px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button onClick={handleWorkNote} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5">
                      <Send className="w-3 h-3" /> Post Work Note
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Activity</span>
                  </div>
                  <div className="space-y-3 max-w-3xl">
                    {agentComments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-8">No activity yet on this ticket</p>
                    ) : agentComments.map((comment, idx) => (
                      <div key={idx} className={`flex gap-3 ${comment.role === 'user' ? 'justify-end' : ''}`}>
                        {comment.role !== 'user' && (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${comment.role === 'agent-note' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                            {comment.role === 'agent-note' ? 'A' : <Bot className="w-4 h-4" />}
                          </div>
                        )}
                        <div className={`max-w-xl rounded-xl p-3 ${comment.role === 'user' ? 'bg-slate-100' : comment.role === 'agent-note' ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-100'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-bold text-slate-700">{comment.author}</span>
                            {comment.role === 'agent-note' && <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold border border-amber-200">Work Note</span>}
                            <span className="text-[10px] text-slate-400 ml-auto">{comment.timestamp}</span>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {comment.text
                              || comment.solution
                              || (comment.missingFields && `Missing fields requested: ${comment.missingFields.map(f => f.label).join(', ')}`)
                              || (comment.pastResolution && `Historical match found: ${comment.pastResolution.ticketRef} (${comment.pastResolution.similarity} similarity)`)
                              || (comment.escalation && `Escalated to ${comment.escalation.agent} — ${comment.escalation.department}`)
                              || ''}
                          </p>
                        </div>
                        {comment.role === 'user' && (
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-slate-500" /></div>
                        )}
                      </div>
                    ))}
                    {isThinking && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-blue-600" /></div>
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-1.5">
                          <span className="text-xs text-slate-500 italic">Thinking</span>
                          <ThinkingDots />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---- DETAILS / PLAYBOOK TABS ---- */}
          {(agentActiveTab === 'Details' || agentActiveTab === 'Playbook') && (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400">
              <div className="text-center">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">{agentActiveTab}</p>
                <p className="text-xs mt-1 opacity-60">Coming soon</p>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default AgentView;
