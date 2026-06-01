document.addEventListener('DOMContentLoaded', () => {

    // ---- State ----
    let _fbData = [];
    let _fbFiltered = [];
    // Group Feedback (across users) — separate dataset + filtered view
    let _gAllData = [];   // all rows, unfiltered (used by Overall tab)
    let _gData = [];      // group-2-scoped rows
    let _gFiltered = [];
    let _ovFiltered = []; // Overall tab filtered slice
    // Question filter + table page are tracked per scope ('fb' = individual, 'g' = group-2, 'ov' = overall)
    const _qFilter = { fb: 'all', g: 'all', ov: 'all' };
    const _tablePages = { fb: 1, g: 1, ov: 1 };
    const FB_PAGE_SIZE = 10;
    let _fbUsersById = {};
    let _fbQuestionsById = {};
    let _fbOutletsById = {};
    let _currentUser = null;

    const FB_STOP_WORDS = new Set([
        // Articles & determiners
        'a','an','the','this','that','these','those','some','any','each','every',
        'all','both','few','more','most','other','another','such','no','nor',
        // Pronouns
        'i','me','my','myself','we','our','ours','ourselves',
        'you','your','yours','yourself','yourselves',
        'he','him','his','himself','she','her','hers','herself',
        'it','its','itself','they','them','their','theirs','themselves',
        'who','whom','whose','which','what','where','when','why','how',
        // Conjunctions
        'and','but','or','nor','for','so','yet','as','if','then','than',
        'although','because','since','unless','until','while','after','before',
        'though','whereas',
        // Prepositions
        'in','on','at','by','to','of','from','up','out','off','over','under',
        'into','onto','upon','with','without','within','about','above','below',
        'between','among','through','during','along','across','behind','beside',
        'towards','toward','near','per','via','against','around',
        // Auxiliary verbs
        'is','am','are','was','were','be','been','being',
        'have','has','had','having',
        'do','does','did','doing','done',
        'will','would','shall','should','may','might','must','can','could',
        // Common high-frequency low-signal verbs
        'get','got','gets','getting','gotten',
        'make','made','makes','making',
        'go','goes','went','going','gone',
        'come','comes','came','coming',
        'take','takes','took','taken','taking',
        'give','gives','gave','given','giving',
        'know','knows','knew','known','knowing',
        'see','sees','saw','seen','seeing',
        'say','says','said','saying',
        'use','uses','used','using',
        'want','wants','wanted','wanting',
        'look','looks','looked','looking',
        'seem','seems','seemed',
        'tell','told','tells','telling',
        'put','puts','putting',
        'ask','asked','asks','asking',
        'let','lets','letting',
        'try','tries','tried','trying',
        'call','called','calls','calling',
        'keep','keeps','kept','keeping',
        'need','needs','needed','needing',
        // Adverbs
        'very','just','now','also','only','even','still','back','again','here',
        'there','then','too','so','up','already','always','often','never',
        'maybe','perhaps','quite','rather','really','well','ever','else',
        'however','therefore','thus','hence','otherwise','instead',
        // Generic adjectives / low-signal descriptors
        'new','old','good','bad','big','small','large','long','short',
        'first','last','next','same','different','many','much','little',
        'high','low','right','left','own','free','full','open','whole',
        'able','available','certain','less','least','best','worst',
        'easy','hard','nice','sure','true','false','real','main','general',
        // Conversational fillers
        'yes','yeah','yep','okay','hmm','like','actually','basically',
        'generally','usually','typically','please','thank','thanks',
        'sorry','hello','hi','hey','sir','madam','dear',
        'ok','alright','absolutely','definitely','obviously','clearly',
        // Numbers written out
        'one','two','three','four','five','six','seven','eight','nine','ten',
        // Misc / punctuation words
        'etc','also','not','but','can','has','was','had','have',
    ]);

    // Sentiment lexicons shared by the verbatim summary and keyword cards
    const FB_POS_WORDS = ['great','excellent','best','love','recommend','effective','helpful','satisfied','strong','improved','trust','impressed','reliable','working','build','opportunity'];
    const FB_NEG_WORDS = ['improvement','expensive','missing','lack','poor','difficult','stockout','issue','problem','slow','weak','limited','confusing','unavailable','empty'];

    // ---- Utilities ----
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function showNotice(message, level) {
        const container = document.querySelector('.dashboard-section');
        if (!container) return;
        let banner = document.querySelector('.error-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'error-banner';
            container.insertBefore(banner, container.firstChild);
        }
        banner.dataset.level = level || 'info';
        banner.innerHTML = `<button onclick="this.parentElement.remove()">&times;</button>${message}`;
    }

    function initials(name) {
        if (!name) return '?';
        return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    }

    function formatDateLong(s) {
        if (!s) return '—';
        try {
            const d = new Date(s.replace(' ', 'T'));
            if (isNaN(d.getTime())) return s;
            return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch { return s; }
    }

    function formatDateShort(s) {
        if (!s) return '—';
        return s.slice(0, 10);
    }

    function questionLabel(qid, maxLen) {
        const q = _fbQuestionsById[qid];
        if (!q) return `Question ${qid}`;
        const channel = q.channel || '';
        const qno = q.question_no || `Q${qid}`;
        let text = q.question_text || '';
        const cap = maxLen || 60;
        if (text.length > cap) text = text.slice(0, cap - 1) + '…';
        return channel ? `${channel} · ${qno} — ${text}` : `${qno} — ${text}`;
    }

    function questionShort(qid) {
        const q = _fbQuestionsById[qid];
        if (!q) return `Q${qid}`;
        return `${q.channel || ''} · ${q.question_no || 'Q' + qid}`.replace(/^ · /, '');
    }

    function outletName(oid) {
        if (oid == null) return '—';
        const o = _fbOutletsById[oid];
        return o && o.outlet_name ? o.outlet_name : `Outlet #${oid}`;
    }

    function outletCode(oid) {
        if (oid == null) return '—';
        const o = _fbOutletsById[oid];
        return o && o.outlet_code ? o.outlet_code : '—';
    }

    function inferLevel(level, oid) {
        if (level) return level;
        const o = _fbOutletsById[oid];
        if (!o) return 'unknown';
        const ch = (o.channel || '').toLowerCase();
        if (ch.includes('pharm')) return 'trade';
        if (ch.includes('groc')) return 'trade';
        if (ch.includes('hcp') || ch.includes('clinic') || ch.includes('doctor')) return 'hcp';
        if (ch.includes('consumer')) return 'consumer';
        return 'unknown';
    }

    function visitTypeLabel(level) {
        if (!level || level === 'unknown') return 'Other';
        return { trade: 'Trade', hcp: 'HCP', consumer: 'Consumer' }[level] || level;
    }

    // ---- Data loading ----
    async function loadFeedbackMeta() {
        try {
            const res = await fetch('/api/feedback-meta');
            if (!res.ok) return;
            const meta = await res.json();
            (meta.users || []).forEach(u => { _fbUsersById[u.id] = u; });
            (meta.questions || []).forEach(q => { _fbQuestionsById[q.id] = q; });
            (meta.outlets || []).forEach(o => { _fbOutletsById[o.id] = o; });
            _currentUser = meta.current_user || null;
            applyCurrentUserToUi();
        } catch (e) {
            console.warn('Could not load feedback meta:', e);
        }
    }

    function applyCurrentUserToUi() {
        if (!_currentUser) return;
        const name = _currentUser.user_name || 'User';
        const firstName = name.split(/\s+/)[0] || name;
        const ini = initials(name);
        const headerName = document.getElementById('headerUserName');
        const headerAvatar = document.getElementById('headerUserAvatar');
        const profName = document.getElementById('sidebarProfileName');
        const profAvatar = document.getElementById('sidebarProfileAvatar');
        if (headerName) { headerName.textContent = firstName; headerName.title = name; }
        if (headerAvatar) headerAvatar.textContent = ini;
        if (profName) profName.textContent = name;
        if (profAvatar) profAvatar.textContent = ini;
    }

    async function loadFeedbackData() {
        try {
            const res = await fetch('/api/feedback-data');
            if (!res.ok) throw new Error('Failed to load feedback data');
            const json = await res.json();
            _fbData = json.data || [];
            _fbFiltered = [..._fbData];
            populateFilterDropdowns();
            renderDashboard();
            renderVisitsList();
        } catch (e) {
            console.warn('Could not load feedback data:', e);
            renderEmptyDashboard('Failed to load feedback data. Make sure the CSV file exists.');
        }
    }

    // ---- View switching ----
    function showView(viewName) {
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById('view-' + viewName);
        if (target) target.classList.add('active');
        document.querySelectorAll('.sidebar-nav-item').forEach(b => {
            if (b.dataset.view === viewName) b.classList.add('active');
            else if (!b.disabled) b.classList.remove('active');
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('.sidebar-nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view) showView(view);
            closeMobileSidebar();
        });
    });

    // ---- Mobile sidebar toggle ----
    function openMobileSidebar() {
        document.getElementById('sidebar')?.classList.add('is-open');
        document.getElementById('sidebarScrim')?.classList.add('is-visible');
        document.body.classList.add('sidebar-open');
    }
    function closeMobileSidebar() {
        document.getElementById('sidebar')?.classList.remove('is-open');
        document.getElementById('sidebarScrim')?.classList.remove('is-visible');
        document.body.classList.remove('sidebar-open');
    }
    document.getElementById('headerMenuBtn')?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar?.classList.contains('is-open')) closeMobileSidebar();
        else openMobileSidebar();
    });
    document.getElementById('sidebarScrim')?.addEventListener('click', closeMobileSidebar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileSidebar(); });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) closeMobileSidebar();
    });

    // ---- Dashboard ----
    function renderEmptyDashboard(msg) {
        ['fbKpiRow', 'fbQuestionAvgRating', 'fbOutletBuckets', 'fbRatingDist', 'fbAiSummary', 'fbTableBody']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="fbi-empty">${msg || 'No data available'}</div>`;
            });
    }

    function renderDashboard() {
        const data = _fbFiltered;
        if (!data.length) {
            renderEmptyDashboard('No feedback yet for the current selection.');
            return;
        }

        const ratings = data.filter(r => r.rating != null).map(r => r.rating);
        const ratingsDist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
        ratings.forEach(r => { if (ratingsDist[r] != null) ratingsDist[r]++; });
        const totalRatings = ratings.length;
        const avgRating = totalRatings ? ratings.reduce((a, b) => a + b, 0) / totalRatings : 0;

        const uniqueOutlets = new Set(data.map(r => r.outlet_id != null ? String(r.outlet_id) : null).filter(Boolean));
        const uniqueVisits = new Set(data.map(r => r.visit_id));
        const uniqueUsers = new Set(data.map(r => r.user_id != null ? String(r.user_id) : null).filter(Boolean));

        renderKpis({
            avgRating, totalRatings,
            respondents: uniqueUsers.size,
            outlets: uniqueOutlets.size,
            feedbacks: uniqueVisits.size,
        });
        renderQuestionAvgRating(data, 'fbQuestionAvgRating');
        renderOutletBuckets(data, 'fbOutletBuckets');
        renderRatingDist(ratingsDist, totalRatings);
        renderVerbatimSummary(data);
        renderResponsesTable(data, 'fb');
    }

    function renderKpis(stats, elId, repCfg) {
        const el = document.getElementById(elId || 'fbKpiRow');
        if (!el) return;
        repCfg = repCfg || { label: 'Respondents', sub: 'field reps submitting' };
        const items = [
            {
                label: 'Average Rating',
                value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—',
                unit: stats.avgRating > 0 ? '/5' : '',
                sub: `${stats.totalRatings} ratings collected`, cls: 'fbi-kpi-green',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
            },
            {
                label: repCfg.label, value: stats.respondents,
                sub: repCfg.sub, cls: 'fbi-kpi-blue',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
            },
            {
                label: 'Outlets', value: stats.outlets,
                sub: `points of sale covered`, cls: 'fbi-kpi-amber',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/></svg>`,
            },
            {
                label: 'Feedbacks', value: stats.feedbacks,
                sub: `total responses captured`, cls: 'fbi-kpi-purple',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
            },
        ];
        el.innerHTML = items.map((k, i) => `
            <div class="fbi-kpi-card ${k.cls}" style="animation-delay:${i*0.08}s">
                <div class="fbi-kpi-icon-wrap">${k.icon}</div>
                <div class="fbi-kpi-value">${k.value}${k.unit ? `<span class="fbi-kpi-unit">${k.unit}</span>` : ''}</div>
                <div class="fbi-kpi-label">${k.label}</div>
                <div class="fbi-kpi-sub">${k.sub}</div>
            </div>`).join('');
    }

    function renderRatingDist(dist, total, elId) {
        const el = document.getElementById(elId || 'fbRatingDist');
        if (!el) return;
        if (total === 0) { el.innerHTML = '<div class="fbi-empty">No ratings available for this selection</div>'; return; }
        const maxCount = Math.max(...Object.values(dist), 1);
        const colors = { 1:'#dc2626', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
        const labels = { 1:'Poor', 2:'Fair', 3:'Good', 4:'Very Good', 5:'Excellent' };
        let barsHtml = '';
        for (let i = 1; i <= 5; i++) {
            const count = dist[i] || 0;
            const pctOfMax = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const pctOfTotal = total > 0 ? (count / total) * 100 : 0;
            barsHtml += `
                <div class="fb-rating-bar-wrap">
                    <div class="fb-rating-count">${count} <span class="fb-rating-pct">(${pctOfTotal.toFixed(0)}%)</span></div>
                    <div class="fb-rating-bar" style="height:${Math.max(4, pctOfMax)}%;background:${colors[i]}" title="${labels[i]}: ${count} responses (${pctOfTotal.toFixed(0)}% of total)"></div>
                    <div class="fb-rating-label">${i}<br><span style="font-size:0.65rem;font-weight:400;color:var(--text-tertiary)">${labels[i]}</span></div>
                </div>`;
        }
        el.innerHTML = `
            <div class="fb-rating-dist">${barsHtml}</div>
            <div class="fb-rating-total">${total}</div>
            <div class="fb-rating-total-label">Total Ratings Collected</div>`;
    }

    function renderQuestionAvgRating(data, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const qRatings = {};
        data.forEach(r => {
            if (r.rating == null || r.question_id == null) return;
            if (!qRatings[r.question_id]) qRatings[r.question_id] = [];
            qRatings[r.question_id].push(r.rating);
        });
        const qAverages = Object.entries(qRatings).map(([qid, ratings]) => {
            const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            const q = _fbQuestionsById[parseInt(qid)];
            const rawText = q ? q.question_text || '' : '';
            const qno = q ? q.question_no || `Q${qid}` : `Q${qid}`;
            return { qid: parseInt(qid), qno, text: rawText, avg, count: ratings.length };
        }).filter(q => q.text) // skip orphan question_ids with no question text
          .sort((a, b) => a.avg - b.avg);
        if (!qAverages.length) { el.innerHTML = '<div class="fbi-empty">No rating data available</div>'; return; }
        const maxAvg = 5;
        let html = '<div class="fb-hbar-chart">';
        qAverages.forEach(q => {
            const pct = (q.avg / maxAvg) * 100;
            const color = q.avg <= 2 ? '#dc2626' : q.avg <= 3 ? '#f97316' : q.avg <= 4 ? '#84cc16' : '#22c55e';
            html += `
                <div class="fb-hbar-row">
                    <div class="fb-hbar-label">
                        <span class="fb-hbar-qno">${escapeHtml(q.qno)}</span>
                        ${q.text ? `<span class="fb-hbar-qtext">${escapeHtml(q.text)}</span>` : ''}
                    </div>
                    <div class="fb-hbar-track" title="${escapeHtml(q.qno)}: ${escapeHtml(q.text)}">
                        <div class="fb-hbar-fill" style="width:${pct}%;background:${color}">
                            <span class="fb-hbar-val">${q.avg.toFixed(1)}</span>
                        </div>
                    </div>
                    <div class="fb-hbar-count">${q.count}</div>
                </div>`;
        });
        html += '</div>';
        el.innerHTML = html;
    }

    function renderOutletBuckets(data, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const outletRatings = {};
        data.forEach(r => {
            if (r.rating == null || r.outlet_id == null) return;
            if (!outletRatings[r.outlet_id]) outletRatings[r.outlet_id] = [];
            outletRatings[r.outlet_id].push(r.rating);
        });
        const outletAvgs = Object.values(outletRatings).map(ratings => ratings.reduce((a, b) => a + b, 0) / ratings.length);
        if (!outletAvgs.length) { el.innerHTML = '<div class="fbi-empty">No outlet data available</div>'; return; }
        const buckets = { '1': 0, '2-3': 0, '3': 0, '4-5': 0 };
        outletAvgs.forEach(avg => {
            if (avg <= 1.5) buckets['1']++;
            else if (avg < 2.5) buckets['2-3']++;
            else if (avg <= 3.5) buckets['3']++;
            else buckets['4-5']++;
        });
        const total = outletAvgs.length;
        const colors = { '1': '#dc2626', '2-3': '#f97316', '3': '#eab308', '4-5': '#22c55e' };
        const bucketLabels = { '1': 'Avg 1', '2-3': 'Avg 2-3', '3': 'Avg 3', '4-5': 'Avg 4-5' };
        const bucketOrder = ['1', '2-3', '3', '4-5'];
        const size = 180, cx = size / 2, cy = size / 2, r = 70, sw = 35;
        const circ = 2 * Math.PI * r;
        let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${sw}"/>`;
        let cumAngle = -90;
        bucketOrder.forEach(b => {
            const pct = total ? (buckets[b] / total) * 100 : 0;
            if (pct > 0) {
                const dash = (pct / 100) * circ;
                svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[b]}" stroke-width="${sw}" stroke-dasharray="${dash} ${circ}" transform="rotate(${cumAngle}, ${cx}, ${cy})" class="fb-pie-seg" title="${bucketLabels[b]}: ${buckets[b]} outlets (${pct.toFixed(0)}%)"/>`;
                cumAngle += (pct / 100) * 360;
            }
        });
        svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="fb-pie-total" font-size="28" font-weight="800">${total}</text>
            <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="fb-pie-label" font-size="11">outlets</text>`;
        let html = `<div class="fb-bucket-chart"><div class="fb-bucket-pie-wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svg}</svg></div><div class="fb-bucket-legend">`;
        bucketOrder.forEach(b => {
            const pct = total ? ((buckets[b] / total) * 100) : 0;
            if (buckets[b] > 0) {
                html += `
                    <div class="fb-bucket-legend-item">
                        <span class="fb-bucket-dot" style="background:${colors[b]}"></span>
                        <span class="fb-bucket-legend-label">${bucketLabels[b]}</span>
                        <span class="fb-bucket-legend-val">${buckets[b]} <span class="fb-bucket-legend-pct">(${pct.toFixed(0)}%)</span></span>
                    </div>`;
            }
        });
        html += '</div></div>';
        el.innerHTML = html;
    }

    function renderTopIssues(data, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const texts = getOpenEndedResponses(data);
        if (!texts.length) {
            el.innerHTML = '<div class="fbi-empty">No open-ended responses for this selection</div>';
            return;
        }

        const posThemes = [
            { pat: 'good|great|excellent|best|love|positive', label: 'Overall positive feedback' },
            { pat: 'working well|effective|benefit|help|relief|working', label: 'Product effectiveness' },
            { pat: 'visibility|display|shelf|standee|showcase|visible', label: 'In-store visibility' },
            { pat: 'offtake|sales|sell|selling|demand|rush|moving', label: 'Healthy offtake & demand' },
            { pat: 'sensodyne', label: 'Sensodyne brand traction' },
            { pat: 'panadol', label: 'Panadol consumer pull' },
            { pat: 'centrum', label: 'Centrum uptake' },
            { pat: 'voltaren', label: 'Voltaren efficacy' },
            { pat: 'otrivin|recharge|eno', label: 'Key Haleon brand strength' },
            { pat: 'recommend|prescribe|advocacy|suggest|advise', label: 'HCP recommendation' },
            { pat: 'quality|reliable|trust|confidence', label: 'Quality & trust perception' },
            { pat: 'sample|trial|sampling', label: 'Sampling & trial success' },
            { pat: 'visit|call|interaction|engagement', label: 'Field engagement' },
            { pat: 'satisfied|happy|impressed|value', label: 'Stakeholder satisfaction' },
        ];
        const negThemes = [
            { pat: 'no visit|not visited|no call|not called|never visit|never call', label: 'Insufficient MR visits' },
            { pat: 'broken|gap|fix|need to|must|requires|should', label: 'Process / system gaps' },
            { pat: 'competitor|competition|duplicate|enshine|colgate|himalaya|proctor', label: 'Competitive activity' },
            { pat: 'empty|emptied|replenish|stock|out of stock|shortage', label: 'Stock & availability gaps' },
            { pat: 'don\'t know|not aware|unaware|not sure|don\'t understand', label: 'Training / awareness gaps' },
            { pat: 'limited|less|not enough|inadequate|insufficient', label: 'Limited product availability' },
            { pat: 'complaint|issue|challenge|difficult|tough|problem', label: 'Operational challenges' },
            { pat: 'missing|absent|no show|didn\'t|lost|missed', label: 'Coverage / service gaps' },
            { pat: 'price|pricing|cost|margin|expensive|costly', label: 'Pricing sensitivity' },
            { pat: 'counterfeit|fake|spurious|duplicate brand', label: 'Counterfeit / duplicate risk' },
        ];

        const countResponses = (pat) => texts.filter(t => new RegExp(pat, 'i').test(t)).length;

        const pos = posThemes.map(t => [t.label, countResponses(t.pat), t.pat]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const neg = negThemes.map(t => [t.label, countResponses(t.pat), t.pat]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const chips = (list) => list.length
            ? list.map(([l, c, p]) => `<span class="fb-ti-chip" data-theme-pat="${escapeHtml(p)}" data-theme-label="${escapeHtml(l)}">${escapeHtml(l)}<span class="fb-ti-count">${c}</span></span>`).join('')
            : '<span class="fbi-empty" style="padding:4px 0">No issues detected in this dataset</span>';

        el.innerHTML = `
            <div class="fb-ti-grid">
                <div class="fb-ti-col positive">
                    <span class="fb-ti-col-head">Top Positive Themes</span>
                    <div class="fb-ti-list">${chips(pos)}</div>
                </div>
                <div class="fb-ti-col negative">
                    <span class="fb-ti-col-head">Areas for Improvement</span>
                    <div class="fb-ti-list">${chips(neg)}</div>
                </div>
            </div>
            <div class="fb-ti-verbatim hidden"></div>`;

        el.querySelectorAll('.fb-ti-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const pat = chip.dataset.themePat;
                const label = chip.dataset.themeLabel;
                const panel = el.querySelector('.fb-ti-verbatim');
                if (!panel || !pat) return;
                const isActive = chip.classList.contains('active');
                el.querySelectorAll('.fb-ti-chip.active').forEach(c => c.classList.remove('active'));
                if (isActive) {
                    panel.classList.add('hidden');
                    panel.innerHTML = '';
                    return;
                }
                chip.classList.add('active');
                showThemeVerbatim(pat, label, data, panel);
            });
        });
    }

    function showThemeVerbatim(pat, label, data, panel) {
        const re = new RegExp(pat, 'i');
        const matches = data.filter(r =>
            re.test(r.answer_text || '') || re.test(r.voice_text || '')
        );
        const headCount = matches.length;
        const rows = matches.slice(0, 12);
        const quotesHtml = rows.length ? rows.map(r => {
            const raw = (r.answer_text || r.voice_text || '').trim();
            const safe = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const highlighted = safe.replace(
                new RegExp('(' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
                '<mark class="fb-cloud-hl">$1</mark>'
            );
            const rep = escapeHtml(userName(r.user_id));
            const outl = escapeHtml(outletName(r.outlet_id));
            const date = escapeHtml(formatDateShort(r.created_at));
            return `<div class="fb-cloud-verbatim-quote">
                <p class="fb-cloud-verbatim-text">${highlighted}</p>
                <div class="fb-cloud-verbatim-meta">${rep} · ${outl} · ${date}</div>
            </div>`;
        }).join('') : '<p class="fbi-empty" style="padding:8px 0">No verbatim responses found.</p>';
        panel.innerHTML = `
            <div class="fb-cloud-verbatim-inner">
                <div class="fb-cloud-verbatim-head">
                    <span><strong>${headCount}</strong> response${headCount===1?'':'s'}: <strong>${escapeHtml(label)}</strong></span>
                    <button class="fb-cloud-verbatim-close" type="button" aria-label="Close">&times;</button>
                </div>
                <div class="fb-cloud-verbatim-quotes">${quotesHtml}</div>
            </div>`;
        panel.classList.remove('hidden');
        panel.querySelector('.fb-cloud-verbatim-close')?.addEventListener('click', () => {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            panel.closest('.card')?.querySelectorAll('.fb-ti-chip.active').forEach(c => c.classList.remove('active'));
        });
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function getOpenEndedResponses(data) {
        const texts = [];
        data.forEach(r => {
            if (r.answer_text && String(r.answer_text).trim()) texts.push(String(r.answer_text).trim());
            if (r.voice_text && String(r.voice_text).trim()) texts.push(String(r.voice_text).trim());
        });
        return texts;
    }

    function renderVerbatimSummary(data, cfg) {
        cfg = cfg || {};
        const texts = getOpenEndedResponses(data);
        const el = document.getElementById(cfg.elId || 'fbAiSummary');
        const scopeEl = document.getElementById(cfg.scopeElId || 'fbVerbatimScope');
        if (!el) return;
        if (texts.length === 0) {
            el.innerHTML = '<div class="fbi-empty">No open-ended responses for this selection</div>';
            if (scopeEl) scopeEl.textContent = '0 open-ended responses';
            return;
        }

        const all = texts.join(' ').toLowerCase();

        // Sentiment scoring
        let posCount = 0, negCount = 0;
        FB_POS_WORDS.forEach(w => { if (all.includes(w)) posCount++; });
        FB_NEG_WORDS.forEach(w => { if (all.includes(w)) negCount++; });
        const sentiment = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'mixed';
        const sentLabel = sentiment === 'positive' ? '🟢 Positive' : sentiment === 'negative' ? '🔴 Needs Attention' : '🟡 Mixed';

        // Actionable themes — each maps to an opportunity/risk leadership cares about
        const themeRules = [
            ['sensodyne', 'Sensodyne brand traction', 'positive', 'opportunity'],
            ['panadol', 'Panadol pull from consumers', 'positive', 'opportunity'],
            ['centrum', 'Centrum value perception', 'neutral', 'watch'],
            ['otrivin', 'Otrivin relief signal', 'neutral', 'watch'],
            ['voltaren', 'Voltaren efficacy callout', 'positive', 'opportunity'],
            ['enshine|colgate|himalaya|competitor|compet', 'Competitor activity in-store', 'negative', 'risk'],
            ['stockout|out of stock|empty|replenish|empt', 'Replenishment opportunity', 'negative', 'risk'],
            ['display|shelf|visibility|sleeve|sku|hangar|standee', 'In-store visibility & merchandising', 'positive', 'opportunity'],
            ['train|educat|learn', 'Field training opportunity', 'neutral', 'watch'],
            ['price|expensive|cost|margin', 'Pricing sensitivity', 'negative', 'risk'],
            ['recommend|prescribe|advise', 'HCP recommendation channel', 'positive', 'opportunity'],
            ['sample|trial', 'Sampling / trial programs', 'neutral', 'watch'],
            ['digital|app|qr|online', 'Digital engagement opening', 'neutral', 'opportunity'],
        ];
        const themes = [];
        themeRules.forEach(([pat, text, type, action]) => {
            if (new RegExp(pat, 'i').test(all)) themes.push({ text, type, action });
        });

        // Narrative summary tied to detected themes
        const headlineBits = [];
        if (themes.some(t => t.action === 'opportunity')) headlineBits.push('clear opportunities in brand visibility and pull');
        if (themes.some(t => /Replenishment/.test(t.text))) headlineBits.push('replenishment gaps to close');
        if (themes.some(t => /Competitor/.test(t.text))) headlineBits.push('competitor pressure in-store');
        if (themes.some(t => /Pricing/.test(t.text))) headlineBits.push('pricing sensitivity flagged');
        if (themes.some(t => /HCP/.test(t.text))) headlineBits.push('strong HCP recommendation cues');
        const narrative = headlineBits.length
            ? `Field feedback points to ${headlineBits.slice(0, 3).join(', ')}.`
            : `Open-ended responses are limited but ${sentiment === 'positive' ? 'lean positive' : sentiment === 'negative' ? 'flag concerns to follow up on' : 'paint a mixed picture'}.`;

        // Verbatim quotes — pick the 2 longest distinct responses, sanitized & truncated
        const quotes = [...new Set(texts)]
            .filter(t => t.length > 25)
            .sort((a, b) => b.length - a.length)
            .slice(0, 2)
            .map(t => t.length > 240 ? t.slice(0, 237).trim() + '…' : t);

        // Group themes into Opportunities vs Risks for executive scan
        const opportunities = themes.filter(t => t.action === 'opportunity');
        const risks = themes.filter(t => t.action === 'risk');
        const watch = themes.filter(t => t.action === 'watch');

        el.innerHTML = `
            <div class="fb-summary">
                <div class="fb-summary-row">
                    <span class="fb-summary-pill">${sentLabel}</span>
                    <span class="fb-summary-meta">${texts.length} verbatim response${texts.length === 1 ? '' : 's'}</span>
                </div>

                <p class="fb-summary-narrative">${escapeHtml(narrative)}</p>

                ${quotes.length ? `<div class="fb-summary-block">
                    <span class="fb-summary-label">Field voice</span>
                    <div class="fb-summary-quotes">
                        ${quotes.map(q => `<blockquote class="fb-quote">${escapeHtml(q)}</blockquote>`).join('')}
                    </div>
                </div>` : ''}

                ${opportunities.length || risks.length || watch.length ? `<div class="fb-summary-grid">
                    ${opportunities.length ? `<div class="fb-summary-bucket opportunity">
                        <span class="fb-summary-label">Opportunities</span>
                        <ul class="fb-summary-list">${opportunities.map(t => `<li>${escapeHtml(t.text)}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${risks.length ? `<div class="fb-summary-bucket risk">
                        <span class="fb-summary-label">Risks</span>
                        <ul class="fb-summary-list">${risks.map(t => `<li>${escapeHtml(t.text)}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${watch.length ? `<div class="fb-summary-bucket watch">
                        <span class="fb-summary-label">Watch</span>
                        <ul class="fb-summary-list">${watch.map(t => `<li>${escapeHtml(t.text)}</li>`).join('')}</ul>
                    </div>` : ''}
                </div>` : ''}
            </div>`;
        if (scopeEl) scopeEl.textContent = `${texts.length} open-ended response${texts.length === 1 ? '' : 's'} from field visits`;
    }

    const TABLE_SCOPES = {
        fb: { body: 'fbTableBody', empty: 'fbTableEmpty', wrap: '#view-dashboard .fb-table-wrap', pager: 'fbPagination', showUser: false },
        g:  { body: 'gTableBody',  empty: 'gTableEmpty',  wrap: '#view-group .fb-table-wrap',     pager: 'gPagination',  showUser: true  },
        ov: { body: 'ovTableBody', empty: 'ovTableEmpty', wrap: '#view-overall .fb-table-wrap',   pager: 'ovPagination', showUser: true  },
    };

    function userName(uid) {
        if (uid == null) return '';
        const u = _fbUsersById[uid];
        return u && u.user_name ? u.user_name : `User #${uid}`;
    }

    function renderResponsesTable(data, scope) {
        scope = scope || 'fb';
        const sc = TABLE_SCOPES[scope] || TABLE_SCOPES.fb;
        const body = document.getElementById(sc.body);
        const empty = document.getElementById(sc.empty);
        const wrap = document.querySelector(sc.wrap);
        const pager = document.getElementById(sc.pager);
        if (!body) return;

        if (!data.length) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
            if (pager) pager.innerHTML = '';
            return;
        }
        wrap?.classList.remove('hidden');
        empty?.classList.add('hidden');

        const sorted = [...data]
            .filter(r => {
                if (r.question_id == null) return false;
                const q = _fbQuestionsById[r.question_id];
                return q && q.question_text;
            })
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const totalPages = Math.max(1, Math.ceil(sorted.length / FB_PAGE_SIZE));
        if (_tablePages[scope] > totalPages) _tablePages[scope] = totalPages;
        if (_tablePages[scope] < 1) _tablePages[scope] = 1;
        const start = (_tablePages[scope] - 1) * FB_PAGE_SIZE;
        const pageRows = sorted.slice(start, start + FB_PAGE_SIZE);

        body.innerHTML = pageRows.map(r => {
            const typeClass = inferLevel(r.level, r.outlet_id);
            const stars = r.rating != null
                ? `<div class="fb-cell-stars"><span class="fb-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><span class="fb-cell-rating-val">${r.rating}/5</span></div>`
                : `<div class="fb-cell-stars fb-cell-muted">No rating</div>`;
            const responseText = r.answer_text || r.voice_text || '';
            const q = _fbQuestionsById[r.question_id];
            const qNo = q ? (q.question_no || `Q${r.question_id}`) : (r.question_id != null ? `Q${r.question_id}` : '—');
            const qText = q && q.question_text ? q.question_text : '';
            const oName = outletName(r.outlet_id);
            const oCode = outletCode(r.outlet_id);
            return `<tr>
                <td class="fb-cell-outlet" data-label="Outlet">
                    <div class="fb-cell-outlet-stack">
                        <span class="fb-cell-outlet-name">${escapeHtml(oName)}</span>
                        <div class="fb-cell-outlet-meta">
                            <span class="fb-type-badge ${typeClass}">${visitTypeLabel(typeClass)}</span>
                            <span class="fb-cell-outlet-code">${escapeHtml(oCode)}</span>
                        </div>
                    </div>
                </td>
                <td class="fb-cell-q" data-label="Question">
                    <div class="fb-q-stack">
                        <span class="fb-q-pill">${escapeHtml(qNo)}</span>
                        <span class="fb-q-text">${escapeHtml(qText)}</span>
                    </div>
                </td>
                <td class="fb-cell-resp" data-label="Response">
                    <div class="fb-cell-resp-stack">
                        ${responseText
                            ? `<p class="fb-response-text" title="${escapeHtml(responseText)}">${escapeHtml(responseText)}</p>`
                            : `<p class="fb-cell-muted fb-response-text">No verbatim response</p>`}
                        ${stars}
                    </div>
                </td>
                <td class="fb-cell-media" data-label="Media">${rowMediaChips(r)}</td>
                <td class="fb-cell-meta" data-label="Visit">
                    <div class="fb-cell-meta-stack">
                        <span class="fb-cell-meta-visit">#${r.visit_id}</span>
                        ${sc.showUser ? `<span class="fb-cell-meta-rep">${escapeHtml(userName(r.user_id))}</span>` : ''}
                        <span class="fb-cell-meta-date">${escapeHtml(formatDateShort(r.created_at))}</span>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderPagination(pager, sorted.length, totalPages, scope, sorted);
    }

    function renderPagination(pager, total, totalPages, scope, data) {
        if (!pager) return;
        scope = scope || 'fb';
        const page = _tablePages[scope];
        if (total <= FB_PAGE_SIZE) { pager.innerHTML = ''; return; }
        const start = (page - 1) * FB_PAGE_SIZE + 1;
        const end = Math.min(page * FB_PAGE_SIZE, total);
        pager.innerHTML = `
            <span class="fb-pagination-info">Showing <strong>${start}</strong>–<strong>${end}</strong> of <strong>${total}</strong></span>
            <div class="fb-pagination-controls">
                <button type="button" class="fb-page-btn" data-page-action="prev" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span class="fb-pagination-page">Page ${page} of ${totalPages}</span>
                <button type="button" class="fb-page-btn" data-page-action="next" ${page === totalPages ? 'disabled' : ''} aria-label="Next page">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>`;
        const scrollSel = scope === 'g' ? '#view-group .fb-responses-card' : scope === 'ov' ? '#view-overall .fb-responses-card' : '#view-dashboard .fb-responses-card';
        pager.querySelectorAll('[data-page-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.pageAction === 'prev' && _tablePages[scope] > 1) _tablePages[scope]--;
                if (btn.dataset.pageAction === 'next' && _tablePages[scope] < totalPages) _tablePages[scope]++;
                renderResponsesTable(data, scope);
                document.querySelector(scrollSel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function rowMediaChips(r) {
        const chips = [];
        const img = mediaUrl(r.image_path);
        const aud = mediaUrl(r.audio_path);
        const vid = mediaUrl(r.video_path);
        const q = _fbQuestionsById[r.question_id];
        const caption = q ? `${q.question_no || ''} — ${q.question_text || ''}` : `Visit #${r.visit_id}`;
        if (img) chips.push(`<button type="button" class="fb-media-chip fb-media-img-chip" data-media-kind="image" data-media-url="${escapeHtml(img)}" data-media-caption="${escapeHtml(caption)}" title="View image"><img src="${escapeHtml(img)}" loading="lazy" alt="image" onerror="this.parentElement.classList.add('errored')"></button>`);
        if (aud) chips.push(`<button type="button" class="fb-media-chip" data-media-kind="audio" data-media-url="${escapeHtml(aud)}" data-media-caption="${escapeHtml(caption)}" title="Play audio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3v5zM3 19a2 2 0 0 0 2 2h1v-7H3v5z"/></svg>
        </button>`);
        if (vid) chips.push(`<button type="button" class="fb-media-chip" data-media-kind="video" data-media-url="${escapeHtml(vid)}" data-media-caption="${escapeHtml(caption)}" title="Play video">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        </button>`);
        return chips.length ? `<div class="fb-media-chips">${chips.join('')}</div>` : '<span class="fb-cell-muted">—</span>';
    }

    // ---- Media modal (in-page lightbox) ----
    function ensureMediaModal() {
        let modal = document.getElementById('mediaModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'mediaModal';
        modal.className = 'media-modal hidden';
        modal.innerHTML = `
            <div class="media-modal-overlay" data-close="1"></div>
            <div class="media-modal-card">
                <header class="media-modal-head">
                    <span class="media-modal-caption" id="mediaModalCaption"></span>
                    <button type="button" class="media-modal-close" data-close="1" aria-label="Close">&times;</button>
                </header>
                <div class="media-modal-body" id="mediaModalBody"></div>
                <footer class="media-modal-foot">
                    <a class="media-modal-link" id="mediaModalLink" target="_blank" rel="noopener">Open in new tab</a>
                </footer>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target.dataset.close === '1') closeMediaModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeMediaModal();
        });
        return modal;
    }

    function openMediaModal(kind, url, caption) {
        const modal = ensureMediaModal();
        const body = modal.querySelector('#mediaModalBody');
        const cap = modal.querySelector('#mediaModalCaption');
        const link = modal.querySelector('#mediaModalLink');
        cap.textContent = caption || '';
        link.href = url;
        if (kind === 'image') {
            body.innerHTML = `<img src="${escapeHtml(url)}" alt="" class="media-modal-img">`;
        } else if (kind === 'audio') {
            body.innerHTML = `<audio class="media-modal-audio" controls autoplay src="${escapeHtml(url)}"></audio>`;
        } else if (kind === 'video') {
            body.innerHTML = `<video class="media-modal-video" controls autoplay src="${escapeHtml(url)}"></video>`;
        } else {
            body.innerHTML = '';
        }
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeMediaModal() {
        const modal = document.getElementById('mediaModal');
        if (!modal) return;
        modal.classList.add('hidden');
        const body = modal.querySelector('#mediaModalBody');
        if (body) body.innerHTML = '';
        document.body.style.overflow = '';
    }

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-media-url]');
        if (trigger) {
            e.preventDefault();
            openMediaModal(trigger.dataset.mediaKind, trigger.dataset.mediaUrl, trigger.dataset.mediaCaption);
        }
    });

    // ---- Filter logic ----
    function applyFeedbackFilters() {
        const level = document.querySelector('.fb-level-btn.active')?.dataset?.level || 'all';
        const outlet = document.getElementById('fbFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('fbFilterDate')?.value || 'all';

        const levelScoped = level !== 'all' ? _fbData.filter(r => inferLevel(r.level, r.outlet_id) === level) : _fbData;
        populateQuestionDropdown(levelScoped);
        repopulateUserOutletDropdowns(levelScoped, null, 'fbFilterOutlet');
        const outlet2 = document.getElementById('fbFilterOutlet')?.value || 'all';

        let filtered = [..._fbData];
        if (level !== 'all') filtered = filtered.filter(r => inferLevel(r.level, r.outlet_id) === level);
        if (outlet2 !== 'all') filtered = filtered.filter(r => r.outlet_id != null && String(r.outlet_id) === outlet2);
        if (_qFilter.fb !== 'all') {
            const qSet = new Set(String(_qFilter.fb).split(',').map(s => s.trim()));
            filtered = filtered.filter(r => r.question_id != null && qSet.has(String(r.question_id)));
        }

        if (dateRange !== 'all') {
            const now = new Date();
            const cutoff = new Date(now);
            const days = parseInt(dateRange);
            if (!isNaN(days)) cutoff.setDate(now.getDate() - days);
            filtered = filtered.filter(r => {
                if (!r.created_at) return true;
                const d = new Date(r.created_at);
                return d >= cutoff;
            });
        }

        _fbFiltered = filtered;
        _tablePages.fb = 1;

        const badge = document.getElementById('fbFilterBadge');
        const badgeText = document.getElementById('fbFilterBadgeText');
        const anyFilterActive = level !== 'all' || outlet2 !== 'all' || dateRange !== 'all' || _qFilter.fb !== 'all';
        if (anyFilterActive && badge && badgeText) {
            const parts = [];
            if (level !== 'all') parts.push(level.toUpperCase());
            if (_qFilter.fb !== 'all') {
                const firstQid = parseInt(String(_qFilter.fb).split(',')[0]);
                const q = _fbQuestionsById[firstQid];
                const qno = q ? (q.question_no || `Q${firstQid}`) : `Q${firstQid}`;
                const text = q && q.question_text ? q.question_text : '';
                const cap = text.length > 50 ? text.slice(0, 47) + '…' : text;
                parts.push(text ? `${qno} — ${cap}` : qno);
            }
            if (outlet2 !== 'all') parts.push(outletName(parseInt(outlet2)));
            if (dateRange !== 'all') parts.push('Last ' + dateRange.replace('d', ' days'));
            const prefix = parts.length ? parts.join(' · ') + ' · ' : '';
            const uniqueVisitCount = new Set(filtered.map(r => r.visit_id)).size;
            badgeText.textContent = `${prefix}${uniqueVisitCount} feedback${uniqueVisitCount === 1 ? '' : 's'}`;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }

        if (typeof updateFiltersCount === 'function') updateFiltersCount();
        renderDashboard();
    }

    function getQuestionIdsInData(data) {
        const ids = new Set();
        data.forEach(r => { if (r.question_id != null) ids.add(r.question_id); });
        return [...ids].sort((a, b) => a - b);
    }

    function normaliseQuestionText(t) {
        return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.?!]+$/, '');
    }

    function populateQuestionDropdown(scopedData, scope) {
        scope = scope || 'fb';
        const sel = document.getElementById(scope === 'g' ? 'gFilterQuestion' : scope === 'ov' ? 'ovFilterQuestion' : 'fbFilterQuestion');
        if (!sel) return;
        const ids = getQuestionIdsInData(scopedData);

        // Group by normalised question text. Fallback to per-qid when text missing.
        const groups = new Map(); // key -> { qids:[], label, qno }
        ids.forEach(id => {
            const q = _fbQuestionsById[id];
            if (!q || !q.question_text) return; // skip orphan question_ids with no text
            const text = q.question_text;
            const qno = q.question_no || `Q${id}`;
            const key = normaliseQuestionText(text);
            if (!groups.has(key)) {
                groups.set(key, { qids: [], label: `${qno} — ${text}`, qno, text });
            }
            groups.get(key).qids.push(id);
        });

        const options = [...groups.values()].sort((a, b) => a.qno.localeCompare(b.qno, undefined, { numeric: true }));

        const prev = _qFilter[scope];
        sel.innerHTML = '<option value="all">All Questions</option>' +
            options.map(o => {
                const value = o.qids.join(',');
                return `<option value="${escapeHtml(value)}" title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</option>`;
            }).join('');

        // Preserve previous selection if its qid set is still present
        if (prev !== 'all' && options.some(o => o.qids.join(',') === prev)) {
            sel.value = prev;
        } else if (prev !== 'all') {
            // Maybe previous was a single qid still available as part of a group
            const prevIds = String(prev).split(',').map(s => s.trim());
            const match = options.find(o => prevIds.every(p => o.qids.map(String).includes(p)));
            if (match) {
                _qFilter[scope] = match.qids.join(',');
                sel.value = _qFilter[scope];
            } else {
                sel.value = 'all';
                _qFilter[scope] = 'all';
            }
        } else {
            sel.value = 'all';
        }
    }

    function populateFilterDropdowns() {
        const outlets = new Set();
        _fbData.forEach(r => { if (r.outlet_id != null) outlets.add(String(r.outlet_id)); });
        const outletSel = document.getElementById('fbFilterOutlet');
        if (outletSel) {
            outletSel.innerHTML = '<option value="all">All Outlets</option>';
            [...outlets].sort((a, b) => Number(a) - Number(b)).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o; opt.textContent = outletName(parseInt(o));
                outletSel.appendChild(opt);
            });
        }
        populateQuestionDropdown(_fbData);
    }

    document.querySelectorAll('.fb-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.fb-level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFeedbackFilters();
        });
    });
    document.getElementById('fbFilterOutlet')?.addEventListener('change', applyFeedbackFilters);
    document.getElementById('fbFilterDate')?.addEventListener('change', applyFeedbackFilters);
    document.getElementById('fbFilterQuestion')?.addEventListener('change', (e) => {
        _qFilter.fb = e.target.value || 'all';
        applyFeedbackFilters();
    });
    // ---- Filters toggle (mobile collapsible) ----
    const filtersToggle = document.getElementById('fbFiltersToggle');
    const filtersGroup = document.getElementById('fbFiltersGroup');
    filtersToggle?.addEventListener('click', () => {
        const open = filtersGroup?.classList.toggle('is-open');
        filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    function updateFiltersCount() {
        const countEl = document.getElementById('fbFiltersCount');
        if (!countEl) return;
        const level = document.querySelector('.fb-level-btn.active')?.dataset?.level || 'all';
        const outlet = document.getElementById('fbFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('fbFilterDate')?.value || 'all';
        let n = 0;
        if (level !== 'all') n++;
        if (outlet !== 'all') n++;
        if (dateRange !== 'all') n++;
        if (_qFilter.fb !== 'all') n++;
        if (n > 0) {
            countEl.textContent = n;
            countEl.classList.add('is-active');
        } else {
            countEl.textContent = '';
            countEl.classList.remove('is-active');
        }
    }

    document.getElementById('fbFilterClearBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.fb-level-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.fb-level-btn[data-level="all"]')?.classList.add('active');
        ['fbFilterOutlet','fbFilterDate','fbFilterQuestion'].forEach(id => {
            const e = document.getElementById(id); if (e) e.value = 'all';
        });
        _qFilter.fb = 'all';
        applyFeedbackFilters();
    });

    // ---- Visits list ----
    function getVisitsSummary() {
        const byVisit = {};
        _fbData.forEach(r => {
            const vid = r.visit_id;
            if (vid == null) return;
            if (!byVisit[vid]) {
                byVisit[vid] = {
                    visit_id: vid,
                    outlet_id: r.outlet_id,
                    level: r.level,
                    created_at: r.created_at,
                    total_answers: 0,
                };
            }
            byVisit[vid].total_answers += 1;
            if (!byVisit[vid].created_at) byVisit[vid].created_at = r.created_at;
        });
        return Object.values(byVisit).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    function renderVisitsList() {
        const visits = getVisitsSummary();
        const body = document.getElementById('visitsTableBody');
        const empty = document.getElementById('visitsTableEmpty');
        const wrap = document.querySelector('#view-visits .fb-table-wrap');
        const countEl = document.getElementById('visitsCount');
        if (countEl) countEl.textContent = `${visits.length} visit${visits.length === 1 ? '' : 's'}`;
        if (!body) return;

        if (!visits.length) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
            return;
        }
        wrap?.classList.remove('hidden');
        empty?.classList.add('hidden');

        body.innerHTML = visits.map(v => {
            const lvl = inferLevel(v.level, v.outlet_id);
            return `<tr>
                <td data-label="Visit ID" style="font-weight:700">${v.visit_id}</td>
                <td data-label="Outlet Code" style="font-size:0.85rem;color:var(--text-secondary)">${escapeHtml(outletCode(v.outlet_id))}</td>
                <td data-label="Outlet Name">${escapeHtml(outletName(v.outlet_id))}</td>
                <td data-label="Visit Type"><span class="fb-type-badge ${lvl}">${visitTypeLabel(lvl)}</span></td>
                <td data-label="Answers">${v.total_answers}</td>
                <td data-label="Date" style="font-size:0.85rem;color:var(--text-secondary);white-space:nowrap">${formatDateLong(v.created_at)}</td>
                <td data-label="Action" class="ta-right"><button class="btn btn-sm btn-ghost" data-visit-view="${v.visit_id}">View</button></td>
            </tr>`;
        }).join('');

        body.querySelectorAll('[data-visit-view]').forEach(btn => {
            btn.addEventListener('click', () => openVisitDetail(parseInt(btn.dataset.visitView)));
        });
    }

    // ---- Visit detail ----
    async function openVisitDetail(visitId) {
        showView('visit-detail');
        const qaEl = document.getElementById('visitDetailQa');
        const outletGrid = document.getElementById('visitOutletGrid');
        if (qaEl) qaEl.innerHTML = '<div class="fbi-empty">Loading…</div>';
        if (outletGrid) outletGrid.innerHTML = '';
        try {
            const res = await fetch(`/api/visit/${visitId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            renderVisitDetail(data);
        } catch (e) {
            console.warn('Visit detail load failed:', e);
            if (qaEl) qaEl.innerHTML = `<div class="fbi-empty">Could not load visit ${visitId}.</div>`;
        }
    }

    function renderVisitDetail(data) {
        const titleEl = document.getElementById('visitDetailTitle');
        if (titleEl) titleEl.textContent = `Feedback Details · Visit #${data.visit_id}`;

        const outlet = _fbOutletsById[data.outlet_id] || {};
        const lvl = inferLevel(data.level, data.outlet_id);
        const outletGrid = document.getElementById('visitOutletGrid');
        const pairs = [
            ['Outlet Code', outlet.outlet_code || '—'],
            ['Outlet Name', outlet.outlet_name || (data.outlet_id != null ? `Outlet #${data.outlet_id}` : '—')],
            ['Owner', outlet.owner_name || '—'],
            ['Mobile', outlet.mobile || '—'],
            ['Visit Type', visitTypeLabel(lvl)],
            ['Channel', outlet.channel || '—'],
            ['Address', [outlet.address, outlet.city, outlet.state].filter(Boolean).join(', ') || '—'],
            ['Visited On', formatDateLong(data.created_at)],
        ];
        if (outletGrid) {
            outletGrid.innerHTML = pairs.map(([k, v]) => `
                <div class="visit-outlet-cell">
                    <span class="visit-outlet-key">${escapeHtml(k)}</span>
                    <span class="visit-outlet-val">${escapeHtml(v)}</span>
                </div>`).join('');
        }

        const qaEl = document.getElementById('visitDetailQa');
        if (!qaEl) return;
        const answers = data.answers || [];
        if (!answers.length) {
            qaEl.innerHTML = '<div class="card"><div class="fbi-empty">No answers recorded for this visit.</div></div>';
            return;
        }

        qaEl.innerHTML = answers.map(a => {
            const q = _fbQuestionsById[a.question_id] || {};
            const qno = q.question_no || `Q${a.question_id}`;
            const qtext = q.question_text || '';
            const ratingBlock = a.rating != null
                ? `<div class="qa-rating"><span class="qa-stars">${'★'.repeat(a.rating)}${'☆'.repeat(5 - a.rating)}</span><span class="qa-rating-val">${a.rating} Rating</span></div>`
                : '';
            const textAnswer = a.answer_text && String(a.answer_text).trim() ? escapeHtml(a.answer_text) : '<span class="qa-empty">—</span>';
            const voiceAnswer = a.voice_text && String(a.voice_text).trim()
                ? `<div class="qa-section"><span class="qa-section-label">Transcribed Voice Text</span><p class="qa-voice">${escapeHtml(a.voice_text)}</p></div>`
                : '';
            return `
                <div class="card qa-card">
                    <div class="qa-header">
                        <span class="qa-tag">${escapeHtml(qno)}</span>
                        <h4 class="qa-question">${escapeHtml(qtext) || 'Question'}</h4>
                    </div>
                    ${ratingBlock}
                    <div class="qa-section">
                        <span class="qa-section-label">Submitted Answer</span>
                        <p class="qa-answer">${textAnswer}</p>
                    </div>
                    ${voiceAnswer}
                    <div class="qa-media-row">
                        ${mediaBlock('Image Capture', a.image_path, 'image', `${qno} — ${qtext || 'Image'}`)}
                        ${mediaBlock('Video Recording', a.video_path, 'video', `${qno} — ${qtext || 'Video'}`)}
                        ${mediaBlock('Audio Note', a.audio_path, 'audio', `${qno} — ${qtext || 'Audio'}`)}
                    </div>
                </div>`;
        }).join('');
    }

    const MEDIA_BASE_URL = 'https://market.iearnportal.com';

    function mediaUrl(path) {
        if (!path) return null;
        const p = String(path).trim();
        if (!p || p === 'NULL') return null;
        if (/^https?:\/\//i.test(p)) return p;
        return MEDIA_BASE_URL + (p.startsWith('/') ? p : '/' + p);
    }

    function mediaBlock(label, path, kind, caption) {
        const url = mediaUrl(path);
        if (!url) {
            return `<div class="qa-media qa-media-${kind}">
                <span class="qa-media-label">${escapeHtml(label)}</span>
                <span class="qa-media-val empty">—</span>
            </div>`;
        }
        let player = '';
        const cap = caption || label;
        if (kind === 'image') {
            player = `<button type="button" class="qa-media-img" data-media-kind="image" data-media-url="${escapeHtml(url)}" data-media-caption="${escapeHtml(cap)}" aria-label="${escapeHtml(label)}">
                <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('qa-media-err')">
            </button>`;
        } else if (kind === 'audio') {
            player = `<audio class="qa-media-audio-el" controls preload="none" src="${escapeHtml(url)}"></audio>`;
        } else if (kind === 'video') {
            player = `<button type="button" class="qa-media-video-btn" data-media-kind="video" data-media-url="${escapeHtml(url)}" data-media-caption="${escapeHtml(cap)}" aria-label="${escapeHtml(label)}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                Play video
            </button>`;
        }
        return `<div class="qa-media qa-media-${kind} has">
            <span class="qa-media-label">${escapeHtml(label)}</span>
            ${player}
        </div>`;
    }

    document.getElementById('visitDetailBack')?.addEventListener('click', () => showView('visits'));

    document.getElementById('visitDetailExport')?.addEventListener('click', () => {
        const title = document.getElementById('visitDetailTitle')?.textContent || 'visit';
        const idMatch = title.match(/#(\d+)/);
        if (!idMatch) return;
        const vid = parseInt(idMatch[1]);
        const rows = _fbData.filter(r => r.visit_id === vid);
        exportCsv(rows, `visit_${vid}.csv`);
    });

    // ---- Export CSV (dashboard) ----
    function exportCsv(rows, filename) {
        if (!rows.length) return;
        const headers = ['visit_id','outlet_code','outlet_name','question_no','question_text','rating','answer_text','voice_text','created_at'];
        let csv = headers.join(',') + '\n';
        rows.forEach(r => {
            const q = _fbQuestionsById[r.question_id] || {};
            const o = _fbOutletsById[r.outlet_id] || {};
            const enriched = {
                visit_id: r.visit_id,
                outlet_code: o.outlet_code || '',
                outlet_name: o.outlet_name || '',
                question_no: q.question_no || '',
                question_text: q.question_text || '',
                rating: r.rating,
                answer_text: r.answer_text,
                voice_text: r.voice_text,
                created_at: r.created_at,
            };
            const row = headers.map(h => {
                const val = enriched[h] != null ? enriched[h] : '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csv += row.join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    document.getElementById('fbDownloadBtn')?.addEventListener('click', () => {
        exportCsv(_fbFiltered, 'feedback_responses.csv');
    });

    document.getElementById('sidebarLogout')?.addEventListener('click', () => {
        showNotice('Logout is a placeholder in this UAT build.', 'info');
    });

    // ====================================================================
    //  GROUP FEEDBACK (across users)
    //  Reuses the single-user render helpers; only data scope + a handful
    //  of extra cards (word cloud, sentiment keywords, rep filter) differ.
    // ====================================================================
    async function loadGroupData() {
        try {
            const res = await fetch('/api/feedback-data-all');
            if (!res.ok) throw new Error('Failed to load feedback data');
            const json = await res.json();
            _gAllData = json.data || [];
            _gData = [..._gAllData];
            _ovFiltered = [..._gAllData];
            populateGroupFilterDropdowns();
            populateGroupOptions('gFilterGroup', '2');
            populateGroupOptions('ovFilterGroup', 'all');
            applyGroupFilters();
            populateOverallFilterDropdowns();
            applyOverallFilters();
        } catch (e) {
            console.warn('Could not load group feedback data:', e);
            ['gKpiRow', 'gQuestionAvgRating', 'gOutletBuckets', 'gRatingDist', 'gAiSummary', 'gTopIssues', 'gTableBody']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '<div class="fbi-empty">Failed to load team feedback data.</div>';
                });
        }
    }

    function populateGroupFilterDropdowns() {
        const outlets = new Set();
        const users = new Set();
        _gData.forEach(r => {
            if (r.outlet_id != null) outlets.add(String(r.outlet_id));
            if (r.user_id != null) users.add(String(r.user_id));
        });
        const outletSel = document.getElementById('gFilterOutlet');
        if (outletSel) {
            outletSel.innerHTML = '<option value="all">All Outlets</option>';
            [...outlets].sort((a, b) => Number(a) - Number(b)).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o; opt.textContent = outletName(parseInt(o));
                outletSel.appendChild(opt);
            });
        }
        const userSel = document.getElementById('gFilterUser');
        if (userSel) {
            userSel.innerHTML = '<option value="all">All Reps</option>';
            [...users]
                .sort((a, b) => userName(parseInt(a)).localeCompare(userName(parseInt(b))))
                .forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u; opt.textContent = userName(parseInt(u));
                    userSel.appendChild(opt);
                });
        }
        populateQuestionDropdown(_gAllData, 'g');
    }

    function repopulateUserOutletDropdowns(data, userSelId, outletSelId) {
        if (userSelId) {
            const sel = document.getElementById(userSelId);
            if (sel) {
                const prev = sel.value;
                const users = new Set();
                data.forEach(r => { if (r.user_id != null) users.add(String(r.user_id)); });
                sel.innerHTML = '<option value="all">All Respondents</option>';
                [...users]
                    .sort((a, b) => userName(parseInt(a)).localeCompare(userName(parseInt(b))))
                    .forEach(u => {
                        const opt = document.createElement('option');
                        opt.value = u; opt.textContent = userName(parseInt(u));
                        sel.appendChild(opt);
                    });
                sel.value = users.has(prev) ? prev : 'all';
            }
        }
        if (outletSelId) {
            const sel = document.getElementById(outletSelId);
            if (sel) {
                const prev = sel.value;
                const outlets = new Set();
                data.forEach(r => { if (r.outlet_id != null) outlets.add(String(r.outlet_id)); });
                sel.innerHTML = '<option value="all">All Outlets</option>';
                [...outlets]
                    .sort((a, b) => Number(a) - Number(b))
                    .forEach(o => {
                        const opt = document.createElement('option');
                        opt.value = o; opt.textContent = outletName(parseInt(o));
                        sel.appendChild(opt);
                    });
                sel.value = outlets.has(prev) ? prev : 'all';
            }
        }
    }

    function populateGroupOptions(selectId, defaultVal) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const groups = new Set();
        Object.values(_fbUsersById).forEach(u => {
            const g = u.group;
            if (g) groups.add(String(g));
        });
        sel.innerHTML = '<option value="all">All Groups</option>';
        [...groups].sort().forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = `Group ${g}`;
            sel.appendChild(opt);
        });
        if (defaultVal && defaultVal !== 'all') sel.value = defaultVal;
    }

    function applyGroupFilters() {
        const level = document.querySelector('.g-level-btn.active')?.dataset?.level || 'all';
        const group = document.getElementById('gFilterGroup')?.value || 'all';
        const user = document.getElementById('gFilterUser')?.value || 'all';
        const outlet = document.getElementById('gFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('gFilterDate')?.value || 'all';

        // Group tab always restricts to users who belong to any group
        let filtered = _gAllData.filter(r => {
            const u = _fbUsersById[r.user_id];
            return u && u.group;
        });
        if (group !== 'all') filtered = filtered.filter(r => {
            const u = _fbUsersById[r.user_id];
            return String(u.group) === group;
        });

        const levelScoped = level !== 'all' ? filtered.filter(r => inferLevel(r.level, r.outlet_id) === level) : filtered;
        populateQuestionDropdown(levelScoped, 'g');
        repopulateUserOutletDropdowns(levelScoped, 'gFilterUser', 'gFilterOutlet');
        // Re-read after cascade repopulation (selection may have been reset)
        const user2 = document.getElementById('gFilterUser')?.value || 'all';
        const outlet2 = document.getElementById('gFilterOutlet')?.value || 'all';
        if (level !== 'all') filtered = filtered.filter(r => inferLevel(r.level, r.outlet_id) === level);
        if (user2 !== 'all') filtered = filtered.filter(r => r.user_id != null && String(r.user_id) === user2);
        if (outlet2 !== 'all') filtered = filtered.filter(r => r.outlet_id != null && String(r.outlet_id) === outlet2);
        if (_qFilter.g !== 'all') {
            const qSet = new Set(String(_qFilter.g).split(',').map(s => s.trim()));
            filtered = filtered.filter(r => r.question_id != null && qSet.has(String(r.question_id)));
        }
        if (dateRange !== 'all') {
            const now = new Date();
            const cutoff = new Date(now);
            const days = parseInt(dateRange);
            if (!isNaN(days)) cutoff.setDate(now.getDate() - days);
            filtered = filtered.filter(r => {
                if (!r.created_at) return true;
                return new Date(r.created_at) >= cutoff;
            });
        }

        _gFiltered = filtered;
        _tablePages.g = 1;

        const badge = document.getElementById('gFilterBadge');
        const badgeText = document.getElementById('gFilterBadgeText');
        const anyActive = level !== 'all' || group !== 'all' || user2 !== 'all' || outlet2 !== 'all' || dateRange !== 'all' || _qFilter.g !== 'all';
        if (anyActive && badge && badgeText) {
            const parts = [];
            if (level !== 'all') parts.push(level.toUpperCase());
            if (group !== 'all') parts.push(`Group ${group}`);
            if (user2 !== 'all') parts.push(userName(parseInt(user2)));
            if (_qFilter.g !== 'all') {
                const firstQid = parseInt(String(_qFilter.g).split(',')[0]);
                const q = _fbQuestionsById[firstQid];
                const qno = q ? (q.question_no || `Q${firstQid}`) : `Q${firstQid}`;
                const text = q && q.question_text ? q.question_text : '';
                const cap = text.length > 50 ? text.slice(0, 47) + '…' : text;
                parts.push(text ? `${qno} — ${cap}` : qno);
            }
            if (outlet2 !== 'all') parts.push(outletName(parseInt(outlet2)));
            if (dateRange !== 'all') parts.push('Last ' + dateRange.replace('d', ' days'));
            const prefix = parts.length ? parts.join(' · ') + ' · ' : '';
            const uniqueVisitCount = new Set(filtered.map(r => r.visit_id)).size;
            badgeText.textContent = `${prefix}${uniqueVisitCount} feedback${uniqueVisitCount === 1 ? '' : 's'}`;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }

        updateGroupFiltersCount();
        renderGroupDashboard();
    }

    function updateGroupFiltersCount() {
        const countEl = document.getElementById('gFiltersCount');
        if (!countEl) return;
        const level = document.querySelector('.g-level-btn.active')?.dataset?.level || 'all';
        const group = document.getElementById('gFilterGroup')?.value || 'all';
        const user = document.getElementById('gFilterUser')?.value || 'all';
        const outlet = document.getElementById('gFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('gFilterDate')?.value || 'all';
        let n = 0;
        if (level !== 'all') n++;
        if (group !== 'all') n++;
        if (user !== 'all') n++;
        if (outlet !== 'all') n++;
        if (dateRange !== 'all') n++;
        if (_qFilter.g !== 'all') n++;
        if (n > 0) { countEl.textContent = n; countEl.classList.add('is-active'); }
        else { countEl.textContent = ''; countEl.classList.remove('is-active'); }
    }

    function renderGroupDashboard() {
        const data = _gFiltered;
        if (!data.length) {
            ['gKpiRow', 'gQuestionAvgRating', 'gOutletBuckets', 'gRatingDist', 'gAiSummary', 'gTopIssues']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '<div class="fbi-empty">No team feedback for the current selection.</div>';
                });
            renderResponsesTable([], 'g');
            return;
        }

        const ratings = data.filter(r => r.rating != null).map(r => r.rating);
        const ratingsDist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
        ratings.forEach(r => { if (ratingsDist[r] != null) ratingsDist[r]++; });
        const totalRatings = ratings.length;
        const avgRating = totalRatings ? ratings.reduce((a, b) => a + b, 0) / totalRatings : 0;

        const uniqueOutlets = new Set(data.map(r => r.outlet_id != null ? String(r.outlet_id) : null).filter(Boolean));
        const uniqueVisits = new Set(data.map(r => r.visit_id));
        const uniqueUsers = new Set(data.map(r => r.user_id != null ? String(r.user_id) : null).filter(Boolean));

        renderKpis({
            avgRating, totalRatings,
            respondents: uniqueUsers.size,
            outlets: uniqueOutlets.size,
            feedbacks: uniqueVisits.size,
        }, 'gKpiRow', { label: 'Respondents', sub: 'respondents contributing feedback' });
        renderQuestionAvgRating(data, 'gQuestionAvgRating');
        renderOutletBuckets(data, 'gOutletBuckets');
        renderRatingDist(ratingsDist, totalRatings, 'gRatingDist');
        renderVerbatimSummary(data, { elId: 'gAiSummary', scopeElId: 'gVerbatimScope' });
        renderTopIssues(data, 'gTopIssues');
        renderResponsesTable(data, 'g');
    }

    // Word cloud — frequency-sized terms from open-ended responses
    function normaliseToken(raw) {
        // Strip possessive apostrophe ("brand's" → "brands") and curly quotes
        let w = raw.replace(/[''`]/g, '').toLowerCase();
        // Drop purely numeric tokens
        if (/^\d+$/.test(w)) return null;
        // Collapse common suffix forms to a base (basic stemming)
        if (w.length > 7 && w.endsWith('tion'))  return w;          // keep "-tion" words intact
        if (w.length > 7 && w.endsWith('ness'))  return w;          // keep "-ness" words intact
        if (w.length > 7 && w.endsWith('ment'))  return w;          // keep "-ment" words intact
        if (w.length > 6 && w.endsWith('ing'))   w = w.slice(0,-3); // selling → sell
        else if (w.length > 5 && w.endsWith('ed')) w = w.slice(0,-2); // visited → visit
        else if (w.length > 5 && w.endsWith('ies')) w = w.slice(0,-3) + 'y'; // activities → activity
        else if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us'))
            w = w.slice(0,-1); // outlets → outlet  (skip: success, class, focus)
        return w;
    }

    function renderWordCloud(data, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const texts = getOpenEndedResponses(data);
        if (!texts.length) {
            el.innerHTML = '<div class="fbi-empty">Not enough open-ended text for a word cloud yet.</div>';
            return;
        }
        // Clean text: lowercase, strip non-alpha (keep spaces), split
        const rawTokens = texts.join(' ')
            .replace(/[''`]/g, '')
            .replace(/[^a-zA-Z\s]/g, ' ')
            .toLowerCase()
            .split(/\s+/);

        const freq = {};
        rawTokens.forEach(raw => {
            if (!raw) return;
            const base = normaliseToken(raw);
            if (!base || base.length < 4) return;
            if (FB_STOP_WORDS.has(raw) || FB_STOP_WORDS.has(base)) return;
            freq[base] = (freq[base] || 0) + 1;
        });

        const words = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 45);
        if (words.length < 5) {
            el.innerHTML = '<div class="fbi-empty">Not enough open-ended text for a word cloud yet.</div>';
            return;
        }
        const max = words[0][1];
        const palette = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#db2777'];
        // Clear any open verbatim panel on re-render
        const verbatimPanel = el.parentElement?.querySelector('.fb-cloud-verbatim');
        if (verbatimPanel) { verbatimPanel.classList.add('hidden'); verbatimPanel.innerHTML = ''; }

        el.innerHTML = words.map(([w, c], i) => {
            const scale = c / max;
            const size = (0.85 + scale * 1.6).toFixed(2);
            const opacity = (0.6 + scale * 0.4).toFixed(2);
            const color = palette[i % palette.length];
            return `<span class="fb-word-item" data-cloud-word="${escapeHtml(w)}" style="font-size:${size}rem;opacity:${opacity};color:${color};background:${color}14;animation-delay:${(i * 0.015).toFixed(2)}s" title="${c} mention${c === 1 ? '' : 's'}">${escapeHtml(w)}</span>`;
        }).join('');

        // Click → show verbatim panel
        if (verbatimPanel) {
            el.querySelectorAll('.fb-word-item').forEach(span => {
                span.addEventListener('click', () => {
                    const word = span.dataset.cloudWord;
                    const isActive = span.classList.contains('active');
                    el.querySelectorAll('.fb-word-item.active').forEach(w => w.classList.remove('active'));
                    if (isActive) { verbatimPanel.classList.add('hidden'); verbatimPanel.innerHTML = ''; return; }
                    span.classList.add('active');
                    showWordVerbatim(word, data, verbatimPanel);
                });
            });
        }
    }

    // Show verbatim responses containing a word inside the given panel element
    function showWordVerbatim(word, data, panel) {
        // Prefix-match: "outlet" matches "outlet", "outlets", "outletting" etc.
        const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const matches = data.filter(r =>
            re.test(r.answer_text || '') || re.test(r.voice_text || '')
        );

        const headCount = matches.length;
        const rows = matches.slice(0, 12);

        const quotesHtml = rows.length ? rows.map(r => {
            const raw = (r.answer_text || r.voice_text || '').trim();
            // Escape HTML then highlight — safe because word is alphabetic
            const safe = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const highlighted = safe.replace(
                new RegExp('(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*)', 'gi'),
                '<mark class="fb-cloud-hl">$1</mark>'
            );
            const rep  = escapeHtml(userName(r.user_id));
            const outl = escapeHtml(outletName(r.outlet_id));
            const date = escapeHtml(formatDateShort(r.created_at));
            return `<div class="fb-cloud-verbatim-quote">
                <p class="fb-cloud-verbatim-text">${highlighted}</p>
                <div class="fb-cloud-verbatim-meta">${rep} · ${outl} · ${date}</div>
            </div>`;
        }).join('') : '<p class="fbi-empty" style="padding:8px 0">No verbatim responses found.</p>';

        panel.innerHTML = `
            <div class="fb-cloud-verbatim-inner">
                <div class="fb-cloud-verbatim-head">
                    <span><strong>${headCount}</strong> response${headCount===1?'':'s'} mentioning "<strong>${escapeHtml(word)}</strong>"</span>
                    <button class="fb-cloud-verbatim-close" type="button" aria-label="Close">&times;</button>
                </div>
                <div class="fb-cloud-verbatim-quotes">${quotesHtml}</div>
            </div>`;
        panel.classList.remove('hidden');
        panel.querySelector('.fb-cloud-verbatim-close')?.addEventListener('click', () => {
            panel.classList.add('hidden');
            panel.innerHTML = '';
            panel.closest('.card')?.querySelectorAll('.fb-word-item.active').forEach(w => w.classList.remove('active'));
        });
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Positive / negative keyword chips with occurrence counts
    function renderKeywords(data, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const all = getOpenEndedResponses(data).join(' ').toLowerCase();
        if (!all.trim()) {
            el.innerHTML = '<div class="fbi-empty">No open-ended responses for this selection</div>';
            return;
        }
        const countWord = (w) => (all.match(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        const pos = FB_POS_WORDS.map(w => [w, countWord(w)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
        const neg = FB_NEG_WORDS.map(w => [w, countWord(w)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
        const chips = (list) => list.length
            ? list.map(([w, c]) => `<span class="fb-kw-chip">${escapeHtml(w)}<span class="fb-kw-count">${c}</span></span>`).join('')
            : '<span class="fbi-empty fb-kw-empty">None detected</span>';
        el.innerHTML = `
            <div class="fb-keywords">
                <div class="fb-kw-col positive">
                    <span class="fb-summary-label">Positive</span>
                    <div class="fb-kw-list">${chips(pos)}</div>
                </div>
                <div class="fb-kw-col negative">
                    <span class="fb-summary-label">Negative</span>
                    <div class="fb-kw-list">${chips(neg)}</div>
                </div>
            </div>`;
    }

    // ---- Group event wiring ----
    document.querySelectorAll('.g-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.g-level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyGroupFilters();
        });
    });
    document.getElementById('gFilterGroup')?.addEventListener('change', applyGroupFilters);
    document.getElementById('gFilterUser')?.addEventListener('change', applyGroupFilters);
    document.getElementById('gFilterOutlet')?.addEventListener('change', applyGroupFilters);
    document.getElementById('gFilterDate')?.addEventListener('change', applyGroupFilters);
    document.getElementById('gFilterQuestion')?.addEventListener('change', (e) => {
        _qFilter.g = e.target.value || 'all';
        applyGroupFilters();
    });
    const gFiltersToggle = document.getElementById('gFiltersToggle');
    const gFiltersGroup = document.getElementById('gFiltersGroup');
    gFiltersToggle?.addEventListener('click', () => {
        const open = gFiltersGroup?.classList.toggle('is-open');
        gFiltersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.getElementById('gFilterClearBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.g-level-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.g-level-btn[data-level="all"]')?.classList.add('active');
        ['gFilterGroup','gFilterUser','gFilterOutlet','gFilterDate','gFilterQuestion'].forEach(id => {
            const e = document.getElementById(id); if (e) e.value = 'all';
        });
        _qFilter.g = 'all';
        applyGroupFilters();
    });
    document.getElementById('gDownloadBtn')?.addEventListener('click', () => {
        exportCsv(_gFiltered, 'group_feedback_responses.csv');
    });

    // ====================================================================
    //  OVERALL FEEDBACK TAB (all respondents, replica of group tab)
    // ====================================================================
    function populateOverallFilterDropdowns() {
        const outlets = new Set();
        const users = new Set();
        _gAllData.forEach(r => {
            if (r.outlet_id != null) outlets.add(String(r.outlet_id));
            if (r.user_id != null) users.add(String(r.user_id));
        });
        const outletSel = document.getElementById('ovFilterOutlet');
        if (outletSel) {
            outletSel.innerHTML = '<option value="all">All Outlets</option>';
            [...outlets].sort((a, b) => Number(a) - Number(b)).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o; opt.textContent = outletName(parseInt(o));
                outletSel.appendChild(opt);
            });
        }
        const userSel = document.getElementById('ovFilterUser');
        if (userSel) {
            userSel.innerHTML = '<option value="all">All Respondents</option>';
            [...users]
                .sort((a, b) => userName(parseInt(a)).localeCompare(userName(parseInt(b))))
                .forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u; opt.textContent = userName(parseInt(u));
                    userSel.appendChild(opt);
                });
        }
        populateQuestionDropdown(_gAllData, 'ov');
    }

    function applyOverallFilters() {
        const level = document.querySelector('.ov-level-btn.active')?.dataset?.level || 'all';
        const group = document.getElementById('ovFilterGroup')?.value || 'all';
        const user = document.getElementById('ovFilterUser')?.value || 'all';
        const outlet = document.getElementById('ovFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('ovFilterDate')?.value || 'all';

        let filtered = [..._gAllData];
        if (group !== 'all') filtered = filtered.filter(r => {
            const u = _fbUsersById[r.user_id];
            return u && String(u.group || '') === group;
        });

        const levelScoped = level !== 'all' ? filtered.filter(r => inferLevel(r.level, r.outlet_id) === level) : filtered;
        populateQuestionDropdown(levelScoped, 'ov');
        repopulateUserOutletDropdowns(levelScoped, 'ovFilterUser', 'ovFilterOutlet');
        const user2 = document.getElementById('ovFilterUser')?.value || 'all';
        const outlet2 = document.getElementById('ovFilterOutlet')?.value || 'all';
        if (level !== 'all') filtered = filtered.filter(r => inferLevel(r.level, r.outlet_id) === level);
        if (user2 !== 'all') filtered = filtered.filter(r => r.user_id != null && String(r.user_id) === user2);
        if (outlet2 !== 'all') filtered = filtered.filter(r => r.outlet_id != null && String(r.outlet_id) === outlet2);
        if (_qFilter.ov !== 'all') {
            const qSet = new Set(String(_qFilter.ov).split(',').map(s => s.trim()));
            filtered = filtered.filter(r => r.question_id != null && qSet.has(String(r.question_id)));
        }
        if (dateRange !== 'all') {
            const now = new Date();
            const cutoff = new Date(now);
            const days = parseInt(dateRange);
            if (!isNaN(days)) cutoff.setDate(now.getDate() - days);
            filtered = filtered.filter(r => {
                if (!r.created_at) return true;
                return new Date(r.created_at) >= cutoff;
            });
        }

        _ovFiltered = filtered;
        _tablePages.ov = 1;

        const badge = document.getElementById('ovFilterBadge');
        const badgeText = document.getElementById('ovFilterBadgeText');
        const anyActive = level !== 'all' || group !== 'all' || user2 !== 'all' || outlet2 !== 'all' || dateRange !== 'all' || _qFilter.ov !== 'all';
        if (anyActive && badge && badgeText) {
            const parts = [];
            if (level !== 'all') parts.push(level.toUpperCase());
            if (group !== 'all') parts.push(`Group ${group}`);
            if (user2 !== 'all') parts.push(userName(parseInt(user2)));
            if (_qFilter.ov !== 'all') {
                const firstQid = parseInt(String(_qFilter.ov).split(',')[0]);
                const q = _fbQuestionsById[firstQid];
                const qno = q ? (q.question_no || `Q${firstQid}`) : `Q${firstQid}`;
                const text = q && q.question_text ? q.question_text : '';
                const cap = text.length > 50 ? text.slice(0, 47) + '…' : text;
                parts.push(text ? `${qno} — ${cap}` : qno);
            }
            if (outlet2 !== 'all') parts.push(outletName(parseInt(outlet2)));
            if (dateRange !== 'all') parts.push('Last ' + dateRange.replace('d', ' days'));
            const prefix = parts.length ? parts.join(' · ') + ' · ' : '';
            const uniqueVisitCount = new Set(filtered.map(r => r.visit_id)).size;
            badgeText.textContent = `${prefix}${uniqueVisitCount} feedback${uniqueVisitCount === 1 ? '' : 's'}`;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }

        updateOverallFiltersCount();
        renderOverallDashboard();
    }

    function updateOverallFiltersCount() {
        const countEl = document.getElementById('ovFiltersCount');
        if (!countEl) return;
        const level = document.querySelector('.ov-level-btn.active')?.dataset?.level || 'all';
        const group = document.getElementById('ovFilterGroup')?.value || 'all';
        const user = document.getElementById('ovFilterUser')?.value || 'all';
        const outlet = document.getElementById('ovFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('ovFilterDate')?.value || 'all';
        let n = 0;
        if (level !== 'all') n++;
        if (group !== 'all') n++;
        if (user !== 'all') n++;
        if (outlet !== 'all') n++;
        if (dateRange !== 'all') n++;
        if (_qFilter.ov !== 'all') n++;
        if (n > 0) { countEl.textContent = n; countEl.classList.add('is-active'); }
        else { countEl.textContent = ''; countEl.classList.remove('is-active'); }
    }

    function renderOverallDashboard() {
        const data = _ovFiltered;
        if (!data.length) {
            ['ovKpiRow', 'ovQuestionAvgRating', 'ovOutletBuckets', 'ovRatingDist', 'ovAiSummary', 'ovTopIssues']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '<div class="fbi-empty">No feedback for the current selection.</div>';
                });
            renderResponsesTable([], 'ov');
            return;
        }

        const ratings = data.filter(r => r.rating != null).map(r => r.rating);
        const ratingsDist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
        ratings.forEach(r => { if (ratingsDist[r] != null) ratingsDist[r]++; });
        const totalRatings = ratings.length;
        const avgRating = totalRatings ? ratings.reduce((a, b) => a + b, 0) / totalRatings : 0;

        const uniqueOutlets = new Set(data.map(r => r.outlet_id != null ? String(r.outlet_id) : null).filter(Boolean));
        const uniqueVisits = new Set(data.map(r => r.visit_id));
        const uniqueUsers = new Set(data.map(r => r.user_id != null ? String(r.user_id) : null).filter(Boolean));

        renderKpis({
            avgRating, totalRatings,
            respondents: uniqueUsers.size,
            outlets: uniqueOutlets.size,
            feedbacks: uniqueVisits.size,
        }, 'ovKpiRow', { label: 'Respondents', sub: 'respondents contributing feedback' });
        renderQuestionAvgRating(data, 'ovQuestionAvgRating');
        renderOutletBuckets(data, 'ovOutletBuckets');
        renderRatingDist(ratingsDist, totalRatings, 'ovRatingDist');
        renderVerbatimSummary(data, { elId: 'ovAiSummary', scopeElId: 'ovVerbatimScope' });
        renderTopIssues(data, 'ovTopIssues');
        renderResponsesTable(data, 'ov');
    }

    // ---- Overall event wiring ----
    document.querySelectorAll('.ov-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ov-level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyOverallFilters();
        });
    });
    document.getElementById('ovFilterGroup')?.addEventListener('change', applyOverallFilters);
    document.getElementById('ovFilterUser')?.addEventListener('change', applyOverallFilters);
    document.getElementById('ovFilterOutlet')?.addEventListener('change', applyOverallFilters);
    document.getElementById('ovFilterDate')?.addEventListener('change', applyOverallFilters);
    document.getElementById('ovFilterQuestion')?.addEventListener('change', (e) => {
        _qFilter.ov = e.target.value || 'all';
        applyOverallFilters();
    });
    const ovFiltersToggle = document.getElementById('ovFiltersToggle');
    const ovFiltersGroup = document.getElementById('ovFiltersGroup');
    ovFiltersToggle?.addEventListener('click', () => {
        const open = ovFiltersGroup?.classList.toggle('is-open');
        ovFiltersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.getElementById('ovFilterClearBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.ov-level-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.ov-level-btn[data-level="all"]')?.classList.add('active');
        ['ovFilterGroup','ovFilterUser','ovFilterOutlet','ovFilterDate','ovFilterQuestion'].forEach(id => {
            const e = document.getElementById(id); if (e) e.value = 'all';
        });
        _qFilter.ov = 'all';
        applyOverallFilters();
    });
    document.getElementById('ovDownloadBtn')?.addEventListener('click', () => {
        exportCsv(_ovFiltered, 'overall_feedback_responses.csv');
    });

    // Bootstrap
    (async () => {
        await loadFeedbackMeta();
        loadFeedbackData();
        loadGroupData();
    })();
});
