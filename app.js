/**
 * ComNetMekong News Portal & Live API Tester
 * Logic and Interactivity
 * Integrated with ComNetMekong Wix HTTP Functions API
 */

(function () {
  'use strict';

  // State Management
  const state = {
    endpointUrl: `${CONFIG.API_BASE_URL}/news`,
    limit: 12,
    skip: 0,
    items: [],
    totalCount: 0,
    rawPayload: null,
    searchQuery: '',
    selectedYear: 'all',
    sortBy: 'date-desc',
    viewMode: 'grid', // 'grid' | 'list'
    isLoading: false,
    activeArticle: null,
    details: {}, // Cache for postDetail by postId: { totalLikes, comments, richContent }
  };

  // DOM Elements
  const els = {
    apiStatusBadge: document.getElementById('apiStatusBadge'),
    apiStatusText: document.getElementById('apiStatusText'),
    metricStatus: document.getElementById('metricStatus'),
    metricLatency: document.getElementById('metricLatency'),
    metricSize: document.getElementById('metricSize'),
    metricCount: document.getElementById('metricCount'),
    metricStatusTag: document.getElementById('metricStatusTag'),
    endpointUrlInput: document.getElementById('endpointUrlInput'),
    limitSelect: document.getElementById('limitSelect'),
    skipInput: document.getElementById('skipInput'),
    fetchApiBtn: document.getElementById('fetchApiBtn'),
    fetchBtnIcon: document.getElementById('fetchBtnIcon'),
    newsGrid: document.getElementById('newsGrid'),
    emptyState: document.getElementById('emptyState'),
    errorState: document.getElementById('errorState'),
    errorMessageText: document.getElementById('errorMessageText'),
    retryFetchBtn: document.getElementById('retryFetchBtn'),
    resetFilterBtn: document.getElementById('resetFilterBtn'),
    searchInput: document.getElementById('searchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    yearFilterGroup: document.getElementById('yearFilterGroup'),
    sortSelect: document.getElementById('sortSelect'),
    viewGridBtn: document.getElementById('viewGridBtn'),
    viewListBtn: document.getElementById('viewListBtn'),
    openJsonViewerBtn: document.getElementById('openJsonViewerBtn'),
    jsonViewerModal: document.getElementById('jsonViewerModal'),
    closeJsonModalBtn: document.getElementById('closeJsonModalBtn'),
    jsonPreBox: document.getElementById('jsonPreBox'),
    jsonSizeLabel: document.getElementById('jsonSizeLabel'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),
    articlePageView: document.getElementById('articlePageView'),
    closeArticlePageBtn: document.getElementById('closeArticlePageBtn'),
    articleModalBody: document.getElementById('articleModalBody'),
    articleModalFooter: document.getElementById('articleModalFooter'),
    heroSection: document.querySelector('.hero-section'),
    apiHudSection: document.querySelector('.api-hud-section'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // ==========================================
  // Helper: Client Persistent User ID
  // ==========================================
  function getUserId() {
    let uid = localStorage.getItem('comnet_mekong_user_id');
    if (!uid) {
      uid = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      localStorage.setItem('comnet_mekong_user_id', uid);
    }
    return uid;
  }

  // ==========================================
  // Helper: Local Like & Comment Preferences
  // ==========================================
  function getUserLikedState(postId) {
    try {
      const map = JSON.parse(localStorage.getItem('comnet_user_liked_map') || '{}');
      return Boolean(map[postId]);
    } catch (e) {
      return false;
    }
  }

  function setUserLikedState(postId, isLiked) {
    try {
      const map = JSON.parse(localStorage.getItem('comnet_user_liked_map') || '{}');
      if (isLiked) {
        map[postId] = true;
      } else {
        delete map[postId];
      }
      localStorage.setItem('comnet_user_liked_map', JSON.stringify(map));
    } catch (e) {
      console.warn('Failed to save liked state:', e);
    }
  }

  function getCommentLiked(commentId) {
    try {
      const map = JSON.parse(localStorage.getItem('comnet_comment_likes_map') || '{}');
      return Boolean(map[commentId]);
    } catch (e) {
      return false;
    }
  }

  function toggleCommentLiked(commentId) {
    try {
      const map = JSON.parse(localStorage.getItem('comnet_comment_likes_map') || '{}');
      const next = !map[commentId];
      if (next) map[commentId] = true;
      else delete map[commentId];
      localStorage.setItem('comnet_comment_likes_map', JSON.stringify(map));
      return next;
    } catch (e) {
      return false;
    }
  }

  // ==========================================
  // Helper: Format Thai Date
  // ==========================================
  function formatThaiDate(isoDateString) {
    if (!isoDateString) return 'ไม่ระบุวันที่';
    try {
      const date = new Date(isoDateString);
      if (isNaN(date.getTime())) return isoDateString;
      return new Intl.DateTimeFormat('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch (e) {
      return isoDateString;
    }
  }

  // Helper: Format Relative Time in Thai
  function formatRelativeTime(isoDateString) {
    if (!isoDateString) return 'เมื่อสักครู่';
    try {
      const date = new Date(isoDateString);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return 'เมื่อสักครู่';
      if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
      if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;
      if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
      return formatThaiDate(isoDateString);
    } catch (e) {
      return formatThaiDate(isoDateString);
    }
  }

  // Helper: Format Wix Image URL
  function formatWixImageUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    if (rawUrl.startsWith('wix:image://')) {
      const match = rawUrl.match(/wix:image:\/\/v1\/([^/#]+)/);
      if (match && match[1]) {
        return `https://static.wixstatic.com/media/${match[1]}`;
      }
    }
    return `https://static.wixstatic.com/media/${rawUrl}`;
  }

  // Helper: Parse Wix RichContent JSON to Styled HTML
  function parseWixRichContent(richContent) {
    if (!richContent || !Array.isArray(richContent.nodes)) return null;
    let html = '';

    for (const node of richContent.nodes) {
      if (node.type === 'IMAGE') {
        const imgObj = node.imageData?.image;
        let srcUrl = imgObj?.url || imgObj?.src?.url || (imgObj?.src?.id ? formatWixImageUrl(imgObj.src.id) : null);
        if (srcUrl) {
          srcUrl = formatWixImageUrl(srcUrl);
          const caption = node.imageData?.caption || '';
          html += `
            <figure class="rich-figure">
              <img src="${escapeHtml(srcUrl)}" alt="${escapeHtml(caption || 'รูปภาพประกอบบทความ')}" class="rich-img" loading="lazy" onerror="this.style.display='none'">
              ${caption ? `<figcaption class="rich-figcaption">${escapeHtml(caption)}</figcaption>` : ''}
            </figure>
          `;
        }
      } else if (node.type === 'PARAGRAPH') {
        let textParts = [];
        if (Array.isArray(node.nodes)) {
          for (const sub of node.nodes) {
            if (sub.type === 'TEXT' && sub.textData) {
              let t = escapeHtml(sub.textData.text || '');
              const decorations = sub.textData.decorations || [];
              let isBold = decorations.some(d => d.type === 'BOLD');
              let isItalic = decorations.some(d => d.type === 'ITALIC');
              let isUnderline = decorations.some(d => d.type === 'UNDERLINE');
              let linkDec = decorations.find(d => d.type === 'LINK');

              if (isBold) t = `<strong>${t}</strong>`;
              if (isItalic) t = `<em>${t}</em>`;
              if (isUnderline) t = `<u>${t}</u>`;
              if (linkDec && linkDec.linkData && linkDec.linkData.link && linkDec.linkData.link.url) {
                t = `<a href="${escapeHtml(linkDec.linkData.link.url)}" target="_blank" rel="noopener" style="color: var(--accent-cyan); text-decoration: underline;">${t}</a>`;
              }
              textParts.push(t);
            }
          }
        }
        const fullP = textParts.join('');
        if (fullP.trim()) {
          html += `<p class="rich-p">${fullP}</p>`;
        }
      } else if (node.type === 'HEADING') {
        let textParts = [];
        if (Array.isArray(node.nodes)) {
          for (const sub of node.nodes) {
            if (sub.type === 'TEXT' && sub.textData) {
              let t = escapeHtml(sub.textData.text || '');
              if (sub.textData.decorations && sub.textData.decorations.some(d => d.type === 'BOLD')) {
                t = `<strong>${t}</strong>`;
              }
              textParts.push(t);
            }
          }
        }
        const headingText = textParts.join('').trim();
        if (headingText) {
          html += `<h3 class="rich-h3">${headingText}</h3>`;
        }
      } else if (node.type === 'BULLETED_LIST' || node.type === 'ORDERED_LIST') {
        const isOl = node.type === 'ORDERED_LIST';
        const tag = isOl ? 'ol' : 'ul';
        const cls = isOl ? 'rich-ol' : 'rich-ul';
        let itemsHtml = '';
        if (Array.isArray(node.nodes)) {
          for (const li of node.nodes) {
            let liText = '';
            if (Array.isArray(li.nodes)) {
              for (const p of li.nodes) {
                if (Array.isArray(p.nodes)) {
                  for (const sub of p.nodes) {
                    if (sub.textData && sub.textData.text) liText += escapeHtml(sub.textData.text);
                  }
                }
              }
            }
            if (liText.trim()) itemsHtml += `<li class="rich-li">${liText}</li>`;
          }
        }
        if (itemsHtml) html += `<${tag} class="${cls}">${itemsHtml}</${tag}>`;
      } else if (node.type === 'DIVIDER') {
        html += `<hr class="rich-divider">`;
      } else if (node.type === 'BLOCKQUOTE') {
        let bqText = '';
        if (Array.isArray(node.nodes)) {
          for (const p of node.nodes) {
            if (Array.isArray(p.nodes)) {
              for (const sub of p.nodes) {
                if (sub.textData && sub.textData.text) bqText += escapeHtml(sub.textData.text);
              }
            }
          }
        }
        if (bqText.trim()) html += `<blockquote class="rich-blockquote">${bqText}</blockquote>`;
      }
    }

    return html || null;
  }

  // ==========================================
  // Helper: JSON Syntax Highlighter
  // ==========================================
  function syntaxHighlight(json) {
    if (typeof json !== 'string') {
      json = JSON.stringify(json, null, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      }
    );
  }

  // ==========================================
  // Toast Notification
  // ==========================================
  function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${message}</span>
    `;
    els.toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ==========================================
  // Render Loading Skeletons
  // ==========================================
  function renderSkeletons(count = 6) {
    els.newsGrid.innerHTML = '';
    els.newsGrid.style.display = 'grid';
    els.emptyState.style.display = 'none';
    els.errorState.style.display = 'none';

    for (let i = 0; i < count; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton-card';
      sk.innerHTML = `
        <div class="skeleton-media"></div>
        <div class="skeleton-body">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `;
      els.newsGrid.appendChild(sk);
    }
  }

  // ==========================================
  // API Calls: Post Detail, Like, Comment
  // ==========================================
  async function fetchPostDetail(postId, slug, forceRefresh = false) {
    if (!postId && !slug) return null;
    let apiUrl = `${CONFIG.API_BASE_URL}/postDetail?`;
    if (postId) apiUrl += `id=${encodeURIComponent(postId)}`;
    else apiUrl += `slug=${encodeURIComponent(slug)}`;

    const startTime = performance.now();

    try {
      const res = await fetch(apiUrl);
      const latency = Math.round(performance.now() - startTime);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success' && json.data) {
          const post = json.data;

          if (post.author && post.author.profileImage) {
            post.author.profileImage = formatWixImageUrl(post.author.profileImage);
          }
          if (post.coverImage) {
            post.coverImage = formatWixImageUrl(post.coverImage);
          }

          state.details[post.id] = {
            id: post.id,
            title: post.title,
            slug: post.slug,
            richContent: post.richContent,
            coverImage: post.coverImage,
            publishedDate: post.publishedDate,
            author: post.author || {},
            totalLikes: typeof post.totalLikes === 'number' ? post.totalLikes : 0,
            comments: Array.isArray(post.comments) ? post.comments : [],
            _rawResponse: json,
            _latency: latency,
            _endpointUrl: apiUrl,
            _status: res.status
          };
          return state.details[post.id];
        }
      }
    } catch (err) {
      console.warn('fetchPostDetail failed:', err);
    }
    return state.details[postId] || null;
  }

  async function toggleArticleLike(postId, slug) {
    const userId = getUserId();
    const curLiked = getUserLikedState(postId);
    const detail = state.details[postId] || { totalLikes: 0, comments: [] };

    // Optimistic UI state
    const nextLiked = !curLiked;
    const nextTotal = nextLiked ? (detail.totalLikes + 1) : Math.max(0, detail.totalLikes - 1);
    detail.totalLikes = nextTotal;
    setUserLikedState(postId, nextLiked);
    syncLikeUi(postId, nextTotal, nextLiked);

    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, slug, userId })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success') {
          const finalLiked = Boolean(json.liked);
          const finalTotal = typeof json.totalLikes === 'number' ? json.totalLikes : nextTotal;
          detail.totalLikes = finalTotal;
          setUserLikedState(postId, finalLiked);
          syncLikeUi(postId, finalTotal, finalLiked);
          return { liked: finalLiked, totalLikes: finalTotal };
        }
      }
    } catch (err) {
      console.warn('Like API call error:', err);
    }
    return { liked: nextLiked, totalLikes: nextTotal };
  }

  async function submitComment(postId, slug, authorName, content) {
    const trimmedAuthor = (authorName || 'ผู้เยี่ยมชมลุ่มน้ำโขง').trim();
    const trimmedContent = content.trim();
    if (!trimmedContent) throw new Error('กรุณากรอกข้อความความคิดเห็น');

    localStorage.setItem('comnet_saved_author_name', trimmedAuthor);

    const res = await fetch(`${CONFIG.API_BASE_URL}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId,
        slug,
        authorName: trimmedAuthor,
        content: trimmedContent
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message || 'ไม่สามารถส่งคอมเมนต์ได้');
    }

    const newComment = json.data || {
      id: 'c_' + Date.now(),
      postId,
      authorName: trimmedAuthor,
      content: trimmedContent,
      createdAt: new Date().toISOString()
    };

    if (!state.details[postId]) {
      state.details[postId] = { totalLikes: 0, comments: [] };
    }
    if (!Array.isArray(state.details[postId].comments)) {
      state.details[postId].comments = [];
    }
    state.details[postId].comments.unshift(newComment);

    return newComment;
  }

  // ==========================================
  // UI Sync Helpers
  // ==========================================
  function syncLikeUi(postId, totalLikes, isLiked) {
    document.querySelectorAll(`.btn-like[data-post-id="${postId}"]`).forEach(btn => {
      btn.classList.toggle('liked', isLiked);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
      const countEl = btn.querySelector('.like-count');
      if (countEl) countEl.textContent = totalLikes;
    });

    const modalLikeBtn = document.getElementById('modalArticleLikeBtn');
    if (modalLikeBtn && modalLikeBtn.getAttribute('data-post-id') === postId) {
      modalLikeBtn.classList.toggle('liked', isLiked);
      const svg = modalLikeBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
      const textEl = modalLikeBtn.querySelector('.modal-like-text');
      if (textEl) textEl.textContent = isLiked ? 'ถูกใจแล้ว' : 'กดถูกใจ';
      const countEl = modalLikeBtn.querySelector('.modal-like-count');
      if (countEl) countEl.textContent = `(${totalLikes})`;
    }
  }

  function syncCommentCountUi(postId, count) {
    document.querySelectorAll(`.btn-comments[data-post-id="${postId}"] .comment-count`).forEach(el => {
      el.textContent = count;
    });

    const modalCountPill = document.getElementById('modalCommentsCountPill');
    if (modalCountPill) {
      modalCountPill.textContent = count;
    }
  }

  // ==========================================
  // Fetch Data from API
  // ==========================================
  async function fetchNewsData() {
    if (state.isLoading) return;
    state.isLoading = true;

    els.apiStatusBadge.className = 'api-live-badge loading';
    els.apiStatusText.textContent = 'กำลังดึงข้อมูล...';
    els.fetchApiBtn.disabled = true;
    els.fetchBtnIcon.style.animation = 'spin 1s linear infinite';

    renderSkeletons(state.limit ? Math.min(state.limit, 6) : 6);

    let url = state.endpointUrl.trim();
    if (!url.includes('?')) {
      const params = new URLSearchParams();
      if (state.limit) params.set('limit', state.limit);
      if (state.skip) params.set('skip', state.skip);
      const qs = params.toString();
      if (qs) url += '?' + qs;
    }

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const rawText = await response.text();
      const sizeKB = (new Blob([rawText]).size / 1024).toFixed(1);
      const data = JSON.parse(rawText);

      state.rawPayload = data;
      state.items = Array.isArray(data.data) ? data.data : [];
      state.totalCount = typeof data.total === 'number' ? data.total : state.items.length;

      // Update Diagnostics HUD
      els.metricStatus.textContent = `${response.status} OK`;
      els.metricStatusTag.className = 'metric-tag status-ok';
      els.metricLatency.textContent = `${latency} ms`;
      els.metricSize.textContent = `${sizeKB} KB`;
      els.metricCount.textContent = `${state.items.length} / ${state.totalCount}`;

      // Update Badge
      els.apiStatusBadge.className = 'api-live-badge';
      els.apiStatusText.textContent = `API Connected (${latency}ms)`;

      // Render items
      renderArticles();
    } catch (err) {
      console.error('API Fetch Error:', err);

      els.metricStatus.textContent = 'Error';
      els.metricStatusTag.className = 'metric-tag status-err';
      els.metricLatency.textContent = '--';
      els.metricSize.textContent = '--';
      els.metricCount.textContent = '0 / 0';

      els.apiStatusBadge.className = 'api-live-badge error';
      els.apiStatusText.textContent = 'การเชื่อมต่อผิดพลาด';

      els.newsGrid.style.display = 'none';
      els.emptyState.style.display = 'none';
      els.errorState.style.display = 'block';
      els.errorMessageText.textContent = `${err.message} — โปรดตรวจสอบ URL หรือสถานะการเชื่อมต่ออินเทอร์เน็ต`;
    } finally {
      state.isLoading = false;
      els.fetchApiBtn.disabled = false;
      els.fetchBtnIcon.style.animation = 'none';
    }
  }

  // ==========================================
  // Render Articles
  // ==========================================
  function renderArticles() {
    let list = [...state.items];

    // 1. Search Query Filter
    const query = state.searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => {
        const title = (item.title || '').toLowerCase();
        const excerpt = (item.excerpt || '').toLowerCase();
        const slug = (item.slug || '').toLowerCase();
        return title.includes(query) || excerpt.includes(query) || slug.includes(query);
      });
    }

    // 2. Year Filter
    if (state.selectedYear !== 'all') {
      list = list.filter((item) => {
        if (!item.publishedDate) return false;
        const year = new Date(item.publishedDate).getFullYear().toString();
        return year === state.selectedYear;
      });
    }

    // 3. Sorting
    list.sort((a, b) => {
      if (state.sortBy === 'date-desc') {
        return new Date(b.publishedDate || 0) - new Date(a.publishedDate || 0);
      } else if (state.sortBy === 'date-asc') {
        return new Date(a.publishedDate || 0) - new Date(b.publishedDate || 0);
      } else if (state.sortBy === 'title-asc') {
        return (a.title || '').localeCompare(b.title || '', 'th');
      }
      return 0;
    });

    // Handle Empty State
    if (list.length === 0) {
      els.newsGrid.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.errorState.style.display = 'none';
      return;
    }

    els.emptyState.style.display = 'none';
    els.errorState.style.display = 'none';
    els.newsGrid.style.display = 'grid';

    // Clear and build cards
    els.newsGrid.innerHTML = '';
    list.forEach((item) => {
      const card = createNewsCard(item);
      els.newsGrid.appendChild(card);

      // Asynchronously fetch detail in background to populate real likes count and comments count
      fetchPostDetail(item.id, item.slug).then(d => {
        if (d) {
          syncLikeUi(item.id, d.totalLikes, getUserLikedState(item.id));
          syncCommentCountUi(item.id, d.comments.length);
        }
      });
    });
  }

  // ==========================================
  // Create Single News Card DOM Element
  // ==========================================
  function createNewsCard(item) {
    const card = document.createElement('article');
    card.className = 'news-card';
    card.setAttribute('data-id', item.id);

    const formattedDate = formatThaiDate(item.publishedDate);
    const hasImage = Boolean(item.coverImage);

    // Author Information (รูปและชื่อผู้เขียน)
    const author = item.author || {};
    const authorName = author.name || 'ComNet Mekhong';
    const authorPhoto = author.profileImage;
    const authorInitial = (authorName.trim()[0] || 'C').toUpperCase();

    // Like status and comments count
    const isLiked = getUserLikedState(item.id);
    const cachedDetail = state.details[item.id] || {};
    const initialLikes = typeof cachedDetail.totalLikes === 'number' ? cachedDetail.totalLikes : 0;
    const initialCommentsCount = Array.isArray(cachedDetail.comments) ? cachedDetail.comments.length : 0;

    const mediaHtml = hasImage
      ? `<img src="${item.coverImage}" alt="${escapeHtml(item.title)}" class="card-img" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'card-img-placeholder\\'><span>🌊 ComNetMekong</span></div>'">`
      : `<div class="card-img-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12c.6 0 1.2-.2 1.6-.6.9-.8 2-.8 2.8 0 .9.8 2 .8 2.8 0 .9-.8 2-.8 2.8 0 .4.4 1 .6 1.6.6"/>
            <path d="M2 6c.6 0 1.2-.2 1.6-.6.9-.8 2-.8 2.8 0 .9.8 2 .8 2.8 0 .9-.8 2-.8 2.8 0 .4.4 1 .6 1.6.6"/>
          </svg>
          <span style="font-size:0.8rem; font-weight:500;">ComNetMekong Report</span>
        </div>`;

    card.innerHTML = `
      <div class="card-media">
        ${mediaHtml}
        <div class="card-badge-date">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span>${formattedDate}</span>
        </div>
      </div>

      <div class="card-body">
        <!-- Author Info (รูปและชื่อผู้เขียน) -->
        <div class="card-author-row">
          <div class="author-avatar-wrapper">
            ${authorPhoto
        ? `<img src="${escapeHtml(authorPhoto)}" alt="${escapeHtml(authorName)}" class="author-avatar-img" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'author-avatar-placeholder\\'>${authorInitial}</div>';">`
        : `<div class="author-avatar-placeholder">${authorInitial}</div>`
      }
          </div>
          <div class="author-info-text">
            <span class="author-label">ผู้เขียน</span>
            <span class="author-name">
              ${escapeHtml(authorName)}
              <svg class="author-verified-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </span>
          </div>
        </div>

        <h3 class="card-title">${escapeHtml(item.title || 'ไม่มีชื่อเรื่อง')}</h3>
        <p class="card-excerpt">${escapeHtml(item.excerpt || 'ไม่มีเนื้อหาย่อสำหรับบทความนี้')}</p>
        
        <div class="card-footer">
          <span class="card-read-link">
            อ่านรายละเอียด
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </span>

          <div class="card-actions-row">
            <!-- ปุ่มกดไลก์บน Card -->
            <button type="button" class="card-action-btn btn-like ${isLiked ? 'liked' : ''}" data-post-id="${item.id}" title="กดถูกใจบทความนี้">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span class="like-count">${initialLikes}</span>
            </button>

            <!-- ช่องจำนวนคอมเมนต์บน Card -->
            <button type="button" class="card-action-btn btn-comments" data-post-id="${item.id}" title="ดูความคิดเห็น">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              <span class="comment-count">${initialCommentsCount}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Event Handling
    card.addEventListener('click', (e) => {
      // Like button click
      const likeBtn = e.target.closest('.btn-like');
      if (likeBtn) {
        e.stopPropagation();
        toggleArticleLike(item.id, item.slug).then(res => {
          showToast(res.liked ? 'ขอบคุณสำหรับความถูกใจ! ❤️' : 'ยกเลิกถูกใจแล้ว');
        });
        return;
      }

      const commentBtn = e.target.closest('.btn-comments');
      const scrollToComments = Boolean(commentBtn);
      if (scrollToComments) {
        e.stopPropagation();
      }

      // Open page instantly with available item data
      // openArticlePage will handle fetching details and showing skeletons
      openArticlePage(item, scrollToComments);
    });

    return card;
  }

  // ==========================================
  // Render Comments List Helper
  // ==========================================
  function renderCommentsList(comments, containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (!comments || comments.length === 0) {
      containerEl.innerHTML = `
        <div class="comments-empty-state">
          <div class="comments-empty-icon">💬</div>
          <div class="comments-empty-text">ยังไม่มีความคิดเห็น มาร่วมเป็นคนแรกที่แสดงความคิดเห็น!</div>
        </div>
      `;
      return;
    }

    comments.forEach(comment => {
      const authorName = comment.authorName || comment.author || 'ผู้เยี่ยมชม';
      const initial = (authorName.trim()[0] || 'U').toUpperCase();
      const timeStr = formatRelativeTime(comment.createdAt || comment._createdDate);
      const isLiked = getCommentLiked(comment.id);

      const card = document.createElement('div');
      card.className = 'comment-card';
      card.setAttribute('data-comment-id', comment.id);

      card.innerHTML = `
        <div class="comment-header">
          <div class="comment-user-info">
            <div class="comment-avatar">
              ${initial}
            </div>
            <div>
              <div class="comment-author-name">${escapeHtml(authorName)}</div>
              <div class="comment-time">${timeStr}</div>
            </div>
          </div>
        </div>
        <div class="comment-content">${escapeHtml(comment.content || '')}</div>
        <div class="comment-footer">
          <button type="button" class="comment-like-btn ${isLiked ? 'liked' : ''}" data-comment-id="${comment.id}" title="ถูกใจความคิดเห็นนี้">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span class="comment-like-count">${isLiked ? 1 : 0}</span>
          </button>
        </div>
      `;

      const likeBtn = card.querySelector('.comment-like-btn');
      likeBtn.addEventListener('click', () => {
        const next = toggleCommentLiked(comment.id);
        likeBtn.classList.toggle('liked', next);
        const svg = likeBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', next ? 'currentColor' : 'none');
        likeBtn.querySelector('.comment-like-count').textContent = next ? 1 : 0;
      });

      containerEl.appendChild(card);
    });
  }

  // ==========================================
  // Article Page View
  // ==========================================
  function openArticlePage(item, scrollToComments = false) {
    state.activeArticle = item;
    const formattedDate = formatThaiDate(item.publishedDate);
    const postWebUrl = `${CONFIG.WEB_BASE_URL}/post/${encodeURIComponent(item.slug || '')}`;

    // Author data
    const author = item.author || {};
    const authorName = author.name || 'ComNet Mekhong';
    const authorPhoto = author.profileImage;
    const authorInitial = (authorName.trim()[0] || 'C').toUpperCase();

    // Like and comments from cache
    const isLiked = getUserLikedState(item.id);
    const cachedDetail = state.details[item.id] || {};
    const totalLikes = typeof cachedDetail.totalLikes === 'number' ? cachedDetail.totalLikes : 0;
    let comments = Array.isArray(cachedDetail.comments) ? cachedDetail.comments : [];

    els.articleModalBody.innerHTML = `
      <!-- API Status Strip (Hidden by default) -->
      <div id="modalApiStrip" class="modal-api-strip" style="display: none;"></div>

      <!-- Tabs -->
      <div class="modal-tabs">
        <button class="modal-tab-btn active" id="tabContentBtn">เนื้อหาบทความ &amp; ความคิดเห็น (Preview)</button>
        <button class="modal-tab-btn" id="tabJsonBtn">โครงสร้างข้อมูลดิบ (Item JSON)</button>
      </div>

      <!-- Tab Content: Article Details -->
      <div id="tabContentPane">
        <div id="detailCoverImageContainer">
          ${item.coverImage ? `<img src="${item.coverImage}" alt="${escapeHtml(item.title)}" class="detail-hero-img">` : ''}
        </div>

        <!-- Author & Interaction Card (ข้อมูลผู้เขียนและปุ่มไลก์) -->
        <div class="detail-author-card">
          <div class="detail-author-left" id="detailAuthorInfoBox">
            <div class="detail-author-avatar-wrapper">
              ${authorPhoto
        ? `<img src="${escapeHtml(authorPhoto)}" alt="${escapeHtml(authorName)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'author-avatar-placeholder\\'>${authorInitial}</div>';">`
        : `<div class="author-avatar-placeholder">${authorInitial}</div>`
      }
            </div>
            <div>
              <div class="detail-author-title">
                ${escapeHtml(authorName)}
                <svg class="author-verified-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div class="detail-author-sub">เผยแพร่เมื่อ: ${formattedDate}</div>
            </div>
          </div>

          <div class="detail-interaction-right">
            <!-- Modal Like Button -->
            <button type="button" class="modal-like-btn ${isLiked ? 'liked' : ''}" id="modalArticleLikeBtn" data-post-id="${item.id}" title="กดถูกใจบทความนี้">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span class="modal-like-text">${isLiked ? 'ถูกใจแล้ว' : 'กดถูกใจ'}</span>
              <span class="modal-like-count">(${totalLikes})</span>
            </button>
            
            <!-- Share Facebook Button -->
            <button type="button" class="modal-share-btn facebook-share" id="modalShareFbBtn" data-url="${escapeHtml(postWebUrl)}" title="แชร์ไปยัง Facebook">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
              </svg>
              <span class="modal-like-text">แชร์</span>
            </button>

            <!-- Copy Link Button -->
            <button type="button" class="modal-share-btn copy-link" id="modalCopyLinkBtn" data-url="${escapeHtml(postWebUrl)}" title="คัดลอกลิงก์">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </button>
          </div>
        </div>

        <h2 class="detail-full-title">${escapeHtml(item.title || '')}</h2>

        <div class="detail-excerpt-content" id="detailBodyContent">
          ${cachedDetail.richContent ? parseWixRichContent(cachedDetail.richContent) : `
            <div class="modal-skeleton-line title"></div>
            <div class="modal-skeleton-line"></div>
            <div class="modal-skeleton-line"></div>
            <div class="modal-skeleton-line" style="width: 70%;"></div>
            <br>
            <div class="modal-skeleton-line"></div>
            <div class="modal-skeleton-line"></div>
            <div class="modal-skeleton-line" style="width: 40%;"></div>
          `}
        </div>

        <!-- ================= ช่องดึงคอมเมนต์และแสดงผล (Comments Section) ================= -->
        <section class="comments-section" id="modalCommentsSection">
          <div class="comments-header-bar">
            <div class="comments-title-group">
              <span class="comments-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
                ความคิดเห็นและแลกเปลี่ยน
              </span>
              <span class="comments-count-pill" id="modalCommentsCountPill">${comments.length}</span>
            </div>

            <!-- ปุ่มดึงคอมเมนต์สด (Fetch Comments) -->
            <button type="button" class="btn-fetch-comments" id="btnFetchComments" title="ดึงข้อมูลความคิดเห็นล่าสุดจาก API เซิร์ฟเวอร์">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              <span>ดึงคอมเมนต์สด (Fetch)</span>
            </button>
          </div>

          <!-- รายการคอมเมนต์ (Comments List) -->
          <div class="comments-list" id="modalCommentsList"></div>

          <!-- ฟอร์มส่งความคิดเห็น (Add Comment Form) -->
          <div class="add-comment-box">
            <div class="add-comment-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              แสดงความคิดเห็นของคุณ
            </div>
            <form id="commentPostForm" onsubmit="return false;">
              <input 
                type="text" 
                id="commentAuthorInput" 
                class="comment-input-field" 
                placeholder="ชื่อของคุณ (เช่น สมชาย ผู้ร่วมอนุรักษ์)" 
                maxlength="50"
                value="${escapeHtml(localStorage.getItem('comnet_saved_author_name') || '')}"
              >
              <textarea 
                id="commentTextInput" 
                class="comment-textarea-field" 
                placeholder="ร่วมแลกเปลี่ยนความคิดเห็นหรือข้อเสนอแนะเกี่ยวกับบทความนี้..." 
                rows="3" 
                maxlength="500"
                required
              ></textarea>
              <div class="comment-form-actions">
                <span class="comment-char-count" id="commentCharCount">0 / 500 ตัวอักษร</span>
                <button type="submit" class="btn-submit-comment" id="submitCommentBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  <span>ส่งความคิดเห็น (Post)</span>
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <!-- Tab Content: Single Record JSON -->
      <div id="tabJsonPane" style="display: none;">
        <pre class="json-display-pre" id="singleRecordJsonPre">${syntaxHighlight(item)}</pre>
      </div>
    `;

    els.articleModalFooter.innerHTML = `
      <div style="font-size:0.82rem; color: var(--text-dim);">
        Record ID: <code>${item.id}</code>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary btn-sm" id="copyItemJsonBtn">
          คัดลอก JSON ของข่าวนี้
        </button>
        <a href="${postWebUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
          <span>เปิดอ่านบนเว็บจริง</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      </div>
    `;

    // Render Initial Comments List
    const commentsListContainer = document.getElementById('modalCommentsList');
    renderCommentsList(comments, commentsListContainer);

    // Modal Like Button Interaction
    const modalLikeBtn = document.getElementById('modalArticleLikeBtn');
    modalLikeBtn.addEventListener('click', () => {
      toggleArticleLike(item.id, item.slug).then(res => {
        showToast(res.liked ? 'ขอบคุณสำหรับความถูกใจ! ❤️' : 'ยกเลิกถูกใจแล้ว');
      });
    });

    // Share Facebook Button Interaction
    const shareFbBtn = document.getElementById('modalShareFbBtn');
    if (shareFbBtn) {
      shareFbBtn.addEventListener('click', () => {
        const url = shareFbBtn.getAttribute('data-url');
        const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        window.open(fbShareUrl, 'facebook-share-dialog', 'width=800,height=600');
      });
    }

    // Copy Link Button Interaction
    const copyLinkBtn = document.getElementById('modalCopyLinkBtn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        const url = copyLinkBtn.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          showToast('คัดลอกลิงก์สำเร็จ 🔗');
        }).catch(err => {
          showToast('ไม่สามารถคัดลอกลิงก์ได้');
          console.error('Copy to clipboard failed', err);
        });
      });
    }

    // Character Counter
    const commentTextInput = document.getElementById('commentTextInput');
    const commentCharCount = document.getElementById('commentCharCount');
    commentTextInput.addEventListener('input', () => {
      commentCharCount.textContent = `${commentTextInput.value.length} / 500 ตัวอักษร`;
    });

    // Fetch Live Comments Button
    const btnFetchComments = document.getElementById('btnFetchComments');
    const refreshLiveDetails = async () => {
      btnFetchComments.classList.add('loading');
      btnFetchComments.disabled = true;

      try {
        const detail = await fetchPostDetail(item.id, item.slug);
        if (detail) {
          // Render rich content if available
          const parsed = parseWixRichContent(detail.richContent);
          if (parsed) {
            const bodyEl = document.getElementById('detailBodyContent');
            if (bodyEl) bodyEl.innerHTML = `<div class="rich-content-container">${parsed}</div>`;
          }

          // Update Cover Image if available
          if (detail.coverImage) {
            const coverEl = document.getElementById('detailCoverImageContainer');
            if (coverEl) coverEl.innerHTML = `<img src="${escapeHtml(detail.coverImage)}" alt="${escapeHtml(detail.title)}" class="detail-hero-img">`;
          }

          // Update Author Data
          const fetchedAuthor = detail.author || {};
          const fetchedAuthorName = fetchedAuthor.name || 'ComNet Mekhong';
          const fetchedAuthorPhoto = fetchedAuthor.profileImage;
          const fetchedAuthorInit = (fetchedAuthorName.trim()[0] || 'C').toUpperCase();
          const authorBox = document.getElementById('detailAuthorInfoBox');
          if (authorBox) {
            authorBox.innerHTML = `
              <div class="detail-author-avatar-wrapper">
                ${fetchedAuthorPhoto
                ? `<img src="${escapeHtml(fetchedAuthorPhoto)}" alt="${escapeHtml(fetchedAuthorName)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'author-avatar-placeholder\\'>${fetchedAuthorInit}</div>';">`
                : `<div class="author-avatar-placeholder">${fetchedAuthorInit}</div>`
              }
              </div>
              <div>
                <div class="detail-author-title">
                  ${escapeHtml(fetchedAuthorName)}
                  <svg class="author-verified-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div class="detail-author-sub">เผยแพร่เมื่อ: ${formatThaiDate(detail.publishedDate || item.publishedDate)}</div>
              </div>
            `;
          }

          // Show API Strip
          const apiStrip = document.getElementById('modalApiStrip');
          if (apiStrip && detail._endpointUrl) {
            const ms = detail._latency || 0;
            apiStrip.innerHTML = `
              <div class="api-strip-content">
                <span class="api-strip-badge ${ms > 1000 ? 'slow' : 'fast'}">${detail._status === 200 ? '200 OK' : (detail._status || 'SUCCESS')}</span>
                <span class="api-strip-url">GET ${escapeHtml(detail._endpointUrl)}</span>
                <span class="api-strip-time">${ms}ms</span>
              </div>
            `;
            apiStrip.style.display = 'block';
          }

          // Sync likes
          syncLikeUi(item.id, detail.totalLikes, getUserLikedState(item.id));

          // Sync comments
          renderCommentsList(detail.comments, commentsListContainer);
          syncCommentCountUi(item.id, detail.comments.length);

          // Update JSON inspector in modal
          const jsonPre = document.getElementById('singleRecordJsonPre');
          if (jsonPre) jsonPre.innerHTML = syntaxHighlight(detail);

          showToast(`ดึงข้อมูลบทความล่าสุดสำเร็จ 🔄`);
        }
      } catch (err) {
        showToast('ไม่สามารถดึงข้อมูลบทความจากเซิร์ฟเวอร์ได้');
      } finally {
        btnFetchComments.classList.remove('loading');
        btnFetchComments.disabled = false;
      }
    };

    btnFetchComments.addEventListener('click', refreshLiveDetails);

    // Initial Live Fetch in background when modal opens
    refreshLiveDetails();

    // Post Comment Form Handling
    const commentPostForm = document.getElementById('commentPostForm');
    const commentAuthorInput = document.getElementById('commentAuthorInput');
    const submitCommentBtn = document.getElementById('submitCommentBtn');

    commentPostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const authorVal = commentAuthorInput.value;
      const contentVal = commentTextInput.value;

      if (!contentVal.trim()) {
        showToast('กรุณากรอกข้อความความคิดเห็นก่อนส่ง');
        commentTextInput.focus();
        return;
      }

      submitCommentBtn.disabled = true;
      submitCommentBtn.style.opacity = '0.7';

      try {
        const posted = await submitComment(item.id, item.slug, authorVal, contentVal);
        commentTextInput.value = '';
        commentCharCount.textContent = '0 / 500 ตัวอักษร';

        const curDetail = state.details[item.id];
        const commentsArr = curDetail ? curDetail.comments : [posted];
        renderCommentsList(commentsArr, commentsListContainer);
        syncCommentCountUi(item.id, commentsArr.length);

        const firstCard = commentsListContainer.querySelector('.comment-card');
        if (firstCard) firstCard.classList.add('newly-added');

        showToast('ส่งความคิดเห็นเรียบร้อยแล้ว! 💬');
      } catch (err) {
        showToast(`เกิดข้อผิดพลาด: ${err.message}`);
      } finally {
        submitCommentBtn.disabled = false;
        submitCommentBtn.style.opacity = '1';
      }
    });

    // Tab Switching
    const tabContentBtn = document.getElementById('tabContentBtn');
    const tabJsonBtn = document.getElementById('tabJsonBtn');
    const tabContentPane = document.getElementById('tabContentPane');
    const tabJsonPane = document.getElementById('tabJsonPane');

    tabContentBtn.addEventListener('click', () => {
      tabContentBtn.classList.add('active');
      tabJsonBtn.classList.remove('active');
      tabContentPane.style.display = 'block';
      tabJsonPane.style.display = 'none';
    });

    tabJsonBtn.addEventListener('click', () => {
      tabJsonBtn.classList.add('active');
      tabContentBtn.classList.remove('active');
      tabContentPane.style.display = 'none';
      tabJsonPane.style.display = 'block';
    });

    document.getElementById('copyItemJsonBtn').addEventListener('click', () => {
      const dataToCopy = state.details[item.id] || item;
      navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2)).then(() => {
        showToast('คัดลอก JSON บทความนี้เรียบร้อยแล้ว!');
      });
    });

    els.heroSection.style.display = 'none';
    els.apiHudSection.style.display = 'none';
    els.newsGrid.style.display = 'none';
    els.articlePageView.style.display = 'block';

    // Update URL history
    const currentUrl = new URL(window.location);
    if (currentUrl.searchParams.get('post') !== item.id) {
      history.pushState({ postId: item.id }, '', '?post=' + item.id);
    }
    window.scrollTo(0, 0);

    // Auto scroll to comments if requested
    if (scrollToComments) {
      setTimeout(() => {
        const commentsSec = document.getElementById('modalCommentsSection');
        if (commentsSec) {
          commentsSec.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    }
  }

  function closeArticlePage() {
    els.articlePageView.style.display = 'none';
    els.heroSection.style.display = 'flex';
    els.apiHudSection.style.display = 'block';
    els.newsGrid.style.display = 'grid';
    state.activeArticle = null;
    history.pushState({}, '', window.location.pathname);
    window.scrollTo(0, 0);
  }

  // ==========================================
  // Raw JSON Inspector Modal
  // ==========================================
  function openJsonInspector() {
    if (!state.rawPayload) {
      els.jsonPreBox.textContent = 'ยังไม่มีข้อมูล API กรุณากด Fetch API ก่อน';
      els.jsonSizeLabel.textContent = 'Empty';
    } else {
      els.jsonPreBox.innerHTML = syntaxHighlight(state.rawPayload);
      const sizeKB = (new Blob([JSON.stringify(state.rawPayload)]).size / 1024).toFixed(1);
      els.jsonSizeLabel.textContent = `Payload Size: ${sizeKB} KB (${state.items.length} records)`;
    }

    els.jsonViewerModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeJsonInspector() {
    els.jsonViewerModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // ==========================================
  // Helper: Escape HTML
  // ==========================================
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // Event Listeners Setup
  // ==========================================
  function initEventListeners() {
    // Fetch Trigger Form
    els.fetchApiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      state.endpointUrl = els.endpointUrlInput.value.trim();
      state.limit = parseInt(els.limitSelect.value, 10);
      state.skip = parseInt(els.skipInput.value, 10);
      fetchNewsData();
    });

    // Limit and Skip Selectors
    els.limitSelect.addEventListener('change', () => {
      state.limit = parseInt(els.limitSelect.value, 10);
      fetchNewsData();
    });

    els.skipInput.addEventListener('change', () => {
      state.skip = parseInt(els.skipInput.value, 10);
      fetchNewsData();
    });

    // Preset Queries
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (preset === 'all') {
          els.limitSelect.value = '12';
          els.skipInput.value = '0';
          state.endpointUrl = `${CONFIG.API_BASE_URL}/news`;
          els.endpointUrlInput.value = state.endpointUrl;
        } else if (preset === 'first3') {
          els.limitSelect.value = '3';
          els.skipInput.value = '0';
          state.endpointUrl = `${CONFIG.API_BASE_URL}/news`;
          els.endpointUrlInput.value = state.endpointUrl;
        } else if (preset === 'page2') {
          els.limitSelect.value = '3';
          els.skipInput.value = '3';
          state.endpointUrl = `${CONFIG.API_BASE_URL}/news`;
          els.endpointUrlInput.value = state.endpointUrl;
        } else if (preset === 'single') {
          els.limitSelect.value = '1';
          els.skipInput.value = '0';
          state.endpointUrl = `${CONFIG.API_BASE_URL}/news`;
          els.endpointUrlInput.value = state.endpointUrl;
        } else if (preset === 'detail') {
          state.endpointUrl = `${CONFIG.API_BASE_URL}/postDetail?id=69e77b508b2f11ff8e593dca`;
          els.endpointUrlInput.value = state.endpointUrl;
        }
        state.limit = parseInt(els.limitSelect.value, 10);
        state.skip = parseInt(els.skipInput.value, 10);
        fetchNewsData();
      });
    });

    // Search Input
    els.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      els.searchClearBtn.classList.toggle('visible', state.searchQuery.length > 0);
      renderArticles();
    });

    els.searchClearBtn.addEventListener('click', () => {
      els.searchInput.value = '';
      state.searchQuery = '';
      els.searchClearBtn.classList.remove('visible');
      renderArticles();
    });

    // Year Filter Pills
    els.yearFilterGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      document.querySelectorAll('#yearFilterGroup .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedYear = btn.getAttribute('data-year');
      renderArticles();
    });

    // Sort Dropdown
    els.sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderArticles();
    });

    // View Toggle (Grid / List)
    els.viewGridBtn.addEventListener('click', () => {
      state.viewMode = 'grid';
      els.viewGridBtn.classList.add('active');
      els.viewListBtn.classList.remove('active');
      els.newsGrid.classList.remove('list-view');
    });

    els.viewListBtn.addEventListener('click', () => {
      state.viewMode = 'list';
      els.viewListBtn.classList.add('active');
      els.viewGridBtn.classList.remove('active');
      els.newsGrid.classList.add('list-view');
    });

    // Reset Filters
    els.resetFilterBtn.addEventListener('click', () => {
      els.searchInput.value = '';
      state.searchQuery = '';
      els.searchClearBtn.classList.remove('visible');
      state.selectedYear = 'all';
      document.querySelectorAll('#yearFilterGroup .pill-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-year') === 'all');
      });
      renderArticles();
    });

    // Retry Fetch
    els.retryFetchBtn.addEventListener('click', fetchNewsData);

    // Raw JSON Inspector Modal
    els.openJsonViewerBtn.addEventListener('click', openJsonInspector);
    els.closeJsonModalBtn.addEventListener('click', closeJsonInspector);
    els.jsonViewerModal.addEventListener('click', (e) => {
      if (e.target === els.jsonViewerModal) closeJsonInspector();
    });

    els.copyJsonBtn.addEventListener('click', () => {
      if (!state.rawPayload) return;
      navigator.clipboard.writeText(JSON.stringify(state.rawPayload, null, 2)).then(() => {
        showToast('คัดลอก Raw JSON ทั้งหมดเรียบร้อยแล้ว!');
      });
    });

    // Article Page Close & History
    els.closeArticlePageBtn.addEventListener('click', closeArticlePage);

    window.addEventListener('popstate', (e) => {
      const urlParams = new URLSearchParams(window.location.search);
      const postId = urlParams.get('post');
      if (!postId && state.activeArticle) {
        // Back to main page
        closeArticlePage();
      } else if (postId && (!state.activeArticle || state.activeArticle.id !== postId)) {
        // Actually we would fetch and open it, but for simplicity:
        // if user hits back/forward and it's a post, we just reload the page to handle it properly
        window.location.reload();
      }
    });

    // Keyboard ESC to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.activeArticle) closeArticlePage();
        closeJsonInspector();
      }
    });
  }

  // ==========================================
  // Initialization
  // ==========================================
  function init() {
    initEventListeners();

    // Check if URL has ?post= to load an article automatically
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('post');
    const preloader = document.getElementById('globalPreloader');

    if (postId && preloader) {
      preloader.style.display = 'flex'; // Show preload immediately
    }

    // Set initial URL in UI
    els.endpointUrlInput.value = state.endpointUrl;

    fetchNewsData().then(() => {
      if (postId) {
        const found = state.items.find(i => i.id === postId);
        if (found) {
          openArticlePage(found);
          if (preloader) preloader.style.display = 'none';
        } else {
           if (preloader) preloader.style.display = 'none';
           showToast('ไม่พบบทความที่ต้องการ');
        }
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
