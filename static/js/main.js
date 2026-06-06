/**
 * main.js — BitComing GitHub Pages
 *
 * Modules:
 *  1. Theme   — dark/light mode toggle with localStorage persistence
 *  2. Tabs    — top navigation tab switching (with hash URL updates)
 *  3. Posts   — fetch manifest.json, parse YAML frontmatter from .md files
 *  4. Article — Markdown reading view with marked.js + cache
 *  5. Router  — hash-based SPA routing (#/about, #/posts, #/contact, #/posts/file.md)
 */

'use strict';

/* ===================================================
   Utility
   =================================================== */

/**
 * Returns the base path for resolving relative asset URLs.
 * Handles both GitHub Pages sub-path deployment and local dev.
 * @returns {string} base path string (ends with '/' or is '')
 */
function getBasePath() {
    const pathname = window.location.pathname;
    const last = pathname.split('/').pop();
    if (last === '' || last.endsWith('.html')) {
        return pathname.replace(last, '');
    }
    return pathname.endsWith('/') ? pathname : pathname + '/';
}

/* ===================================================
   1. Theme Module
   =================================================== */

/** Key used to persist theme choice in localStorage. */
const THEME_KEY = 'bc-theme';

/**
 * Applies the given theme to <html> element and updates toggle button icon.
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
    const html = document.documentElement;
    const btn = document.getElementById('theme-toggle');
    if (theme === 'dark') {
        html.classList.add('dark');
        if (btn) btn.textContent = '●';
    } else {
        html.classList.remove('dark');
        if (btn) btn.textContent = '○';
    }
}

/**
 * Initialises theme from localStorage or system preference.
 */
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
        applyTheme(saved);
        return;
    }
    const prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
}

/**
 * Binds click event on the theme toggle button.
 */
function bindThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
        const isDark = document.documentElement.classList.contains('dark');
        const next = isDark ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    });
}

/* ===================================================
   2. Tab Switching Module
   =================================================== */

/** @type {string} The currently active tab name */
let _currentTab = 'about';

/**
 * Internal: switches to the specified tab panel without touching the URL.
 * @param {string} tabName  — 'about', 'posts', or 'contact'
 */
function switchTabInternal(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(function (btn) {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
        if (panel.id === 'tab-' + tabName) {
            panel.classList.add('active');
            panel.style.display = 'block';
        } else {
            panel.classList.remove('active');
            panel.style.display = 'none';
        }
    });

    // Ensure article view is hidden
    hideArticleViewSilent();

    _currentTab = tabName;

    // Scroll to absolute top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Public: navigates to a tab, updating the URL hash.
 * @param {string} tabName
 */
function switchTab(tabName) {
    var targetHash = '#/' + tabName;
    if (location.hash === targetHash) {
        // Already on this hash — still update UI (initial load / direct call)
        switchTabInternal(tabName);
        return;
    }
    location.hash = targetHash;
    // UI update will be triggered by hashchange → handleRoute()
}

/**
 * Binds click events to all tab buttons (including brand logo).
 */
function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            const tabName = el.dataset.tab;
            if (tabName) {
                switchTab(tabName);
            }
        });
    });
}

/**
 * Shows the article view, hiding all tab panels.
 */
function showArticleView() {
    document.querySelectorAll('.tab-panel:not(#article-view)').forEach(function (panel) {
        panel.classList.remove('active');
        panel.style.display = 'none';
    });

    // Deactivate all tab buttons
    document.querySelectorAll('.tab').forEach(function (btn) {
        btn.classList.remove('active');
    });

    const articleView = document.getElementById('article-view');
    articleView.classList.add('active');
    articleView.style.display = 'block';
}

/**
 * Hides the article view and restores the last active tab panel.
 */
function hideArticleView() {
    hideArticleViewSilent();
    // Restore the previously active tab (internal — no URL change needed here)
    switchTabInternal(_currentTab);
}

/**
 * Hides the article view without restoring a tab (used when switching tabs while article is open).
 */
function hideArticleViewSilent() {
    const articleView = document.getElementById('article-view');
    articleView.classList.remove('active');
    articleView.style.display = 'none';

    document.getElementById('article-title').textContent = '';
    document.getElementById('article-tags').innerHTML = '';
    document.getElementById('article-body').innerHTML = '';
}

/* ===================================================
   3. Posts Module
   =================================================== */

/**
 * Cache for parsed markdown files.
 * Key: file path (e.g. "posts/react-learning.md")
 * Value: { meta: {title, date, description, ...}, body: string }
 */
const _postCache = new Map();

/** @type {Array<{title:string, description:string, date:string, file:string, tags:string[]}>} */
let _allPosts = [];

/** @type {string|null} Currently active tag filter (null = show all) */
let _activeTag = null;

/**
 * Parses YAML frontmatter from a markdown string.
 *
 * Frontmatter must be at the very start of the file, delimited by `---`
 * on its own line before and after the YAML block.  Supports simple
 * key: value pairs (no nesting, no lists).  Values may be quoted.
 *
 * @param {string} markdown  Raw markdown text (may include frontmatter)
 * @returns {{ meta: Record<string,string>, body: string }}
 *   - meta:  parsed key-value pairs from the frontmatter block
 *   - body:  everything after the closing `---` (the article content)
 */
function parseFrontmatter(markdown) {
    const meta = {};
    let body = markdown;

    if (!markdown.startsWith('---')) {
        return { meta: meta, body: body };
    }

    const end = markdown.indexOf('\n---', 3);
    if (end === -1) {
        return { meta: meta, body: body };
    }

    const fmBlock = markdown.substring(4, end);
    body = markdown.substring(end + 4).trimStart();

    const lines = fmBlock.split('\n');
    let currentListKey = null;
    let currentList = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Collect indented list items (e.g. "  - 技术")
        const listMatch = line.match(/^\s+-\s+(.+)/);
        if (listMatch && currentListKey) {
            currentList.push(listMatch[1].trim());
            continue;
        }

        // Flush any accumulated list before processing a new key
        if (currentListKey) {
            meta[currentListKey] = currentList;
            currentListKey = null;
            currentList = [];
        }

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.substring(0, colonIdx).trim();
        let value = line.substring(colonIdx + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (key && value) {
            meta[key] = value;
        } else if (key && !value) {
            // Potential YAML list — start collecting subsequent "  - item" lines
            currentListKey = key;
            currentList = [];
        }
    }

    // Flush the last list if present
    if (currentListKey) {
        meta[currentListKey] = currentList;
    }

    return { meta: meta, body: body };
}

/**
 * Renders the post list into #posts-container from the given posts array.
 * @param {Array<{title:string, description:string, date:string, file:string, tags:string[]}>} posts
 */
function renderPostList(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    if (posts.length === 0) {
        container.innerHTML = '<p class="error">没有匹配的文章</p>';
        return;
    }

    container.innerHTML = posts.map(function (post) {
        // Build tag badges HTML
        var tagsHtml = '';
        if (Array.isArray(post.tags) && post.tags.length > 0) {
            tagsHtml = '<div class="post-tags">' +
                post.tags.map(function (tag) {
                    return '<span class="post-tag" data-tag="' + escapeAttr(tag) + '" role="button" tabindex="0">#' +
                        escapeHtml(tag) +
                    '</span>';
                }).join('') +
            '</div>';
        }

        return [
            '<article>',
            '  <h3>',
            '    <a class="post-link" data-file="' + escapeAttr(post.file) + '"',
            '       data-title="' + escapeAttr(post.title) + '"',
            '       role="button" tabindex="0">',
            escapeHtml(post.title),
            '    </a>',
            '  </h3>',
            '  <p>' + escapeHtml(post.description) + '</p>',
            '  <span class="date">' + escapeHtml(post.date) + '</span>',
            tagsHtml,
            '</article>'
        ].join('\n');
    }).join('\n');

    // Attach open-article handlers to every post link
    container.querySelectorAll('.post-link').forEach(function (link) {
        link.addEventListener('click', function () {
            openArticleView(link.dataset.file, link.dataset.title);
        });
        link.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openArticleView(link.dataset.file, link.dataset.title);
            }
        });
    });

    // Attach tag-filter handlers to every post tag badge
    container.querySelectorAll('.post-tag').forEach(function (tagEl) {
        tagEl.addEventListener('click', function (e) {
            e.stopPropagation(); // don't trigger article open
            handleTagClick(tagEl.dataset.tag);
        });
        tagEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                handleTagClick(tagEl.dataset.tag);
            }
        });
    });
}

/**
 * Builds the tag filter sidebar from _allPosts.
 * Sorts tags by article count descending.
 */
function buildTagFilter() {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return;

    // Count posts per tag
    const tagCounts = {};
    _allPosts.forEach(function (post) {
        if (Array.isArray(post.tags)) {
            post.tags.forEach(function (tag) {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    // Sort by count descending
    const sortedTags = Object.entries(tagCounts).sort(function (a, b) {
        return b[1] - a[1];
    });

    if (sortedTags.length === 0) {
        tagList.innerHTML = '<li class="tag-loading">暂无标签</li>';
        return;
    }

    tagList.innerHTML = sortedTags.map(function (entry) {
        var tag = entry[0];
        var count = entry[1];
        return '<li>' +
            '<button class="tag-item" data-tag="' + escapeAttr(tag) + '">' +
                '<span class="tag-name">' + escapeHtml(tag) + '</span>' +
                '<span class="tag-count">' + count + '</span>' +
            '</button>' +
        '</li>';
    }).join('');

    // Bind click handlers for each tag button
    tagList.querySelectorAll('.tag-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
            handleTagClick(btn.dataset.tag);
        });
    });
}

/**
 * Toggles a tag filter on/off and re-renders the post list.
 * @param {string} tag
 */
function handleTagClick(tag) {
    // Toggle: clicking the active tag deselects it
    if (_activeTag === tag) {
        _activeTag = null;
    } else {
        _activeTag = tag;
    }

    // Update active class on all tag buttons
    document.querySelectorAll('.tag-item').forEach(function (btn) {
        if (btn.dataset.tag === _activeTag) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Filter posts or show all
    var filtered = _activeTag
        ? _allPosts.filter(function (post) {
            return Array.isArray(post.tags) && post.tags.indexOf(_activeTag) !== -1;
        })
        : _allPosts;

    renderPostList(filtered);

    // Scroll to absolute top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const basePath = getBasePath();

    try {
        const manifestUrl = `${basePath}posts/manifest.json`;
        const manifestResp = await fetch(manifestUrl);
        if (!manifestResp.ok) {
            throw new Error(`Manifest HTTP ${manifestResp.status}`);
        }

        /** @type {string[]} */
        const filenames = await manifestResp.json();

        if (!Array.isArray(filenames) || filenames.length === 0) {
            container.innerHTML = '<p class="error">暂无文章</p>';
            return;
        }

        /** @type {Array<{title:string, description:string, date:string, file:string, tags:string[]}>} */
        const posts = [];

        await Promise.all(filenames.map(async function (filename) {
            const filePath = filename.startsWith('posts/')
                ? filename
                : 'posts/' + filename;

            try {
                const resp = await fetch(basePath + filePath);
                if (!resp.ok) {
                    console.warn('[Posts] 跳过无法加载的文件:', filePath, resp.status);
                    return;
                }
                const raw = await resp.text();
                const { meta, body } = parseFrontmatter(raw);

                _postCache.set(filePath, { meta: meta, body: body });

                posts.push({
                    title:       meta.title       || filename,
                    description: meta.description || '',
                    date:        meta.date        || '',
                    file:        filePath,
                    tags:        Array.isArray(meta.tags) ? meta.tags : []
                });
            } catch (err) {
                console.warn('[Posts] 解析失败:', filePath, err);
            }
        }));

        if (posts.length === 0) {
            container.innerHTML = '<p class="error">暂无文章</p>';
            return;
        }

        posts.sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        // Store globally for filtering
        _allPosts = posts;
        _activeTag = null;

        // Render both the post list and the tag filter sidebar
        renderPostList(posts);
        buildTagFilter();

    } catch (err) {
        console.error('[Posts] 加载失败:', err);
        container.innerHTML = '<p class="error">加载文章列表失败，请刷新重试</p>';
    }
}

/* ===================================================
   4. Article View Module
   =================================================== */

/**
 * Internal: fetches a Markdown file (or reads from cache), renders it with marked.js,
 * and displays it in the article view section — without touching the URL.
 * @param {string} filePath  Relative path to the .md file (e.g. "posts/react-learning.md")
 * @param {string} [title]   Optional article title to show (fetched from cache if omitted)
 */
async function openArticleInternal(filePath, title) {
    const articleView  = document.getElementById('article-view');
    const articleTitle = document.getElementById('article-title');
    const articleTags  = document.getElementById('article-tags');
    const articleBody  = document.getElementById('article-body');

    if (!articleView || !articleTitle || !articleBody) {
        console.error('[Article] 无法找到文章视图元素');
        return;
    }

    articleTitle.textContent = title || '文章';
    articleTags.innerHTML = '';
    articleBody.innerHTML = '<p class="loading">加载中…</p>';

    showArticleView();

    var basePath = getBasePath();

    try {
        /** @type {string} */
        let markdown = '';

        const cached = _postCache.get(filePath);
        if (cached && typeof cached.body === 'string' && cached.body.length > 0) {
            markdown = cached.body;
            // Update title from cache if not provided
            if (!title && cached.meta && cached.meta.title) {
                articleTitle.textContent = cached.meta.title;
            }
        } else {
            const url = basePath + filePath;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            const raw = await response.text();
            const parsed = parseFrontmatter(raw);
            markdown = parsed.body;
            _postCache.set(filePath, parsed);
            // Update title from parsed frontmatter
            if (!title && parsed.meta && parsed.meta.title) {
                articleTitle.textContent = parsed.meta.title;
            }
        }

        // Render tags if available
        const postMeta = _postCache.get(filePath);
        if (postMeta && postMeta.meta && Array.isArray(postMeta.meta.tags) && postMeta.meta.tags.length > 0) {
            articleTags.innerHTML = postMeta.meta.tags.map(function (tag) {
                return '<span class="article-tag-item">#' + escapeHtml(tag) + '</span>';
            }).join('\n');
        }

        /** @type {string} */
        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(markdown);
        } else {
            html = '<pre>' + escapeHtml(markdown) + '</pre>';
        }

        articleBody.innerHTML = html;
        articleBody.scrollTop = 0;

        // Scroll to absolute top of page
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
        console.error('[Article] 加载文章失败:', err);
        articleBody.innerHTML = '<p class="error">文章加载失败，请检查网络后重试</p>';
    }
}

/**
 * Public: navigates to an article, updating the URL hash.
 * @param {string} filePath  Relative path to the .md file (e.g. "posts/react-learning.md")
 * @param {string} [title]   Optional article title
 */
function openArticleView(filePath, title) {
    var targetHash = '#/' + filePath;
    if (location.hash === targetHash) {
        // Already on this hash — still update UI (initial load)
        openArticleInternal(filePath, title);
        return;
    }
    location.hash = targetHash;
    // UI update will be triggered by hashchange → handleRoute()
}

/**
 * Binds the back button click handler to return to the posts tab.
 */
function bindBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (!backBtn) return;

    backBtn.addEventListener('click', function () {
        // Navigate back to the posts list via hash
        location.hash = '#/posts';
        // hashchange → handleRoute() → switchTabInternal('posts')
    });
}

/* ===================================================
   5. Router Module — hash-based SPA routing
   =================================================== */

/**
 * Guard flag to prevent hashchange handler from re-entering
 * while the UI is already being updated.
 * @type {boolean}
 */
let _routing = false;

/**
 * Parses location.hash and dispatches to the correct UI function.
 *
 * Hash scheme:
 *   ''  or '#/'  or '#/about'   → about tab
 *   '#/posts'                   → posts tab
 *   '#/contact'                 → contact tab
 *   '#/posts/filename.md'       → article view
 */
function handleRoute() {
    if (_routing) return;
    _routing = true;

    var hash = location.hash;

    // Normalise: strip leading '#' and trailing slashes
    if (hash.startsWith('#')) {
        hash = hash.slice(1);
    }

    if (hash.startsWith('/posts/')) {
        // Article route: /posts/filename.md
        var filePath = hash.slice(1); // remove leading '/', gives "posts/xxx.md"
        openArticleInternal(filePath).then(function () {
            _routing = false;
        }).catch(function () {
            _routing = false;
        });
    } else if (hash === '/posts') {
        switchTabInternal('posts');
        _routing = false;
    } else if (hash === '/contact') {
        switchTabInternal('contact');
        _routing = false;
    } else {
        // Default: about tab
        switchTabInternal('about');
        _routing = false;
    }
}

/**
 * Listen for browser back/forward and URL changes.
 */
window.addEventListener('hashchange', function () {
    handleRoute();
});

/* ===================================================
   Escape helpers
   =================================================== */

/**
 * Escapes a string for safe insertion as HTML text content.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapes a string for safe use inside an HTML attribute value.
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

/* ===================================================
   Bootstrap — run after DOM is ready
   =================================================== */
document.addEventListener('DOMContentLoaded', function () {
    // 1. Apply saved / preferred theme immediately
    initTheme();

    // 2. Wire up theme toggle button
    bindThemeToggle();

    // 3. Wire up tab switching
    bindTabs();

    // 4. Load & render post list (always needed — post links must exist before routing)
    loadPosts();

    // 5. Wire back button handler
    bindBackButton();

    // 6. Route to the initial URL (restore tab/article from hash, or default to about)
    //    Posts may still be loading, but openArticleInternal will await the cache if needed.
    handleRoute();
});
