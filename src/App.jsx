import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Clock, AlertCircle, ChevronRight, User,
  FileText, Bot, Filter, CheckCircle, Bell, Inbox,
  Send, Cpu, GitBranch, Database, Activity, Zap, Layers,
  BookOpen, UserCheck, Check, Terminal
} from 'lucide-react';
import AgentView from './AgentView';

// ========== S3: Scenario / Intent Mapping ==========
const scenarioLibrary = [
  {
    keywords: /(salesforce.*api|api.*salesforce|salesforce.*integration|integration.*failing|api.*failing.*intermittent|intermittent.*api|salesforce.*fail)/i,
    scenario: "Salesforce API Integration Failure",
    sop: "SOP #62",
    solution: "This matches a known Salesforce API integration issue. Based on SOP #62 — API Integration Failure:\n\n**Recommended Resolution Steps:**\n1. Check Salesforce API limits under Setup → System Overview → API Usage.\n2. Review the integration tool logs for HTTP status codes (429 = rate limit, 401 = auth, 500 = server error).\n3. If hitting API limits, implement request batching or increase API limit allocation.\n4. Re-authenticate the connected app OAuth token if seeing 401 errors.\n5. Check Salesforce Trust Status page for any active platform incidents.\n\n**Root Cause (likely):** API rate limit exhaustion or OAuth token expiry causing intermittent failures."
  },
  {
    keywords: /(snowflake.*lock|locked.*snowflake|snowflake.*account.*lock|unable.*log.*snowflake|snowflake.*login|snowflake.*sign.?in|snowflake.*failed.*login|snowflake.*multiple.*failed)/i,
    scenario: "Snowflake Account Lockout",
    sop: "SOP #58",
    solution: "This matches a known Snowflake account lockout issue. Based on SOP #58 — Account Lockout & Login Failure:\n\n**Recommended Resolution Steps:**\n1. A Snowflake admin can unlock the account via: `ALTER USER <username> SET MINS_TO_UNLOCK=0;`\n2. Reset the password: `ALTER USER <username> RESET PASSWORD;`\n3. If using SSO/SAML, verify the IdP session is valid and the user's role is active.\n4. Check login history: `SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.LOGIN_HISTORY WHERE USER_NAME = '<username>' ORDER BY EVENT_TIMESTAMP DESC LIMIT 20;`\n5. Review IP whitelist/network policy if lockout is caused by an unknown IP.\n\n**Root Cause (likely):** Multiple failed login attempts triggering Snowflake's account lockout policy."
  },
  {
    keywords: /(snowflake|warehouse.*queue|query.*queue|queries.*queue|queries.*slow|snowflake.*slow|snowflake.*taking too long|queued.*long|long.*queue)/i,
    scenario: "Snowflake Query Performance",
    sop: "SOP #55",
    solution: "This matches a known Snowflake warehouse performance issue. Based on SOP #55 — Snowflake Query Queuing:\n\n**Recommended Resolution Steps:**\n1. Check the warehouse utilisation in Snowflake → Admin → Warehouses and look for queue depth.\n2. If the warehouse is at max concurrency, consider scaling up the warehouse size temporarily.\n3. Enable auto-scaling (multi-cluster) on the warehouse if not already active.\n4. Review the QUERY_HISTORY view for long-running queries blocking the queue.\n5. Kill blocking queries via: `SELECT SYSTEM$CANCEL_QUERY('<query_id>');`\n\n**Root Cause (likely):** Warehouse size under-provisioned for current workload, or a long-running query holding concurrency slots."
  },
  {
    keywords: /(dashboard not loading|not loading|dashboard.*blank|app.*not loading|page.*not loading|keeps loading|does not display|won't load|fails to load|blank (page|screen)|spinning|stuck on load)/i,
    scenario: "Dashboard / App Not Loading",
    sop: "SOP #33",
    solution: "This matches a known application loading issue. Based on SOP #33 — App Load Failure:\n\n**Recommended Resolution Steps:**\n1. Force-refresh the page (Ctrl+Shift+R) and clear browser cache.\n2. Try accessing in an Incognito window to rule out extension conflicts.\n3. Check the System Status page for any active incidents.\n4. Go to Settings → Data Sources and re-authenticate the connected data source.\n5. If the issue persists, contact the Backend/App Support team.\n\n**Root Cause (likely):** Stale cache or data source token expiry causing silent load failures."
  },
  {
    keywords: /(session expired|cannot login|not able to login|login failed|authentication failed)/i,
    scenario: "User Authentication Failure",
    sop: "SOP #12",
    solution: "This matches a known authentication issue. Based on SOP #12 — Session Management:\n\n**Recommended Resolution Steps:**\n1. Clear browser cookies and cache, then retry login.\n2. If using SSO, ensure your session token hasn't expired company-wide (check with IT).\n3. Try logging in via Incognito/Private window to rule out extension conflicts.\n4. If the issue persists, reset your session via the Admin Portal → User Management → Force Re-auth.\n\n**Root Cause (likely):** Stale session cookie conflict after a recent platform deployment."
  },
  {
    keywords: /(access denied|permission|not authorized|forbidden|403)/i,
    scenario: "Permission / Access Denied",
    sop: "SOP #27",
    solution: "This matches a known access control issue. Based on SOP #27 — Role & Permission Management:\n\n**Recommended Resolution Steps:**\n1. Verify your assigned role in Admin Portal → Users → Roles.\n2. If your role was recently changed, a cache flush may be required.\n3. Contact your team admin to re-assign the correct permission set.\n4. If urgent, a temporary elevated access can be granted via the IT Service Desk.\n\n**Root Cause (likely):** Role change not propagated to active session cache."
  },
  {
    keywords: /(slow|performance degradation|page (is )?slow|app (is )?slow|timed? ?out|not responding|lagging|high latency)/i,
    scenario: "Performance Degradation",
    sop: "SOP #41",
    solution: "This matches a known performance issue. Based on SOP #41 — Platform Performance SOP:\n\n**Recommended Resolution Steps:**\n1. Check the System Status page for any active incidents.\n2. Clear local browser cache (Ctrl+Shift+Del).\n3. Try a different network (switch from VPN to direct if possible).\n4. If on mobile, force-close and reopen the app.\n\n**Root Cause (likely):** Elevated server load or CDN latency spike."
  },
  {
    keywords: /(email|notification|alert|not receiving|not getting|inbox|no email)/i,
    scenario: "Notification / Email Delivery Failure",
    sop: "SOP #18",
    solution: "This matches a known notification delivery issue. Based on SOP #18 — Alert & Email Delivery SOP:\n\n**Recommended Resolution Steps:**\n1. Verify the user's notification preferences are enabled under Profile → Notification Settings.\n2. Check if the sending domain (noreply@company.com) is whitelisted in the user's email client.\n3. Trigger a test notification from Admin → Users → Send Test Alert to confirm delivery.\n4. If delivery fails, flush the notification queue via Admin → System → Notification Queue → Retry Failed.\n5. Escalate to the Messaging Infrastructure team if retries fail after 2 attempts.\n\n**Root Cause (likely):** Notification preference reset after platform upgrade or email provider spam filter blocking."
  }
];
const matchScenario = (text) => { for (const s of scenarioLibrary) { if (s.keywords.test(text)) return s; } return null; };

// ========== S4: Historical Resolution Library (RAG) ==========
const pastResolutions = [
  {
    keywords: /(email|notification|alert|not receiving|not getting|inbox|no email)/i,
    ticketRef: "TKT-2024-0512", resolvedOn: "3 Mar 2025", similarity: "89%",
    steps: "1. Check your spam/junk folder and whitelist noreply@company.com.\n2. Go to Profile → Notification Preferences and re-enable email alerts.\n3. Verify your registered email address is correct under Account Settings.\n4. Ask your admin to trigger a test notification from Admin → Users → Send Test Alert.\n\nRoot Cause (from past ticket): User's notification preference was reset after a platform upgrade."
  },
  {
    keywords: /(dashboard|report|chart|widget|data not (loading|showing)|blank (page|screen))/i,
    ticketRef: "TKT-2024-0391", resolvedOn: "14 Feb 2025", similarity: "94%",
    steps: "1. Force-refresh the dashboard (Ctrl+Shift+R).\n2. Go to Settings → Data Sources and re-authenticate the connected data source.\n3. Clear the widget cache via Admin → Cache Management → Flush Dashboard Cache.\n4. If the issue persists, re-publish the report from the source system.\n\nRoot Cause (from past ticket): Stale OAuth token for the data source connector caused fetch failures silently."
  },
  {
    keywords: /(export|download|pdf|csv|file not (downloading|generating)|stuck on export)/i,
    ticketRef: "TKT-2024-0478", resolvedOn: "21 Mar 2025", similarity: "91%",
    steps: "1. Try exporting from a different browser (Chrome recommended).\n2. Disable any download-blocking browser extensions.\n3. Check if the file size exceeds the 50MB export limit — if so, apply filters to reduce data.\n4. Clear browser cache and retry.\n\nRoot Cause (from past ticket): Browser extension blocking blob URL downloads silently."
  }
];
const matchPastResolution = (text) => { for (const r of pastResolutions) { if (r.keywords.test(text)) return r; } return null; };

// ========== Escalation Routing ==========
const escalationRoutes = {
  "Salesforce API Integration Failure": { department: "Integration & API Support", agent: "Kavya Reddy", agentTitle: "Integration Engineer", eta: "2 hours" },
  "Snowflake Account Lockout": { department: "Identity & Access Management", agent: "Raj Mehta", agentTitle: "IAM Engineer", eta: "1 hour" },
  "Snowflake Query Performance": { department: "Data Platform Engineering", agent: "Vikram Sethi", agentTitle: "Data Engineer", eta: "1 hour" },
  "Dashboard / App Not Loading": { department: "Backend / Application Support", agent: "Neha Singh", agentTitle: "App Support Engineer", eta: "2 hours" },
  "User Authentication Failure": { department: "Identity & Access Management", agent: "Raj Mehta", agentTitle: "IAM Engineer", eta: "2 hours" },
  "Permission / Access Denied": { department: "Identity & Access Management", agent: "Priya Sharma", agentTitle: "Access Control Specialist", eta: "2 hours" },
  "Performance Degradation": { department: "Platform Engineering", agent: "Arjun Nair", agentTitle: "SRE Engineer", eta: "4 hours" }
};
const defaultEscalation = { department: "L2 Support", agent: "Amit Verma", agentTitle: "Senior Support Engineer", eta: "4 hours" };

// ========== S1: Ticket Context Enrichment ==========

// Extract the primary subject from the description (e.g. "PLX Dashboard", "VPN", "Outlook")
const extractSubject = (description) => {
  // Match a capitalised product/tool name (1-4 words) followed by a problem verb
  const match = description.match(/(?:^|(?:my|the|on)\s+)([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})(?=\s+(?:is|are|not|can'?t|cannot|won'?t|doesn'?t|stopped|fails|failed|showing|loading|working|opening|launching|connecting|crashing|giving|throwing|returning|unavailable|broken|down))/);
  if (match) return match[1].trim();
  // Fallback: consecutive capitalised words at the start
  const cap = description.match(/^([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)*)/);
  if (cap) return cap[1].trim();
  return 'the system';
};

const generateContextualFields = (description, missingFields) => {
  const subject = extractSubject(description);
  const lowercaseDesc = description.toLowerCase();

  // Detect issue type for more specific phrasing
  const isLoading = /not loading|won't load|fails to load|blank|spinning|hangs|timeout/i.test(lowercaseDesc);
  const isLogin = /login|sign.?in|password|credentials|authentication|access denied/i.test(lowercaseDesc);
  const isPerf = /slow|performance|lag|latency|response time/i.test(lowercaseDesc);

  const snowflakeLockFieldMap = {
    "SFLOCK_Browser": { label: "Browser & Environment",  hint: "Which browser (Chrome/Edge/Firefox) and OS are you using to access Snowflake? Are you on the web UI or SnowSQL CLI?" },
    "SFLOCK_Steps":   { label: "Steps to Reproduce",     hint: "Walk us through exactly what happened — what URL/method you used to log in and at what step the lockout error appeared." },
    "SFLOCK_Impact":  { label: "Impact",                  hint: "Is this affecting only your account, or are other team members also locked out? Is any critical pipeline or workflow blocked?" },
  };

  const salesforceFieldMap = {
    "SFDC_ErrorCode":        { label: "Error message or status codes?",  hint: "What error message or HTTP status code is the integration returning? (e.g., 429 Too Many Requests, 401 Unauthorized, 500 Server Error)" },
    "SFDC_IntegrationTool":  { label: "Which integration tool?",         hint: "What tool or middleware is used for the integration? (e.g., MuleSoft, Boomi, Zapier, custom REST client)" },
    "SFDC_APILimits":        { label: "API limits usage?",               hint: "Are you seeing API limit warnings in Salesforce? (Setup → System Overview → API Usage). What is the current daily API call count vs limit?" },
    "SFDC_Impact":           { label: "Impact?",                         hint: "What process or data sync is being blocked? Is this affecting a critical business pipeline or SLA?" },
  };

  const snowflakeFieldMap = {
    "SF_Warehouse":      { label: "Which warehouse is being used?",             hint: "Please share the Snowflake warehouse name (e.g., COMPUTE_WH, ETL_WH)." },
    "SF_QueueStatus":    { label: "Are queries queued or running immediately?",  hint: "Do queries sit in QUEUED state before starting, or do they start immediately but run slow?" },
    "SF_WarehouseSize":  { label: "Warehouse size and auto-scaling config?",     hint: "What is the current warehouse size (e.g., Medium, Large) and is multi-cluster auto-scaling enabled?" },
    "SF_WorkloadChange": { label: "Any recent increase in workload?",            hint: "Has there been a spike in users, new pipelines, or scheduled jobs added recently?" },
    "SF_BusinessImpact": { label: "Business impact?",                           hint: "Is this blocking a report, SLA, or a business-critical pipeline? What is the deadline?" },
  };

  const fieldMap = {
    "Platform/System name": () => {
      if (isLoading) return { label: `Browser & Environment`, hint: `Which browser (Chrome/Edge/Firefox) and environment (prod/staging) are you using to access ${subject}?` };
      if (isLogin) return { label: `Login Method & Device`, hint: `What device and login method (SSO/password) are you using to access ${subject}?` };
      return { label: `Platform / Environment`, hint: `Which browser, OS, or environment (prod/staging/dev) are you using when you encounter this with ${subject}?` };
    },
    "Specific error codes or behavior": () => {
      if (isLoading) return { label: `What exactly happens?`, hint: `Does ${subject} show a blank page, spinner, or a specific error message? Please share any error text or screenshot.` };
      if (isLogin) return { label: `Error at login`, hint: `What error message appears when you try to sign in to ${subject}? (e.g. "Invalid credentials", HTTP 401, etc.)` };
      if (isPerf) return { label: `Performance symptoms`, hint: `How slow is ${subject}? Does it time out or just feel delayed? Any error codes in the browser console?` };
      return { label: `Error message or behavior`, hint: `What exact error message or unexpected behavior does ${subject} show? Include any error codes if visible.` };
    },
    "Steps to reproduce the issue": () => {
      if (isLoading) return { label: `Steps to reproduce`, hint: `Walk us through exactly what you do to open ${subject} — URL you visit, any filters/pages you navigate to before it stops loading.` };
      if (isLogin) return { label: `Steps to reproduce`, hint: `Describe what you do step by step when trying to log into ${subject} — what page, what you enter, and where it fails.` };
      return { label: `Steps to reproduce`, hint: `What were you doing in ${subject} when this happened? List the exact steps so we can reproduce it.` };
    },
    "Scope of impact (User vs Team)": () => ({
      label: `Who is affected?`,
      hint: `Is ${subject} unavailable only for you, or are other colleagues on your team also impacted? Approximately how many users?`
    }),
  };

  return missingFields.map(f => {
    if (snowflakeLockFieldMap[f]) return { key: f, ...snowflakeLockFieldMap[f] };
    if (salesforceFieldMap[f]) return { key: f, ...salesforceFieldMap[f] };
    if (snowflakeFieldMap[f]) return { key: f, ...snowflakeFieldMap[f] };
    const generator = fieldMap[f];
    return generator ? { key: f, ...generator() } : { key: f, label: f, hint: '' };
  });
};

const analyzeTicketDescription = (description) => {
  const lowercaseDesc = description.toLowerCase();

  // Salesforce API-specific enrichment path
  if (/salesforce.*api|api.*salesforce|salesforce.*integration|integration.*failing|api.*failing|intermittent.*api/i.test(lowercaseDesc)) {
    const missing = [];
    if (!/status code|http\s*\d{3}|4\d\d|5\d\d|exception|error message|error code/i.test(lowercaseDesc)) missing.push("SFDC_ErrorCode");
    if (!/mulesoft|zapier|boomi|informatica|workato|integration tool|middleware|connector|custom code|rest|soap/i.test(lowercaseDesc)) missing.push("SFDC_IntegrationTool");
    if (!/api limit|rate limit|daily limit|limit usage|api call/i.test(lowercaseDesc)) missing.push("SFDC_APILimits");
    if (!/impact|blocking|business|pipeline|sync|data|sla|critical|urgent/i.test(lowercaseDesc)) missing.push("SFDC_Impact");
    return { isComplete: missing.length === 0, missingFields: missing, confidence: 100 - (missing.length * 25) };
  }

  // Snowflake Account Lockout enrichment path (must come before general Snowflake)
  if (/snowflake.*lock|locked.*snowflake|snowflake.*account.*lock|unable.*log.*snowflake|snowflake.*login|snowflake.*sign.?in|snowflake.*failed.*login|snowflake.*multiple.*failed/i.test(lowercaseDesc)) {
    const missing = [];
    if (!/chrome|firefox|edge|safari|using.*browser|on.*browser|environment.*prod|environment.*staging|mac os|windows 1/i.test(lowercaseDesc)) missing.push("SFLOCK_Browser");
    if (!/step \d|when i (click|open|go|navigate|try|press|submit|enter|select)|following steps|to reproduce|i first|i then/i.test(lowercaseDesc)) missing.push("SFLOCK_Steps");
    if (!/only (me|my account)|just (me|my)|whole team|all users|affecting (all|everyone|team)|other (users|members)|(\d+) (users|people)|i('m| am) the only/i.test(lowercaseDesc)) missing.push("SFLOCK_Impact");
    return { isComplete: missing.length === 0, missingFields: missing, confidence: 100 - (missing.length * 33) };
  }

  // Snowflake query performance enrichment path
  if (/snowflake|warehouse.*queue|queries.*queue|queries.*slow|queued.*long/i.test(lowercaseDesc)) {
    const missing = [];
    if (!/chrome|firefox|edge|safari|using.*browser|on.*browser|environment.*prod|environment.*staging|snowsql|cli/i.test(lowercaseDesc)) missing.push("SFLOCK_Browser");
    if (!/step \d|when i (click|open|go|navigate|try|press|submit|enter|select|run|execute)|following steps|to reproduce/i.test(lowercaseDesc)) missing.push("SFLOCK_Steps");
    if (!/only (me|my account)|just (me|my)|whole team|all users|affecting (all|everyone|team)|other (users|members)|(\d+) (users|people)|i('m| am) the only/i.test(lowercaseDesc)) missing.push("SFLOCK_Impact");
    return { isComplete: missing.length === 0, missingFields: missing, confidence: 100 - (missing.length * 33) };
  }

  const hasPlatform = /(windows|mac os|linux|ios|android|chrome|firefox|safari|salesforce|jira|slack|zoom|outlook|teams app|azure|aws|gcp|production|staging|dev environment|sandbox)/i.test(lowercaseDesc);
  const hasErrorDetails = /(error\s*(code|message|#|:)|err[-_]\d+|exception|stack trace|http\s*\d{3}|400|401|403|404|500|502|503|timed? ?out|null pointer|undefined|cannot connect|access denied|permission denied|invalid credentials|login failed|authentication failed|session expired|redirects? (back|to login)|shows? (an? )?error|blank page|not loading|spinning)/i.test(lowercaseDesc);
  const hasSteps = /(when i (click|open|go|navigate|try|attempt|press|submit|enter|select)|step\s*\d|tried to|i clicked|i pressed|i opened|i navigated|i submitted|following steps|to reproduce)/i.test(lowercaseDesc);
  const hasImpact = /(only (me|i am|my account)|just (me|my)|everyone (is|in)|whole team|all users|multiple users|affecting (all|everyone|team|users)|other (users|people)|blocking (me|us|team|everyone)|(\d+) (users|people|employees)|i('m| am) the only)/i.test(lowercaseDesc);
  const missing = [];
  if (!hasPlatform) missing.push("Platform/System name");
  if (!hasErrorDetails) missing.push("Specific error codes or behavior");
  if (!hasSteps) missing.push("Steps to reproduce the issue");
  if (!hasImpact) missing.push("Scope of impact (User vs Team)");
  return { isComplete: missing.length === 0, missingFields: missing, confidence: 100 - (missing.length * 25) };
};

const ThinkingDots = ({ color = 'blue' }) => (
  <span className="flex gap-0.5 items-center">
    {[0, 150, 300].map(d => (
      <span key={d} className={`w-1 h-1 bg-${color}-400 rounded-full animate-bounce`} style={{ animationDelay: `${d}ms` }} />
    ))}
  </span>
);

// ============================================================
//  APP COMPONENT
// ============================================================
const App = () => {
  // ---- Shared State ----
  const [tickets, setTickets] = useState([]);
  const [thinkingTicketId, setThinkingTicketId] = useState(null); // S1 — Context Enrichment
  const [routingTicketId, setRoutingTicketId] = useState(null);  // S2 — Intelligent Routing
  const [userRole, setUserRole] = useState('reporter'); // 'reporter' | 'agent'

  // ---- Reporter State ----
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [view, setView] = useState('list');
  const [replyText, setReplyText] = useState('');
  const [form, setForm] = useState({
    email: 'Shubham Gupta',
    description: '',
    category: 'Software',
    subcategory: 'Application',
    impact: '2 - Medium',
    urgency: '2 - Medium',
    contactType: 'Self-service',
    assignmentGroup: 'IT Service Desk',
  });
  const [submittedTicket, setSubmittedTicket] = useState(null);
  const [incidentFinalized, setIncidentFinalized] = useState(false);

  // ---- Agent State ----
  const handleSendReply = () => {
    if (!replyText.trim()) return;
    const ticketId = selectedTicket.id;
    const replyContent = replyText.trim();
    setTickets(prev => prev.map(t =>
      t.id === ticketId ? { ...t, comments: [...t.comments, { author: selectedTicket.email, role: 'user', timestamp: new Date().toLocaleTimeString(), text: replyContent }] } : t
    ));
    setReplyText('');
    const fullContext = selectedTicket.description + ' ' + replyContent;

    // Check if this ticket already went through S1 enrichment (missing fields were requested)
    const currentTicket = tickets.find(t => t.id === ticketId);
    const hadEnrichment = currentTicket?.comments?.some(c => c.missingFields);

    if (hadEnrichment) {
      // Post-enrichment: skip solution/approval — directly route to concerned person
      const past = matchPastResolution(fullContext);
      const match = matchScenario(fullContext);
      const scenarioName = match?.scenario || null;
      const route = escalationRoutes[scenarioName] || defaultEscalation;
      setRoutingTicketId(ticketId);
      setTimeout(() => {
        setRoutingTicketId(null);
        const problemStatement = generateProblemStatement(currentTicket, replyContent);
        const routingComment = {
          author: 'Ticketing Assistant',
          role: 'bot',
          timestamp: new Date().toLocaleTimeString(),
          text: null,
          escalation: { department: route.department, agent: route.agent, agentTitle: route.agentTitle },
          routedAfterEnrichment: true,
          matchedScenario: match ? { scenario: match.scenario, sop: match.sop } : null,
          matchedPast: past || null,
          problemStatement,
        };
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, comments: [...t.comments, routingComment], hasUpdate: true } : t));
      }, 3000);
    } else {
      // No prior enrichment: offer solution with human approval
      const past = matchPastResolution(fullContext);
      const match = matchScenario(fullContext);
      if (match || past) {
        setThinkingTicketId(ticketId);
        setTimeout(() => {
          setThinkingTicketId(null);
          const agentComment = match
            ? { author: 'Ticketing Assistant', role: 'bot', timestamp: new Date().toLocaleTimeString(), text: null, scenario: match.scenario, sop: match.sop, solution: match.solution, awaitingApproval: true }
            : { author: 'Ticketing Assistant', role: 'bot', timestamp: new Date().toLocaleTimeString(), text: null, pastResolution: past, awaitingApproval: true };
          setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, comments: [...t.comments, agentComment], hasUpdate: true } : t));
        }, 3000);
      }
    }
  };

  // ---- Approval Handler ----
  const handleApproval = (ticketId, commentIdx, approved) => {
    const ticket = tickets.find(t => t.id === ticketId);
    const scenarioName = ticket?.comments[commentIdx]?.scenario;
    const route = escalationRoutes[scenarioName] || defaultEscalation;
    setTickets(prev => prev.map(t => {
      if (t.id !== ticketId) return t;
      return { ...t, comments: t.comments.map((c, i) => i === commentIdx ? { ...c, awaitingApproval: false, applying: approved, approved: null } : c) };
    }));
    if (approved) {
      setTimeout(() => {
        setTickets(prev => prev.map(t => {
          if (t.id !== ticketId) return t;
          return { ...t, comments: t.comments.map((c, i) => i === commentIdx ? { ...c, applying: false, approved: true } : c) };
        }));
      }, 3000);
      return;
    }
    setThinkingTicketId(ticketId);
    setTimeout(() => {
      setThinkingTicketId(null);
      setTickets(curr => curr.map(t =>
        t.id === ticketId ? { ...t, comments: [...t.comments, { author: 'Ticketing Assistant', role: 'bot', timestamp: new Date().toLocaleTimeString(), text: null, escalation: { department: route.department, agent: route.agent, agentTitle: route.agentTitle } }] } : t
      ));
    }, 3000);
  };

  // ---- Submit Handler ----
  const handleSubmit = (e) => {
    e.preventDefault();
    const impactNum = form.impact.split(' ')[0];
    const urgencyNum = form.urgency.split(' ')[0];
    const priorityMap = { '11': '1 - Critical', '12': '2 - High', '21': '2 - High', '13': '3 - Moderate', '31': '3 - Moderate', '22': '3 - Moderate', '23': '4 - Low', '32': '4 - Low', '33': '4 - Low' };
    const priority = priorityMap[`${impactNum}${urgencyNum}`] || '3 - Moderate';
    const newTicket = {
      id: `GSD-${126 + tickets.length + 1}`,
      email: form.email, description: form.description,
      category: form.category, subcategory: form.subcategory,
      impact: form.impact, urgency: form.urgency, priority,
      contactType: form.contactType, assignmentGroup: form.assignmentGroup,
      status: 'Open', createdAt: new Date().toLocaleString(), comments: [], hasUpdate: false,
    };
    setTickets([newTicket, ...tickets]);
    setSubmittedTicket(newTicket);
    setForm({ email: 'Shubham Gupta', description: '', category: 'Software', subcategory: 'Application', impact: '2 - Medium', urgency: '2 - Medium', contactType: 'Self-service', assignmentGroup: 'IT Service Desk' });
    const ticketId = newTicket.id;
    setThinkingTicketId(ticketId);
    setTimeout(() => { setThinkingTicketId(null); processAIEnrichment(ticketId, newTicket.description); }, 3000);
  };

  // ---- Problem Statement Generator ----
  const generateProblemStatement = (ticket, enrichmentReply = '') => {
    const desc = ticket.description || '';
    const combined = (desc + ' ' + enrichmentReply).toLowerCase();

    // Extract key signals
    const subject = extractSubject(desc) || 'the system';
    const isSnowflake = /snowflake|warehouse|query.*queue/i.test(combined);
    const isSalesforce = /salesforce.*api|api.*salesforce|salesforce.*integration/i.test(combined);
    const isLoading = /not loading|won't load|blank|spinning|keeps loading/i.test(combined);

    let issueType = 'Technical Issue';
    if (isSnowflake) issueType = 'Data Platform — Query Performance Degradation';
    else if (isSalesforce) issueType = 'Integration Failure — Salesforce API';
    else if (isLoading) issueType = 'Application Availability — Page Load Failure';
    else if (/login|authentication|session expired/i.test(combined)) issueType = 'Authentication Failure';
    else if (/access denied|permission|forbidden/i.test(combined)) issueType = 'Access & Permission Issue';
    else if (/slow|performance|latency/i.test(combined)) issueType = 'Performance Degradation';

    // Build lines from enrichment reply
    const lines = enrichmentReply.split(/\n|\.\s+/).map(l => l.trim()).filter(l => l.length > 10);

    return {
      title: `${subject} — ${issueType}`,
      summary: `User reported: "${desc}".`,
      details: lines.slice(0, 5),
      priority: ticket.priority || '3 - Moderate',
      impact: ticket.impact || '2 - Medium',
      category: ticket.category || 'Software',
    };
  };

  // ---- AI Enrichment ----
  const processAIEnrichment = (ticketId, description) => {
    const analysis = analyzeTicketDescription(description);
    if (analysis.missingFields.length > 0) {
      const contextualFields = generateContextualFields(description, analysis.missingFields);
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, comments: [...t.comments, { author: 'Ticketing Assistant', role: 'bot', timestamp: new Date().toLocaleTimeString(), text: null, missingFields: contextualFields }], hasUpdate: true } : t));
    } else {
      // Complete description — show S1 enrichment success, then S2 routing thinking, then route
      setTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        comments: [...t.comments, { author: 'Ticketing Assistant', role: 'bot', timestamp: new Date().toLocaleTimeString(), enrichmentComplete: true }],
        hasUpdate: true
      } : t));
      setRoutingTicketId(ticketId);
      setTimeout(() => {
        setRoutingTicketId(null);
        const past = matchPastResolution(description);
        const match = matchScenario(description);
        const scenarioName = match?.scenario || null;
        const route = escalationRoutes[scenarioName] || defaultEscalation;
        const routingComment = {
          author: 'Ticketing Assistant',
          role: 'bot',
          timestamp: new Date().toLocaleTimeString(),
          text: null,
          escalation: { department: route.department, agent: route.agent, agentTitle: route.agentTitle },
          routedAfterEnrichment: true,
          matchedScenario: match ? { scenario: match.scenario, sop: match.sop } : null,
          matchedPast: past || null
        };
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, comments: [...t.comments, routingComment], hasUpdate: true } : t));
      }, 3000);
    }
  };

  // ---- Open Ticket (reporter) ----
  const openTicket = (t) => {
    setTickets(prev => prev.map(i => i.id === t.id ? { ...i, hasUpdate: false } : i));
    setSelectedTicket(t);
    setView('detail');
    // Trigger AI pipeline if ticket hasn't been processed yet (and not already in progress)
    if ((!t.comments || t.comments.length === 0) && thinkingTicketId !== t.id) {
      setThinkingTicketId(t.id);
      setTimeout(() => {
        setThinkingTicketId(null);
        processAIEnrichment(t.id, t.description);
      }, 3000);
    }
  };

  // ---- Render Bot Comment (reporter chat) ----
  const renderBotComment = (comment, idx, ticketId) => (
    <div key={idx} className="flex gap-4 items-start">
      <div className="w-10 h-10 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600 border border-blue-200 shadow-inner">
        <Bot className="w-6 h-6" />
      </div>
      <div className="flex-1 bg-blue-50/50 rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-blue-900 text-sm">
              {comment.missingFields || comment.enrichmentComplete ? 'Agent' : comment.escalation ? 'Agent' : comment.solution || comment.pastResolution ? 'Agent' : comment.author}
            </span>
            {(comment.missingFields || comment.enrichmentComplete) && <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Context Enrichment</span>}
            {(comment.escalation || comment.solution || comment.pastResolution) && <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Intelligent Routing</span>}
          </div>
          <span className="text-[10px] text-blue-400 uppercase font-bold">{comment.timestamp}</span>
        </div>
        {comment.enrichmentComplete ? (
          <div className="text-sm text-slate-700 leading-relaxed space-y-3">
            <div className="bg-white rounded-xl p-3 space-y-2.5 border border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-xs font-bold text-green-700">Context Enrichment Complete</span>
              </div>
              <p className="text-xs text-slate-600 pl-6">All required fields are present in your ticket — no additional information needed.</p>
              <div className="pl-6 flex flex-wrap gap-1.5">
                {['Platform / System', 'Error Details', 'Steps to Reproduce', 'Impact Scope'].map((f, i) => (
                  <span key={i} className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-md border border-green-200 font-medium flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" />{f}</span>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 italic">Routing your ticket to the right specialist now...</p>
          </div>
        ) : comment.missingFields ? (
          <div className="text-sm text-slate-700 leading-relaxed space-y-3">
            <p>Hi 👋 — Thanks for raising this ticket.</p>
            <p>To help us resolve your issue faster, we need a bit more information:</p>
            <div className="bg-white rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Required Details Missing</p>
              {comment.missingFields.map((field, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="font-semibold text-slate-800">• {field.label}</span>
                  {field.hint && <span className="text-xs text-slate-500 pl-3">{field.hint}</span>}
                </div>
              ))}
            </div>
            <div className="pt-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px] font-medium text-blue-500 uppercase tracking-wide">Action Required: Update ticket with missing details</span>
            </div>
          </div>
        ) : comment.pastResolution ? (
          <div className="text-sm text-slate-700 leading-relaxed space-y-3">
            <p>I couldn't find a matching SOP for this issue. However, I found a <span className="font-semibold text-slate-800">similar ticket resolved in the past</span> that may help:</p>
            <div className="bg-white rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                <span className="text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Historical Match</span>
                <span className="text-xs text-slate-500">{comment.pastResolution.ticketRef} · Resolved on {comment.pastResolution.resolvedOn} · {comment.pastResolution.similarity} similarity</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{comment.pastResolution.steps}</p>
            </div>
            {comment.awaitingApproval ? (
              <div className="pt-3 border-t border-blue-100">
                <p className="text-xs font-semibold text-slate-600 mb-2">Should I apply this historical fix?</p>
                <div className="flex gap-2">
                  <button onClick={() => handleApproval(ticketId, idx, true)} className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">Yes, Apply Fix</button>
                  <button onClick={() => handleApproval(ticketId, idx, false)} className="px-4 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors">No, Escalate</button>
                </div>
              </div>
            ) : (
              <div className="pt-3 border-t border-blue-100 flex items-center gap-2">
                {comment.applying ? <span className="text-xs font-semibold text-blue-500 italic flex items-center gap-1.5">Applying fix <ThinkingDots /></span>
                  : comment.approved ? <span className="text-xs font-semibold text-green-600">✓ Historical fix approved — resolution steps applied.</span>
                    : <span className="text-xs font-semibold text-orange-500">↑ Escalated to L2 support team.</span>}
              </div>
            )}
          </div>
        ) : comment.solution ? (
          <div className="text-sm text-slate-700 leading-relaxed space-y-3">
            <p className="whitespace-pre-wrap">{comment.solution}</p>
            {comment.awaitingApproval ? (
              <div className="pt-3 border-t border-blue-100">
                <p className="text-xs font-semibold text-slate-600 mb-2">Should I proceed with this resolution?</p>
                <div className="flex gap-2">
                  <button onClick={() => handleApproval(ticketId, idx, true)} className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">Yes, Apply Fix</button>
                  <button onClick={() => handleApproval(ticketId, idx, false)} className="px-4 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors">No, Escalate</button>
                </div>
              </div>
            ) : (
              <div className="pt-3 border-t border-blue-100 flex items-center gap-2">
                {comment.applying ? <span className="text-xs font-semibold text-blue-500 italic flex items-center gap-1.5">Applying fix <ThinkingDots /></span>
                  : comment.approved ? <span className="text-xs font-semibold text-green-600">✓ Fix approved — resolution steps applied.</span>
                    : <span className="text-xs font-semibold text-orange-500">↑ Escalated to L2 support team.</span>}
              </div>
            )}
          </div>
        ) : comment.escalation ? (
          <div className="text-sm text-slate-700 space-y-3">
            <p>Your ticket has been reviewed and is assigned to the right team. They'll be in touch shortly.</p>
            <div className="bg-white rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Assigned</span>
                <span className="text-sm font-semibold text-slate-800">{comment.escalation.department}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-slate-700 text-sm leading-relaxed">{comment.text}</p>
        )}
      </div>
    </div>
  );

  // ============================================================
  //  REPORTER PORTAL  (ServiceNow-style)
  // ============================================================
  const liveTicket = selectedTicket ? tickets.find(t => t.id === selectedTicket.id) : null;
  const commentsToShow = liveTicket?.comments || selectedTicket?.comments || [];
  const liveSubmitted = submittedTicket ? tickets.find(t => t.id === submittedTicket.id) : null;
  const submittedComments = liveSubmitted?.comments || [];
  const nextIncNumber = `GSD-${126 + tickets.length + 1}`;


  // ── Sidebar nav items ──────────────────────────────────────
  const SidebarItem = ({ label, active, indent = false, onClick }) => (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-1.5 text-[13px] transition-colors
        ${indent ? 'pl-7' : ''}
        ${active
          ? 'bg-white/15 text-white font-semibold'
          : 'text-white/60 hover:bg-white/10 hover:text-white/90'
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-screen flex font-sans overflow-hidden">

      {/* ── Left Sidebar ─────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 flex flex-col bg-[#1d1d1f] border-r border-white/5">

        {/* Logo */}
        <div className="h-11 flex items-center px-4 gap-2.5 border-b border-white/10 flex-shrink-0">
          <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-white font-bold text-xs flex-shrink-0">S</div>
          <span className="text-white text-sm font-semibold tracking-tight">SupportHub</span>
        </div>

        {/* Search box */}
        <div className="px-3 py-2.5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 bg-white/10 rounded px-2.5 py-1.5">
            <Search className="w-3 h-3 text-white/40 flex-shrink-0" />
            <span className="text-white/40 text-xs flex-1">Search incidents</span>
          </div>
        </div>

        {/* Icon strip */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/10 flex-shrink-0">
          <button className="text-white/50 hover:text-white transition-colors"><FileText className="w-4 h-4" /></button>
          <button className="text-white/50 hover:text-white transition-colors"><Bell className="w-4 h-4" /></button>
          <button className="text-white/50 hover:text-white transition-colors"><Clock className="w-4 h-4" /></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-1">
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Incident</span>
          </div>
          <SidebarItem label="Create New" active={view === 'create'} indent onClick={() => { setUserRole('reporter'); setView('create'); setSelectedTicket(null); setSubmittedTicket(null); setIncidentFinalized(false); }} />
          <SidebarItem label="Assigned to me" active={userRole === 'agent'} indent onClick={() => setUserRole('agent')} />
          <SidebarItem label="All" active={view === 'list' && userRole === 'reporter'} indent onClick={() => { setUserRole('reporter'); setView('list'); }} />

          <div className="px-4 pt-4 pb-1">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">▼ Incidents</span>
          </div>
          {tickets.map(t => (
            <button
              key={t.id}
              onClick={() => { setUserRole('reporter'); openTicket(t); }}
              className={`w-full text-left px-4 pl-7 py-1 text-[12px] transition-colors flex items-center gap-1.5
                  ${selectedTicket?.id === t.id && view === 'detail' && userRole === 'reporter'
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-white/50 hover:bg-white/10 hover:text-white/80'}`}
            >
              {t.hasUpdate && <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0 animate-pulse" />}
              <span className="truncate">{t.id}</span>
            </button>
          ))}
        </nav>

        {/* Bottom user */}
        <div className="border-t border-white/10 px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white font-medium truncate">Reporter Portal</p>
            <p className="text-[10px] text-white/40 truncate">{form.email}</p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {userRole === 'reporter' && (<>

          {/* Top bar */}
          <header className="h-11 bg-white border-b border-gray-200 flex items-center px-5 gap-3 flex-shrink-0 shadow-sm">
            {view === 'detail' && (
              <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-700 transition-colors mr-1">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <div className="flex flex-col justify-center leading-none">
              <span className="text-[11px] text-gray-400 font-medium">
                Incident {view === 'detail' ? `/ ${selectedTicket?.id}` : view === 'create' ? '/ New record' : '/ All'}
              </span>
            </div>
            <div className="flex-1" />
            {/* Action buttons */}
            {view === 'create' ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setView('list'); setSubmittedTicket(null); }} className="px-4 py-1.5 text-xs text-gray-600 border border-gray-300 bg-white hover:bg-gray-50 rounded font-medium transition-colors">{submittedTicket ? 'Close' : 'Cancel'}</button>
              </div>
            ) : view === 'detail' ? null : (
              <button onClick={() => setView('create')} className="px-4 py-1.5 text-xs bg-[#1a6cc4] hover:bg-[#155fad] text-white rounded font-semibold transition-colors flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> New Incident
              </button>
            )}
          </header>

          {/* ── CREATE NEW form ── */}
          {view === 'create' && (
            <div className="flex-1 overflow-y-auto">
              {/* Form — hidden after submit */}
              {!submittedTicket && (
                <form onSubmit={handleSubmit}>
                  <div className="bg-white px-8 py-6 border-b border-gray-200">

                    {/* ── Two-column field grid ── */}
                    <div className="grid grid-cols-2 gap-x-16 gap-y-0 mb-5">

                      {/* LEFT column */}
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Number</label>
                          <input readOnly value={nextIncNumber} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 rounded-sm focus:outline-none" />
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Caller <span className="text-red-500">*</span></label>
                          <input required type="text" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Shivam Gupta" className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Category</label>
                          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, subcategory: '' })} className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                            {['Software', 'Hardware', 'Network', 'Access / Security', 'Database', 'Other'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Subcategory</label>
                          <select value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                            {({ 'Software': ['Application', 'OS', 'Email / Outlook', 'Browser', 'Antivirus'], 'Hardware': ['Laptop', 'Desktop', 'Printer', 'Monitor', 'Peripheral'], 'Network': ['VPN', 'Wi-Fi', 'Firewall', 'DNS', 'Proxy'], 'Access / Security': ['Account Lockout', 'Password Reset', 'Permissions', 'MFA', '2FA'], 'Database': ['Query Issue', 'Connection Failure', 'Data Corruption', 'Backup'], 'Other': ['General', 'Other'] }[form.category] || ['General']).map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Impact</label>
                          <select value={form.impact} onChange={e => setForm({ ...form, impact: e.target.value })} className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                            {['1 - High', '2 - Medium', '3 - Low'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Assignment group</label>
                          <select value={form.assignmentGroup} onChange={e => setForm({ ...form, assignmentGroup: e.target.value })} className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                            {['IT Service Desk', 'Identity & Access Management', 'Platform Engineering', 'Network Operations', 'Database Administration', 'L2 Support'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* RIGHT column */}
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">State</label>
                          <input readOnly value="New" className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 rounded-sm focus:outline-none" />
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Contact type</label>
                          <select value={form.contactType} onChange={e => setForm({ ...form, contactType: e.target.value })} className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                            {['Self-service', 'Phone', 'Email', 'Walk-in', 'Chat'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Urgency</label>
                          <select value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })} className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                            {['1 - High', '2 - Medium', '3 - Low'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center">
                          <label className="w-32 text-sm text-gray-500 flex-shrink-0">Priority</label>
                          <input readOnly value={(() => { const i = form.impact.split(' ')[0]; const u = form.urgency.split(' ')[0]; return ({ '11': '1 - Critical', '12': '2 - High', '21': '2 - High', '13': '3 - Moderate', '31': '3 - Moderate', '22': '3 - Moderate', '23': '4 - Low', '32': '4 - Low', '33': '4 - Low' }[`${i}${u}`] || '3 - Moderate'); })()} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                        </div>
                      </div>
                    </div>

                    {/* ── Short description — full width ── */}
                    <div className="border-t border-gray-100 pt-4">
                      <label className="block text-sm text-gray-500 mb-1.5">Short description <span className="text-red-500">*</span></label>
                      <textarea
                        required
                        value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        rows={4}
                        placeholder="Describe the issue. Include system, error codes, and steps to reproduce..."
                        className="w-full border border-gray-300 px-3 py-2 text-sm rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <button type="submit" className="px-6 py-2 text-sm bg-[#1a6cc4] hover:bg-[#155fad] text-white rounded font-semibold transition-colors">Submit</button>
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {/* Post-submit: readonly form + AI conversation */}
              {submittedTicket && (() => {
                const isRouted = submittedComments.some(c => c.escalation);
                return (
                  <div className="flex flex-col h-full">
                    {/* Readonly form fields */}
                    <div className="bg-white border-b border-gray-200 px-8 py-5 flex-shrink-0">
                      <div className="space-y-2.5 max-w-2xl">
                        <div className="grid grid-cols-2 gap-x-8">
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Number</label>
                            <input readOnly value={submittedTicket.id} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-[#1a6cc4] font-semibold rounded-sm focus:outline-none" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">State</label>
                            <input readOnly value={submittedTicket.status} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-8">
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Caller</label>
                            <input readOnly value={submittedTicket.email} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Contact type</label>
                            <input readOnly value={submittedTicket.contactType || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-8">
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Category</label>
                            <input readOnly value={submittedTicket.category || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Subcategory</label>
                            <input readOnly value={submittedTicket.subcategory || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-8">
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Impact</label>
                            <input readOnly value={submittedTicket.impact || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Urgency</label>
                            <input readOnly value={submittedTicket.urgency || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-8">
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Assignment group</label>
                            <input readOnly value={submittedTicket.assignmentGroup || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0">Priority</label>
                            <input readOnly value={submittedTicket.priority || '—'} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 rounded-sm focus:outline-none" />
                          </div>
                        </div>
                        <div className="flex items-start gap-3 pt-1">
                          <label className="w-36 text-right text-sm text-gray-500 flex-shrink-0 pt-2">Short description</label>
                          <textarea readOnly value={submittedTicket.description} rows={3} className="flex-1 border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 rounded-sm focus:outline-none resize-none" />
                        </div>
                      </div>
                    </div>

                    {/* AI conversation thread */}
                    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 max-w-3xl">
                      {submittedComments.filter(c => !c.missingFields).map((comment, idx) =>
                        comment.role === 'user' ? (
                          <div key={idx} className="flex gap-3 items-start justify-end">
                            <div className="max-w-lg bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="font-semibold text-gray-700 text-sm">{comment.author}</span>
                                <span className="text-[10px] text-gray-400 ml-4">{comment.timestamp}</span>
                              </div>
                              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-500 border border-gray-300">
                              <User className="w-4 h-4" />
                            </div>
                          </div>
                        ) : renderBotComment(comment, idx, submittedTicket.id)
                      )}

                      {/* S2 thinking */}
                      {routingTicketId === submittedTicket.id && (
                        <div className="flex gap-3 items-start">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600 border border-blue-200"><Bot className="w-4 h-4" /></div>
                          <div className="flex-1 bg-white border border-blue-100 rounded-lg p-3 shadow-sm">
                            <div className="flex flex-col gap-0.5 mb-1.5">
                              <span className="font-bold text-blue-900 text-xs">Agent</span>
                              <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Intelligent Routing</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-500 italic">Routing to the right team</span>
                              <ThinkingDots />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sticky bottom bar */}
                    {(isRouted || incidentFinalized) && (
                      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-3 flex-shrink-0">
                        {incidentFinalized ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-sm font-semibold">Incident submitted</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex gap-3 items-end">
                              <textarea
                                rows={2}
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                placeholder="Add a note or question..."
                                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                              />
                              <button
                                onClick={() => {
                                  if (!replyText.trim()) return;
                                  const reply = { author: submittedTicket.email, role: 'user', timestamp: new Date().toLocaleTimeString(), text: replyText.trim() };
                                  setTickets(prev => prev.map(t => t.id === submittedTicket.id ? { ...t, comments: [...t.comments, reply] } : t));
                                  setReplyText('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-semibold transition-colors flex items-center gap-1.5 flex-shrink-0"
                              >
                                <Send className="w-3.5 h-3.5" /> Send
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                Incident routed and ready
                              </span>
                              <button
                                onClick={() => setIncidentFinalized(true)}
                                className="px-6 py-2 bg-[#1a6cc4] hover:bg-[#155fad] text-white rounded font-semibold text-sm transition-colors flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" /> Submit Incident
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TICKET LIST ── */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600 font-medium">Incidents — All</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{tickets.length}</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" placeholder="Search..." className="pl-9 pr-3 py-1.5 border border-gray-300 rounded text-xs w-52 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Number</th>
                      <th className="px-5 py-3">Opened</th>
                      <th className="px-5 py-3">Short description</th>
                      <th className="px-5 py-3">Caller</th>
                      <th className="px-5 py-3">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tickets.length === 0 ? (
                      <tr><td colSpan="5" className="px-5 py-10 text-center text-gray-400 text-sm italic">No incidents to display.</td></tr>
                    ) : tickets.map(inc => (
                      <tr key={inc.id} onClick={() => openTicket(inc)} className="hover:bg-blue-50/60 cursor-pointer transition-colors group">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#1a6cc4] font-medium group-hover:underline">{inc.id}</span>
                            {inc.hasUpdate && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{inc.createdAt}</td>
                        <td className="px-5 py-2.5 text-sm text-gray-700 max-w-xs"><p className="truncate">{inc.description}</p></td>
                        <td className="px-5 py-2.5 text-sm text-gray-500">{inc.email}</td>
                        <td className="px-5 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded
                            ${inc.status === 'Resolved' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${inc.status === 'Resolved' ? 'bg-green-500' : 'bg-blue-500'}`} />
                            {inc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TICKET DETAIL ── */}
          {view === 'detail' && selectedTicket && (
            <div className="flex-1 overflow-y-auto">
              {/* Meta strip */}
              <div className="bg-white border-b border-gray-200 px-8 py-4">
                <div className="grid grid-cols-4 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Number</p>
                    <p className="text-sm font-bold text-[#1a6cc4]">{selectedTicket.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">State</p>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded ${(liveTicket?.status || selectedTicket.status) === 'Resolved' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${(liveTicket?.status || selectedTicket.status) === 'Resolved' ? 'bg-green-500' : 'bg-blue-500'}`} />
                      {liveTicket?.status || selectedTicket.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Opened</p>
                    <p className="text-sm text-gray-700">{selectedTicket.createdAt}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Caller</p>
                    <p className="text-sm text-gray-700">{selectedTicket.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Category</p>
                    <p className="text-sm text-gray-700">{selectedTicket.category || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Subcategory</p>
                    <p className="text-sm text-gray-700">{selectedTicket.subcategory || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Impact</p>
                    <p className="text-sm text-gray-700">{selectedTicket.impact || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Urgency</p>
                    <p className="text-sm text-gray-700">{selectedTicket.urgency || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Priority</p>
                    <p className="text-sm font-semibold text-orange-600">{selectedTicket.priority || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Assignment group</p>
                    <p className="text-sm text-gray-700">{selectedTicket.assignmentGroup || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Contact type</p>
                    <p className="text-sm text-gray-700">{selectedTicket.contactType || '—'}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Short description</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{selectedTicket.description}</p>
                </div>

                {/* Submitted + Routing status */}
                {(() => {
                  const routingComment = commentsToShow.find(c => c.escalation);
                  if (!routingComment) return null;
                  return (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-green-700">Incident Submitted</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <UserCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span>Routed to <span className="font-semibold text-gray-800">{routingComment.escalation.department}</span></span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Notes tabs */}
              <div className="bg-white border-b border-gray-200">
                <div className="flex px-8">
                  {['Comments Section'].map((tab, i) => (
                    <button key={tab} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${i === 0 ? 'border-[#1a6cc4] text-[#1a6cc4]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab}</button>
                  ))}
                </div>
              </div>

              {/* Comments thread */}
              <div className="px-8 py-6 space-y-5 w-full">
                {commentsToShow.map((comment, idx) =>
                  comment.role === 'user' ? (
                    <div key={idx} className="flex gap-3 items-start justify-end">
                      <div className="max-w-lg bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-semibold text-gray-700 text-sm">{comment.author}</span>
                          <span className="text-[10px] text-gray-400 ml-4">{comment.timestamp}</span>
                        </div>
                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-500 border border-gray-300">
                        <User className="w-4 h-4" />
                      </div>
                    </div>
                  ) : renderBotComment(comment, idx, selectedTicket.id)
                )}

                {/* S1 thinking */}
                {thinkingTicketId === selectedTicket.id && (
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600 border border-blue-200"><Bot className="w-4 h-4" /></div>
                    <div className="flex-1 bg-white border border-blue-100 rounded-lg p-3 shadow-sm">
                      <div className="flex flex-col gap-0.5 mb-1.5">
                        <span className="font-bold text-blue-900 text-xs">Agent</span>
                        <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Context Enrichment</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-gray-500 italic">Analysing ticket context</span>
                        <ThinkingDots />
                      </div>
                    </div>
                  </div>
                )}

                {/* S2 thinking */}
                {routingTicketId === selectedTicket.id && (
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center text-blue-600 border border-blue-200"><Bot className="w-4 h-4" /></div>
                    <div className="flex-1 bg-white border border-blue-100 rounded-lg p-3 shadow-sm">
                      <div className="flex flex-col gap-0.5 mb-1.5">
                        <span className="font-bold text-blue-900 text-xs">Agent</span>
                        <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Intelligent Routing</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-gray-500 italic">Routing to the right team</span>
                        <ThinkingDots />
                      </div>
                    </div>
                  </div>
                )}

                {commentsToShow.length === 0 && !thinkingTicketId && !routingTicketId && (
                  <div className="flex gap-3 items-start opacity-50">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400 border border-gray-200"><Bot className="w-4 h-4" /></div>
                    <div className="flex-1 bg-white border border-gray-100 rounded-lg p-3"><p className="text-gray-400 text-sm italic">Waiting for AI enrichment analysis...</p></div>
                  </div>
                )}
              </div>

              {/* Reply bar */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-3 flex gap-3 items-end">
                <textarea
                  rows={2}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendReply())}
                  placeholder="Add a note or reply..."
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <button onClick={handleSendReply} className="bg-[#1a6cc4] hover:bg-[#155fad] text-white px-5 py-2 rounded text-sm font-semibold transition-colors flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>
            </div>
          )}

        </>)}

        {userRole === 'agent' && (
          <AgentView
            tickets={tickets}
            setTickets={setTickets}
            thinkingTicketId={thinkingTicketId}
            routingTicketId={routingTicketId}
            setThinkingTicketId={setThinkingTicketId}
            setRoutingTicketId={setRoutingTicketId}
            processAIEnrichment={processAIEnrichment}
            matchScenario={matchScenario}
            matchPastResolution={matchPastResolution}
            scenarioLibrary={scenarioLibrary}
          />
        )}

      </div>
    </div>
  );
};

export default App;
