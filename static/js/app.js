document.addEventListener('DOMContentLoaded', () => {

    // ---- State ----
    let _fbData = [];
    let _fbFiltered = [];
    let _fbQuestionFilter = 'all';
    let _fbPage = 1;
    const FB_PAGE_SIZE = 10;
    let _fbUsersById = {};
    let _fbQuestionsById = {};
    let _fbOutletsById = {};
    let _currentUser = null;

    const FB_STOP_WORDS = new Set([
        'the','and','for','are','but','not','you','all','can','had','her','was',
        'one','our','out','has','have','been','some','their','them','than',
        'very','just','with','this','that','from','which','what','when','more',
        'about','into','over','also','its','other','after','well','will',
        'would','could','should','your','his','its','each','much','such',
        'because','before','between','through','during','without','across',
        'been','being','does','did','doing','done','get','got','gets',
        'make','made','makes','may','might','must','still','too','way',
    ]);

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
        ['fbKpiRow', 'fbRatingDist', 'fbAiSummary', 'fbTableBody']
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
        renderRatingDist(ratingsDist, totalRatings);
        renderVerbatimSummary(data);
        renderResponsesTable(data);
    }

    function renderKpis(stats) {
        const el = document.getElementById('fbKpiRow');
        if (!el) return;
        const items = [
            {
                label: 'Average Rating',
                value: stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—',
                unit: stats.avgRating > 0 ? '/5' : '',
                sub: `${stats.totalRatings} ratings collected`, cls: 'fbi-kpi-green',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
            },
            {
                label: 'Respondents', value: stats.respondents,
                sub: `field reps submitting`, cls: 'fbi-kpi-blue',
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

    function renderRatingDist(dist, total) {
        const el = document.getElementById('fbRatingDist');
        if (!el) return;
        if (total === 0) { el.innerHTML = '<div class="fbi-empty">No ratings available for this selection</div>'; return; }
        const maxCount = Math.max(...Object.values(dist), 1);
        const colors = { 1:'#dc2626', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
        const labels = { 1:'Poor', 2:'Fair', 3:'Good', 4:'Very Good', 5:'Excellent' };
        let barsHtml = '';
        for (let i = 1; i <= 5; i++) {
            const count = dist[i] || 0;
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            barsHtml += `
                <div class="fb-rating-bar-wrap">
                    <div class="fb-rating-count">${count}</div>
                    <div class="fb-rating-bar" style="height:${Math.max(4, pct)}%;background:${colors[i]}" title="${labels[i]}: ${count} responses"></div>
                    <div class="fb-rating-label">${i}<br><span style="font-size:0.65rem;font-weight:400;color:var(--text-tertiary)">${labels[i]}</span></div>
                </div>`;
        }
        el.innerHTML = `
            <div class="fb-rating-dist">${barsHtml}</div>
            <div class="fb-rating-total">${total}</div>
            <div class="fb-rating-total-label">Total Ratings Collected</div>`;
    }

    function getOpenEndedResponses(data) {
        const texts = [];
        data.forEach(r => {
            if (r.answer_text && String(r.answer_text).trim()) texts.push(String(r.answer_text).trim());
            if (r.voice_text && String(r.voice_text).trim()) texts.push(String(r.voice_text).trim());
        });
        return texts;
    }

    function renderVerbatimSummary(data) {
        const texts = getOpenEndedResponses(data);
        const el = document.getElementById('fbAiSummary');
        const scopeEl = document.getElementById('fbVerbatimScope');
        if (!el) return;
        if (texts.length === 0) {
            el.innerHTML = '<div class="fbi-empty">No open-ended responses for this selection</div>';
            if (scopeEl) scopeEl.textContent = '0 open-ended responses';
            return;
        }

        const all = texts.join(' ').toLowerCase();

        // Sentiment scoring
        const posWords = ['good','great','excellent','best','love','recommend','effective','helpful','satisfied','strong','improved','trust','impressed','reliable','working','build','opportunity'];
        const negWords = ['improvement','expensive','missing','lack','poor','difficult','stockout','issue','problem','slow','weak','limited','confusing','unavailable','empty','out of stock'];
        let posCount = 0, negCount = 0;
        posWords.forEach(w => { if (all.includes(w)) posCount++; });
        negWords.forEach(w => { if (all.includes(w)) negCount++; });
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

    function renderResponsesTable(data) {
        const body = document.getElementById('fbTableBody');
        const empty = document.getElementById('fbTableEmpty');
        const wrap = document.querySelector('#view-dashboard .fb-table-wrap');
        const pager = document.getElementById('fbPagination');
        if (!body) return;

        if (!data.length) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
            if (pager) pager.innerHTML = '';
            return;
        }
        wrap?.classList.remove('hidden');
        empty?.classList.add('hidden');

        const sorted = [...data].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const totalPages = Math.max(1, Math.ceil(sorted.length / FB_PAGE_SIZE));
        if (_fbPage > totalPages) _fbPage = totalPages;
        if (_fbPage < 1) _fbPage = 1;
        const start = (_fbPage - 1) * FB_PAGE_SIZE;
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
                        <span class="fb-cell-meta-date">${escapeHtml(formatDateShort(r.created_at))}</span>
                    </div>
                </td>
            </tr>`;
        }).join('');

        renderPagination(pager, sorted.length, totalPages);
    }

    function renderPagination(pager, total, totalPages) {
        if (!pager) return;
        if (total <= FB_PAGE_SIZE) { pager.innerHTML = ''; return; }
        const start = (_fbPage - 1) * FB_PAGE_SIZE + 1;
        const end = Math.min(_fbPage * FB_PAGE_SIZE, total);
        pager.innerHTML = `
            <span class="fb-pagination-info">Showing <strong>${start}</strong>–<strong>${end}</strong> of <strong>${total}</strong></span>
            <div class="fb-pagination-controls">
                <button type="button" class="fb-page-btn" data-page-action="prev" ${_fbPage === 1 ? 'disabled' : ''} aria-label="Previous page">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span class="fb-pagination-page">Page ${_fbPage} of ${totalPages}</span>
                <button type="button" class="fb-page-btn" data-page-action="next" ${_fbPage === totalPages ? 'disabled' : ''} aria-label="Next page">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>`;
        pager.querySelectorAll('[data-page-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.pageAction === 'prev' && _fbPage > 1) _fbPage--;
                if (btn.dataset.pageAction === 'next' && _fbPage < totalPages) _fbPage++;
                renderResponsesTable(_fbFiltered);
                document.querySelector('.fb-responses-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

        let filtered = [..._fbData];
        if (level !== 'all') filtered = filtered.filter(r => inferLevel(r.level, r.outlet_id) === level);
        if (outlet !== 'all') filtered = filtered.filter(r => r.outlet_id != null && String(r.outlet_id) === outlet);
        if (_fbQuestionFilter !== 'all') {
            const qSet = new Set(String(_fbQuestionFilter).split(',').map(s => s.trim()));
            filtered = filtered.filter(r => r.question_id != null && qSet.has(String(r.question_id)));
        }

        if (dateRange !== 'all') {
            const now = new Date('2026-05-21');
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
        _fbPage = 1;

        const badge = document.getElementById('fbFilterBadge');
        const badgeText = document.getElementById('fbFilterBadgeText');
        const anyFilterActive = level !== 'all' || outlet !== 'all' || dateRange !== 'all' || _fbQuestionFilter !== 'all';
        if (anyFilterActive && badge && badgeText) {
            const parts = [];
            if (level !== 'all') parts.push(level.toUpperCase());
            if (_fbQuestionFilter !== 'all') {
                const firstQid = parseInt(String(_fbQuestionFilter).split(',')[0]);
                const q = _fbQuestionsById[firstQid];
                const qno = q ? (q.question_no || `Q${firstQid}`) : `Q${firstQid}`;
                const text = q && q.question_text ? q.question_text : '';
                const cap = text.length > 50 ? text.slice(0, 47) + '…' : text;
                parts.push(text ? `${qno} — ${cap}` : qno);
            }
            if (outlet !== 'all') parts.push(outletName(parseInt(outlet)));
            if (dateRange !== 'all') parts.push('Last ' + dateRange.replace('d', ' days'));
            const prefix = parts.length ? parts.join(' · ') + ' · ' : '';
            badgeText.textContent = `${prefix}${filtered.length} response${filtered.length === 1 ? '' : 's'}`;
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

    function populateQuestionDropdown(scopedData) {
        const sel = document.getElementById('fbFilterQuestion');
        if (!sel) return;
        const ids = getQuestionIdsInData(scopedData);

        // Group by normalised question text. Fallback to per-qid when text missing.
        const groups = new Map(); // key -> { qids:[], label, qno }
        ids.forEach(id => {
            const q = _fbQuestionsById[id] || {};
            const text = q.question_text || '';
            const qno = q.question_no || `Q${id}`;
            const key = text ? normaliseQuestionText(text) : `qid:${id}`;
            if (!groups.has(key)) {
                groups.set(key, { qids: [], label: text ? `${qno} — ${text}` : qno, qno, text });
            }
            groups.get(key).qids.push(id);
        });

        const options = [...groups.values()].sort((a, b) => a.qno.localeCompare(b.qno, undefined, { numeric: true }));

        const prev = _fbQuestionFilter;
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
                _fbQuestionFilter = match.qids.join(',');
                sel.value = _fbQuestionFilter;
            } else {
                sel.value = 'all';
                _fbQuestionFilter = 'all';
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
        _fbQuestionFilter = e.target.value || 'all';
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
        if (_fbQuestionFilter !== 'all') n++;
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
        _fbQuestionFilter = 'all';
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

    // Bootstrap
    (async () => {
        await loadFeedbackMeta();
        loadFeedbackData();
    })();
});
