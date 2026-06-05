/**
 * main.js — BitComing GitHub Pages
 *
 * Modules:
 *  1. Theme   — dark/light mode toggle with localStorage persistence
 *  2. Posts   — fetch manifest.json, parse YAML frontmatter from .md files
 *  3. Modal   — Markdown reading modal with marked.js + cache
 *  4. Nav     — active nav-link tracking via IntersectionObserver
 *  5. Reveal  — fade-in animation for sections via IntersectionObserver
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
        if (btn) btn.textContent = '☀️';
    } else {
        html.classList.remove('dark');
        if (btn) btn.textContent = '🌙';
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
   2. Posts Module
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

        // 5. Attach open-modal handlers to every post link
        container.querySelectorAll('.post-link').forEach(function (link) {
            link.addEventListener('click', function () {
                openPostModal(link.dataset.file, link.dataset.title, basePath);
            });
            link.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPostModal(link.dataset.file, link.dataset.title, basePath);
                }
            });
        });

    } catch (err) {
        console.error('[Posts] 加载失败:', err);
        container.innerHTML = '<p class="error">加载文章列表失败，请刷新重试</p>';
    }
}

/* ===================================================
   3. Modal Module
   =================================================== */

/** Track whether the modal is currently open. */
let _modalOpen = false;

/**
 * Fetches a Markdown file (or reads from cache), renders it with marked.js,
 * and displays the modal.
 * @param {string} filePath  Relative path to the .md file (e.g. "posts/react-learning.md")
 * @param {string} title     Article title to show in modal header
 * @param {string} basePath  Base URL prefix
 */
async function openPostModal(filePath, title, basePath) {
    const overlay    = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody  = document.getElementById('modal-body');
    if (!overlay || !modalTitle || !modalBody) return;

    // Show modal with loading state first (fast feedback)
    modalTitle.textContent = title || '文章';
    modalBody.innerHTML = '<p class="loading">加载中…</p>';
    overlay.classList.add('open');
    _modalOpen = true;
    document.body.style.overflow = 'hidden';

    try {
        /** @type {string} */
        let markdown = '';

        // Use cached body if available (from loadPosts frontmatter parse)
        const cached = _postCache.get(filePath);
        if (cached && typeof cached.body === 'string' && cached.body.length > 0) {
            markdown = cached.body;
        } else {
            // Fallback: fetch and parse on demand
            const url = basePath + filePath;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const raw = await response.text();
            const parsed = parseFrontmatter(raw);
            markdown = parsed.body;
            // Also cache for later
            _postCache.set(filePath, parsed);
        }

        // Use marked.js (loaded from CDN) to parse Markdown → HTML
        /** @type {string} */
        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(markdown);
        } else {
            // Fallback: display raw markdown in a <pre>
            html = '<pre>' + escapeHtml(markdown) + '</pre>';
        }

        modalBody.innerHTML = html;
        modalBody.scrollTop = 0;

    } catch (err) {
        console.error('[Modal] 加载文章失败:', err);
        modalBody.innerHTML = '<p class="error">文章加载失败，请检查网络后重试</p>';
    }
}

/**
 * Closes the modal overlay.
 */
function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    _modalOpen = false;
    document.body.style.overflow = '';
}

/**
 * Binds all modal close triggers:
 *  - × close button
 *  - Click on the overlay background (outside container)
 *  - Escape key
 */
function bindModalClose() {
    const overlay   = document.getElementById('modal-overlay');
    const closeBtn  = document.getElementById('modal-close');
    const container = overlay && overlay.querySelector('.modal-container');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (overlay) {
        overlay.addEventListener('click', function (e) {
            // Close only when clicking the backdrop (not the container itself)
            if (container && !container.contains(e.target)) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && _modalOpen) {
            closeModal();
        }
    });
}

/* ===================================================
   4. Navigation Active-State Module
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
   5. Section Reveal Animation Module
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

    // 3. Load & render post list
    loadPosts();

    // 4. Wire modal close handlers
    bindModalClose();

    // 5. Track active nav section on scroll
    initNavObserver();

    // 6. Animate sections into view
    initRevealObserver();
});
