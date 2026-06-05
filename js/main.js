/**
 * main.js — BitComing GitHub Pages
 *
 * Modules:
 *  1. Theme   — dark/light mode toggle with localStorage persistence
 *  2. Sidebar — collapse/expand sidebar with localStorage persistence
 *  3. Posts   — fetch manifest.json, parse YAML frontmatter from .md files
 *  4. Article — Markdown reading view with marked.js + cache
 *  5. Nav     — active nav-link tracking via IntersectionObserver
 *  6. Reveal  — fade-in animation for sections via IntersectionObserver
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
    // If last segment is empty or an html file, strip it to get the dir
    if (last === '' || last.endsWith('.html')) {
        return pathname.replace(last, '');
    }
    // Pathname ends with a directory (e.g. /BitComing.github.io/)
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
    // Use system preference as default
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
   2. Sidebar Collapse Module
   =================================================== */

/** Key used to persist sidebar collapsed state in localStorage. */
const SIDEBAR_KEY = 'bc-sidebar';

/**
 * Applies sidebar collapsed or expanded state.
 * @param {boolean} collapsed
 */
function applySidebar(collapsed) {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (!sidebar) return;
    if (collapsed) {
        sidebar.classList.add('collapsed');
        if (toggleBtn) toggleBtn.textContent = '▶';
    } else {
        sidebar.classList.remove('collapsed');
        if (toggleBtn) toggleBtn.textContent = '◀';
    }
}

/**
 * Initialises sidebar state from localStorage.
 */
function initSidebar() {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    applySidebar(saved === 'collapsed');
}

/**
 * Binds click event on the sidebar toggle button.
 */
function bindSidebarToggle() {
    const btn = document.getElementById('sidebar-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
        const sidebar = document.querySelector('.sidebar');
        const collapsed = sidebar.classList.contains('collapsed');
        const next = !collapsed;
        applySidebar(next);
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    });
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

    // Frontmatter only recognised when the file starts with ---
    if (!markdown.startsWith('---')) {
        return { meta: meta, body: body };
    }

    // Find the closing --- (starting from position 3, after the first ---)
    const end = markdown.indexOf('\n---', 3);
    if (end === -1) {
        // No closing delimiter — treat the whole file as body
        return { meta: meta, body: body };
    }

    const fmBlock = markdown.substring(4, end); // skip first "---\n"
    body = markdown.substring(end + 4).trimStart(); // skip "\n---\n"

    // Parse each line as "key: value"
    fmBlock.split('\n').forEach(function (line) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return; // skip lines without a colon

        const key = line.substring(0, colonIdx).trim();
        let value = line.substring(colonIdx + 1).trim();

        // Strip surrounding quotes (single or double)
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (key) {
            meta[key] = value;
        }
    });

    return { meta: meta, body: body };
}

/**
 * Fetches manifest.json (a flat list of .md filenames), then fetches each
 * .md file, parses its YAML frontmatter for metadata, and renders the
 * article list.  Markdown bodies are cached so the modal can reuse them.
 */
async function loadPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const basePath = getBasePath();

    try {
        // 1. Fetch the manifest — just a list of filenames
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

        // 2. Fetch every .md file and parse its frontmatter
        /** @type {Array<{title:string, description:string, date:string, file:string}>} */
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

                // Cache the parsed result for the modal
                _postCache.set(filePath, { meta: meta, body: body });

                posts.push({
                    title:       meta.title       || filename,
                    description: meta.description || '',
                    date:        meta.date        || '',
                    file:        filePath
                });
            } catch (err) {
                console.warn('[Posts] 解析失败:', filePath, err);
            }
        }));

        if (posts.length === 0) {
            container.innerHTML = '<p class="error">暂无文章</p>';
            return;
        }

        // 3. Sort newest first
        posts.sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        // 4. Render HTML
        container.innerHTML = posts.map(function (post) {
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
                '</article>'
            ].join('\n');
        }).join('\n');

        // 5. Attach open-article handlers to every post link
        container.querySelectorAll('.post-link').forEach(function (link) {
            link.addEventListener('click', function () {
                openArticleView(link.dataset.file, link.dataset.title, basePath);
            });
            link.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openArticleView(link.dataset.file, link.dataset.title, basePath);
                }
            });
        });

    } catch (err) {
        console.error('[Posts] 加载失败:', err);
        container.innerHTML = '<p class="error">加载文章列表失败，请刷新重试</p>';
    }
}

/* ===================================================
   4. Article View Module
   =================================================== */

/**
 * Shows the article view in the content section, hiding other sections.
 */
function showArticleView() {
    const articleView = document.getElementById('article-view');
    const sections = document.querySelectorAll('.fade-section:not(#article-view)');
    
    sections.forEach(function (section) {
        section.style.display = 'none';
    });
    
    articleView.style.display = 'block';
    articleView.classList.add('visible');
}

/**
 * Hides the article view and shows all other sections.
 */
function hideArticleView() {
    const articleView = document.getElementById('article-view');
    const sections = document.querySelectorAll('.fade-section:not(#article-view)');
    
    sections.forEach(function (section) {
        section.style.display = 'block';
    });
    
    articleView.style.display = 'none';
    articleView.classList.remove('visible');
    
    document.getElementById('article-title').textContent = '';
    document.getElementById('article-body').innerHTML = '';
}

/**
 * Fetches a Markdown file (or reads from cache), renders it with marked.js,
 * and displays it in the article view section.
 * @param {string} filePath  Relative path to the .md file (e.g. "posts/react-learning.md")
 * @param {string} title     Article title to show
 * @param {string} basePath  Base URL prefix
 */
async function openArticleView(filePath, title, basePath) {
    const articleView  = document.getElementById('article-view');
    const articleTitle = document.getElementById('article-title');
    const articleBody  = document.getElementById('article-body');
    
    if (!articleView || !articleTitle || !articleBody) {
        console.error('[Article] 无法找到文章视图元素');
        return;
    }

    articleTitle.textContent = title || '文章';
    articleBody.innerHTML = '<p class="loading">加载中…</p>';
    
    document.getElementById('about').style.display = 'none';
    document.getElementById('posts').style.display = 'none';
    document.getElementById('contact').style.display = 'none';
    
    articleView.style.opacity = '1';
    articleView.style.transform = 'translateY(0)';
    articleView.style.display = 'block';

    try {
        /** @type {string} */
        let markdown = '';

        const cached = _postCache.get(filePath);
        if (cached && typeof cached.body === 'string' && cached.body.length > 0) {
            markdown = cached.body;
        } else {
            const url = basePath + filePath;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const raw = await response.text();
            const parsed = parseFrontmatter(raw);
            markdown = parsed.body;
            _postCache.set(filePath, parsed);
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

    } catch (err) {
        console.error('[Article] 加载文章失败:', err);
        articleBody.innerHTML = '<p class="error">文章加载失败，请检查网络后重试</p>';
    }
}

/**
 * Binds the back button click handler to return to home view.
 */
function bindBackButton() {
    const backBtn = document.getElementById('back-btn');
    if (!backBtn) return;
    
    backBtn.addEventListener('click', function () {
        hideArticleView();
        const aboutSection = document.getElementById('about');
        if (aboutSection) {
            aboutSection.scrollIntoView({ behavior: 'smooth' });
        }
    });
}

/* ===================================================
   5. Navigation Active-State Module
   =================================================== */

/**
 * Uses IntersectionObserver to track which section is currently in the
 * viewport and marks the corresponding nav-link as active.
 */
function initNavObserver() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');
    if (!sections.length || !navLinks.length) return;

    /** @type {string} id of the currently active section */
    let activeId = sections[0].id;

    const observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    activeId = entry.target.id;
                    updateActiveLink(activeId, navLinks);
                }
            });
        },
        {
            rootMargin: '-30% 0px -60% 0px',
            threshold: 0
        }
    );

    sections.forEach(function (section) {
        observer.observe(section);
    });

    // Keep active link in sync when user clicks a nav link
    navLinks.forEach(function (link) {
        link.addEventListener('click', function () {
            const target = link.getAttribute('href').replace('#', '');
            updateActiveLink(target, navLinks);
        });
    });
}

/**
 * Updates the active class on nav links to match the current section id.
 * @param {string} activeId  The id of the active section
 * @param {NodeList} links   All .nav-link elements
 */
function updateActiveLink(activeId, links) {
    links.forEach(function (link) {
        const href = link.getAttribute('href');
        if (href === '#' + activeId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

/* ===================================================
   6. Section Reveal Animation Module
   =================================================== */

/**
 * Observes .fade-section elements and adds the .visible class
 * when they enter the viewport, triggering CSS fade + slide animation.
 */
function initRevealObserver() {
    const sections = document.querySelectorAll('.fade-section');
    if (!sections.length) return;

    // If IntersectionObserver is not supported, just show everything
    if (!('IntersectionObserver' in window)) {
        sections.forEach(function (s) { s.classList.add('visible'); });
        return;
    }

    const observer = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // Stop observing once revealed — no need to re-animate
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.08
        }
    );

    sections.forEach(function (section) {
        observer.observe(section);
    });
}

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

    // 3. Apply sidebar collapsed state
    initSidebar();

    // 4. Wire up sidebar toggle button
    bindSidebarToggle();

    // 5. Load & render post list
    loadPosts();

    // 6. Wire back button handler
    bindBackButton();

    // 7. Track active nav section on scroll
    initNavObserver();

    // 8. Animate sections into view
    initRevealObserver();
});
