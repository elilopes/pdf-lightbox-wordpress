(function () {
    'use strict';

    const config = window.PSV_CONFIG || {};
    const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    }

    let activeDocument = null;
    let pdfDocument = null;
    let loadingTask = null;
    let renderTask = null;
    let thumbnailObserver = null;
    let pageNumber = 1;
    let zoom = 1.15;
    let rotation = 0;
    let sessionId = 0;
    let renderId = 0;
    let searchCursor = null;

    const createElement = function (tagName, className, text) {
        const node = document.createElement(tagName);

        if (className) {
            node.className = className;
        }

        if (text !== undefined) {
            node.textContent = text;
        }

        return node;
    };

    /*
     * SHA-256 fallback for browsers where SubtleCrypto is unavailable
     * (for example, HTTP pages outside a secure context).
     */
    function sha256Fallback(value) {
        const constants = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
            0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
            0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
            0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
            0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
            0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
            0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
            0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        const hash = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];
        const bytes = Array.from(new TextEncoder().encode(value));
        const bitLength = bytes.length * 8;

        bytes.push(0x80);
        while (bytes.length % 64 !== 56) {
            bytes.push(0);
        }

        const highBits = Math.floor(bitLength / 0x100000000);
        const lowBits = bitLength >>> 0;

        bytes.push(
            (highBits >>> 24) & 0xff,
            (highBits >>> 16) & 0xff,
            (highBits >>> 8) & 0xff,
            highBits & 0xff,
            (lowBits >>> 24) & 0xff,
            (lowBits >>> 16) & 0xff,
            (lowBits >>> 8) & 0xff,
            lowBits & 0xff
        );

        const words = new Array(64);
        const rotateRight = function (number, bits) {
            return (number >>> bits) | (number << (32 - bits));
        };

        for (let offset = 0; offset < bytes.length; offset += 64) {
            for (let index = 0; index < 16; index += 1) {
                const position = offset + (index * 4);
                words[index] = (
                    (bytes[position] << 24) |
                    (bytes[position + 1] << 16) |
                    (bytes[position + 2] << 8) |
                    bytes[position + 3]
                ) >>> 0;
            }

            for (let index = 16; index < 64; index += 1) {
                const x = words[index - 15];
                const y = words[index - 2];
                const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
                const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);

                words[index] = (
                    words[index - 16] +
                    sigma0 +
                    words[index - 7] +
                    sigma1
                ) >>> 0;
            }

            let a = hash[0];
            let b = hash[1];
            let c = hash[2];
            let d = hash[3];
            let e = hash[4];
            let f = hash[5];
            let g = hash[6];
            let h = hash[7];

            for (let index = 0; index < 64; index += 1) {
                const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
                const choice = (e & f) ^ (~e & g);
                const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
                const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
                const majority = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (sum0 + majority) >>> 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) >>> 0;
            }

            hash[0] = (hash[0] + a) >>> 0;
            hash[1] = (hash[1] + b) >>> 0;
            hash[2] = (hash[2] + c) >>> 0;
            hash[3] = (hash[3] + d) >>> 0;
            hash[4] = (hash[4] + e) >>> 0;
            hash[5] = (hash[5] + f) >>> 0;
            hash[6] = (hash[6] + g) >>> 0;
            hash[7] = (hash[7] + h) >>> 0;
        }

        return hash.map(function (part) {
            return part.toString(16).padStart(8, '0');
        }).join('');
    }

    async function hashKey(value) {
        if (window.crypto && window.crypto.subtle) {
            const digest = await window.crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(value)
            );

            return Array.from(new Uint8Array(digest)).map(function (byte) {
                return byte.toString(16).padStart(2, '0');
            }).join('');
        }

        return sha256Fallback(value);
    }

    function getModal() {
        let modal = document.querySelector('.psv-modal');

        if (modal) {
            return modal;
        }

        modal = createElement('div', 'psv-modal');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Visualizador PDF');

        modal.innerHTML = `
            <div class="psv-dialog">
                <header class="psv-toolbar">
                    <strong class="psv-doc-title">Documento PDF</strong>
                    <div class="psv-tools">
                        <button type="button" data-a="prev" aria-label="Página anterior">‹</button>
                        <span class="psv-page-label">1 / 1</span>
                        <button type="button" data-a="next" aria-label="Próxima página">›</button>
                        <button type="button" data-a="minus" aria-label="Diminuir zoom">−</button>
                        <button type="button" data-a="plus" aria-label="Aumentar zoom">+</button>
                        <button type="button" data-a="fit">Ajustar</button>
                        <button type="button" data-a="rotate">↻</button>
                        <button type="button" data-a="search">Buscar</button>
                        <button type="button" data-a="bookmark">☆ Favoritar</button>
                        <button type="button" data-a="note">Anotação</button>
                        <button type="button" data-a="share">Compartilhar página</button>
                        <button type="button" data-a="print" title="Abre o PDF em outra aba">Abrir PDF</button>
                        <button type="button" data-a="download">Baixar</button>
                        <button type="button" data-a="drive">Drive</button>
                        <button type="button" data-a="fullscreen">Tela cheia</button>
                        <button type="button" data-a="close" class="psv-close" aria-label="Fechar">×</button>
                    </div>
                </header>

                <div class="psv-searchbar" hidden>
                    <input type="search" placeholder="Pesquisar no PDF" aria-label="Pesquisar no PDF">
                    <button type="button" data-a="find">Próxima ocorrência</button>
                    <span aria-live="polite"></span>
                </div>

                <div class="psv-body">
                    <aside class="psv-sidebar">
                        <h3>Páginas</h3>
                        <div class="psv-thumbs"></div>
                        <h3>Marcadores</h3>
                        <div class="psv-bookmarks"></div>
                    </aside>

                    <main class="psv-stage">
                        <div class="psv-status">Carregando PDF…</div>
                        <canvas class="psv-canvas" hidden></canvas>
                    </main>

                    <aside class="psv-comments">
                        <h3>Comentários</h3>
                        <div class="psv-comment-list"></div>
                        <div class="psv-reply-context" hidden>
                            Respondendo a <strong></strong>
                            <button type="button" data-a="cancel-reply">Cancelar</button>
                        </div>
                        <form class="psv-comment-form">
                            <label>Nome<input name="name" required maxlength="100"></label>
                            <label>E-mail<input name="email" type="email" required maxlength="190"></label>
                            <label>Comentário<textarea name="comment" required maxlength="5000"></textarea></label>
                            <input name="website" class="psv-honeypot" tabindex="-1" autocomplete="off">
                            <button type="submit">Enviar comentário</button>
                            <small>Comentários e respostas aparecem após moderação. Seu e-mail não será publicado.</small>
                        </form>
                    </aside>
                </div>

                <div class="psv-note-panel" hidden>
                    <label>Anotação particular desta página<textarea></textarea></label>
                    <button type="button" data-a="save-note">Salvar anotação</button>
                    <span aria-live="polite"></span>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', function (event) {
            if (event.target === modal || event.target.closest('[data-a="close"]')) {
                closeViewer();
                return;
            }

            if (event.target.closest('[data-a="cancel-reply"]')) {
                clearReply();
            }
        });

        modal.querySelector('.psv-tools').addEventListener('click', handleToolbarAction);
        modal.querySelector('[data-a="find"]').addEventListener('click', searchText);
        modal.querySelector('.psv-comment-form').addEventListener('submit', submitComment);
        modal.querySelector('[data-a="save-note"]').addEventListener('click', saveNote);

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) {
                closeViewer();
            }
        });

        return modal;
    }

    function readElementData(element) {
        const data = element.dataset;

        return {
            url: data.psvUrl || data.pdf || data.src || element.getAttribute('src'),
            key: data.psvKey || '',
            title: data.psvTitle || data.title || 'Visualizar PDF',
            comments: data.psvComments !== '0' && data.comments !== 'false',
            download: data.psvDownload !== '0' && data.download !== 'false'
        };
    }

    function normalizeDocumentUrl(value) {
        const trimmed = String(value || '').trim();

        if (/^https?:\/\//i.test(trimmed)) {
            // Keep absolute shortcode URLs byte-for-byte: PHP generated the matching key.
            return trimmed;
        }

        return new URL(trimmed, window.location.href).href;
    }

    function cancelCurrentDocument() {
        sessionId += 1;
        renderId += 1;

        if (thumbnailObserver) {
            thumbnailObserver.disconnect();
            thumbnailObserver = null;
        }

        if (renderTask && typeof renderTask.cancel === 'function') {
            renderTask.cancel();
        }
        renderTask = null;

        if (loadingTask && typeof loadingTask.destroy === 'function') {
            loadingTask.destroy();
        }
        loadingTask = null;

        if (pdfDocument && typeof pdfDocument.destroy === 'function') {
            pdfDocument.destroy();
        }
        pdfDocument = null;

        return sessionId;
    }

    async function openFrom(element, requestedPage) {
        const data = readElementData(element);

        if (!data.url) {
            return;
        }

        const currentSession = cancelCurrentDocument();
        activeDocument = null;

        const openingModal = getModal();
        openingModal.classList.add('is-open');
        document.body.classList.add('psv-lock');
        openingModal.querySelector('.psv-status').hidden = false;
        openingModal.querySelector('.psv-status').textContent = 'Preparando documento…';

        let documentUrl;

        try {
            documentUrl = normalizeDocumentUrl(data.url);
            data.key = data.key || await hashKey(documentUrl);
        } catch (error) {
            const modal = getModal();
            modal.classList.add('is-open');
            modal.querySelector('.psv-status').hidden = false;
            modal.querySelector('.psv-status').textContent = 'Não foi possível preparar o endereço do PDF.';
            return;
        }

        if (currentSession !== sessionId) {
            return;
        }

        data.url = documentUrl;
        activeDocument = data;
        pageNumber = Math.max(1, parseInt(requestedPage, 10) || 1);
        zoom = 1.15;
        rotation = 0;
        searchCursor = null;

        const modal = getModal();
        modal.classList.add('is-open');
        document.body.classList.add('psv-lock');

        modal.querySelector('.psv-doc-title').textContent = data.title;
        modal.querySelector('.psv-comments').hidden = !data.comments;
        modal.querySelector('[data-a="drive"]').hidden = !config.googleClientId;
        modal.querySelector('[data-a="download"]').hidden = !data.download;
        modal.querySelector('.psv-status').hidden = false;
        modal.querySelector('.psv-status').textContent = config.strings?.loading || 'Carregando PDF…';
        modal.querySelector('.psv-canvas').hidden = true;
        modal.querySelector('.psv-thumbs').replaceChildren();
        modal.querySelector('.psv-comment-list').textContent = '';
        loadBookmarks();
        clearReply();
        updateBookmarkButton();
        addHistory(data);
        loadNote();

        if (!window.pdfjsLib) {
            modal.querySelector('.psv-status').textContent = 'PDF.js não foi carregado.';
            return;
        }

        try {
            loadingTask = window.pdfjsLib.getDocument({ url: data.url });
            const loadedDocument = await loadingTask.promise;

            if (currentSession !== sessionId) {
                loadedDocument.destroy();
                return;
            }

            pdfDocument = loadedDocument;
            pageNumber = Math.min(pageNumber, pdfDocument.numPages || 1);

            await renderPage(currentSession);
            buildThumbnails(pdfDocument, currentSession);

            if (data.comments) {
                loadComments(currentSession);
            }
        } catch (error) {
            if (currentSession !== sessionId) {
                return;
            }

            modal.querySelector('.psv-status').hidden = false;
            modal.querySelector('.psv-status').textContent =
                config.strings?.loadError || 'Erro ao abrir PDF.';
        }
    }

    function closeViewer() {
        cancelCurrentDocument();
        activeDocument = null;
        searchCursor = null;

        const modal = document.querySelector('.psv-modal');

        if (modal) {
            modal.classList.remove('is-open');
        }

        document.body.classList.remove('psv-lock');
    }

    async function renderPage(expectedSession) {
        const currentSession = expectedSession || sessionId;
        const currentRender = ++renderId;
        const documentToRender = pdfDocument;

        if (!documentToRender || currentSession !== sessionId) {
            return;
        }

        if (renderTask && typeof renderTask.cancel === 'function') {
            renderTask.cancel();
        }
        renderTask = null;

        const modal = getModal();
        const canvas = modal.querySelector('.psv-canvas');
        const context = canvas.getContext('2d');

        try {
            const page = await documentToRender.getPage(pageNumber);

            if (
                currentSession !== sessionId ||
                currentRender !== renderId ||
                documentToRender !== pdfDocument
            ) {
                return;
            }

            const viewport = page.getViewport({
                scale: zoom,
                rotation: rotation
            });
            const pixelRatio = window.devicePixelRatio || 1;

            canvas.width = Math.floor(viewport.width * pixelRatio);
            canvas.height = Math.floor(viewport.height * pixelRatio);
            canvas.style.width = viewport.width + 'px';
            canvas.style.height = viewport.height + 'px';

            renderTask = page.render({
                canvasContext: context,
                viewport: viewport,
                transform: pixelRatio !== 1
                    ? [pixelRatio, 0, 0, pixelRatio, 0, 0]
                    : null
            });

            await renderTask.promise;

            if (currentSession !== sessionId || currentRender !== renderId) {
                return;
            }

            modal.querySelector('.psv-status').hidden = true;
            canvas.hidden = false;
            modal.querySelector('.psv-page-label').textContent =
                pageNumber + ' / ' + documentToRender.numPages;
            modal.querySelector('.psv-stage').scrollTop = 0;

            loadNote();
            updateBookmarkButton();
        } catch (error) {
            // Rendering is intentionally cancelled when a page/document changes.
            if (
                error && error.name !== 'RenderingCancelledException' &&
                currentSession === sessionId &&
                currentRender === renderId
            ) {
                modal.querySelector('.psv-status').hidden = false;
                modal.querySelector('.psv-status').textContent = 'Erro ao renderizar página.';
            }
        } finally {
            if (currentRender === renderId) {
                renderTask = null;
            }
        }
    }

    function buildThumbnails(documentToRender, expectedSession) {
        const modal = getModal();
        const container = modal.querySelector('.psv-thumbs');
        container.replaceChildren();

        if (thumbnailObserver) {
            thumbnailObserver.disconnect();
        }

        const renderThumbnail = async function (button) {
            if (
                button.dataset.rendered === '1' ||
                expectedSession !== sessionId ||
                documentToRender !== pdfDocument
            ) {
                return;
            }

            button.dataset.rendered = '1';

            const number = parseInt(button.dataset.page, 10);
            const canvas = button.querySelector('canvas');

            try {
                const page = await documentToRender.getPage(number);

                if (expectedSession !== sessionId || documentToRender !== pdfDocument) {
                    return;
                }

                const viewport = page.getViewport({ scale: 0.22 });
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);

                const task = page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: viewport
                });

                await task.promise;
            } catch (error) {
                if (error && error.name !== 'RenderingCancelledException') {
                    button.dataset.rendered = 'error';
                }
            }
        };

        for (let number = 1; number <= documentToRender.numPages; number += 1) {
            const button = createElement('button', 'psv-thumb');
            const canvas = createElement('canvas');

            button.type = 'button';
            button.dataset.page = String(number);
            button.append(canvas, createElement('span', '', String(number)));

            button.addEventListener('click', function () {
                pageNumber = number;
                renderPage(expectedSession);
            });

            container.appendChild(button);

            if ('IntersectionObserver' in window) {
                if (!thumbnailObserver) {
                    thumbnailObserver = new IntersectionObserver(function (entries) {
                        entries.forEach(function (entry) {
                            if (entry.isIntersecting) {
                                thumbnailObserver.unobserve(entry.target);
                                renderThumbnail(entry.target);
                            }
                        });
                    }, {
                        root: modal.querySelector('.psv-sidebar'),
                        rootMargin: '160px'
                    });
                }

                thumbnailObserver.observe(button);
            } else if (number <= 4) {
                // Conservative fallback for browsers without IntersectionObserver.
                renderThumbnail(button);
            }
        }
    }

    function storageKey(type) {
        return 'psv_' + type + '_' + activeDocument.key;
    }

    function readStore(type) {
        try {
            return JSON.parse(localStorage.getItem(storageKey(type)) || '[]');
        } catch (error) {
            return [];
        }
    }

    function writeStore(type, value) {
        try {
            localStorage.setItem(storageKey(type), JSON.stringify(value));
        } catch (error) {
            // Storage may be disabled or full; the viewer remains usable.
        }
    }

    function addHistory(data) {
        let history = [];

        try {
            history = JSON.parse(localStorage.getItem('psv_history') || '[]');
        } catch (error) {
            history = [];
        }

        history = history.filter(function (item) {
            return item.url !== data.url;
        });

        history.unshift({
            url: data.url,
            title: data.title,
            at: Date.now()
        });

        try {
            localStorage.setItem('psv_history', JSON.stringify(history.slice(0, 30)));
        } catch (error) {
            // History is optional.
        }
    }

    function loadBookmarks() {
        const container = getModal().querySelector('.psv-bookmarks');
        container.replaceChildren();

        readStore('bookmarks').forEach(function (number) {
            const button = createElement('button', 'psv-bookmark', 'Página ' + number);
            button.type = 'button';

            button.addEventListener('click', function () {
                pageNumber = number;
                renderPage();
            });

            container.appendChild(button);
        });

        updateBookmarkButton();
    }

    function updateBookmarkButton() {
        const modal = document.querySelector('.psv-modal');
        const button = modal && modal.querySelector('[data-a="bookmark"]');

        if (!button || !activeDocument) {
            return;
        }

        const isBookmarked = readStore('bookmarks').includes(pageNumber);
        button.textContent = isBookmarked ? '★ Favoritado' : '☆ Favoritar';
        button.setAttribute('aria-pressed', isBookmarked ? 'true' : 'false');
    }

    function loadNote() {
        const panel = getModal().querySelector('.psv-note-panel');

        if (!panel || !activeDocument) {
            return;
        }

        const note = readStore('notes').find(function (item) {
            return item.page === pageNumber;
        });

        panel.querySelector('textarea').value = note ? note.text : '';
        panel.querySelector('span').textContent = '';
    }

    function saveNote() {
        const panel = getModal().querySelector('.psv-note-panel');
        const text = panel.querySelector('textarea').value.trim();
        const notes = readStore('notes').filter(function (item) {
            return item.page !== pageNumber;
        });

        if (text) {
            notes.push({ page: pageNumber, text: text });
        }

        writeStore('notes', notes);
        panel.querySelector('span').textContent = 'Anotação salva neste navegador.';
    }

    async function loadComments(expectedSession) {
        const list = getModal().querySelector('.psv-comment-list');
        list.textContent = 'Carregando…';

        try {
            const response = await fetch(
                config.restUrl + 'comments?key=' + encodeURIComponent(activeDocument.key)
            );
            const rows = await response.json();

            if (expectedSession !== sessionId) {
                return;
            }

            list.replaceChildren();

            if (!Array.isArray(rows) || !rows.length) {
                list.textContent = 'Nenhum comentário publicado.';
                return;
            }

            rows.filter(function (row) {
                return !Number(row.parent_id);
            }).forEach(function (row) {
                const item = createElement('article', 'psv-comment');
                const author = createElement(
                    'b',
                    '',
                    row.author_name + ' · pág. ' + row.page_number
                );
                const text = createElement('p', '', row.comment_text);
                const reply = createElement('button', 'psv-reply', 'Responder');

                reply.type = 'button';
                reply.addEventListener('click', function () {
                    setReply(row);
                });

                item.append(author, text, reply);

                rows.filter(function (child) {
                    return Number(child.parent_id) === Number(row.id);
                }).forEach(function (child) {
                    const replyItem = createElement('div', 'psv-reply-item');
                    replyItem.append(
                        createElement('b', '', child.author_name + ' respondeu'),
                        createElement('p', '', child.comment_text)
                    );
                    item.appendChild(replyItem);
                });

                list.appendChild(item);
            });
        } catch (error) {
            if (expectedSession === sessionId) {
                list.textContent = 'Erro ao carregar comentários.';
            }
        }
    }

    function setReply(comment) {
        const modal = getModal();
        const form = modal.querySelector('.psv-comment-form');
        const context = modal.querySelector('.psv-reply-context');
        const excerpt = String(comment.comment_text || '').trim();

        form.dataset.parent = comment.id;
        context.querySelector('strong').textContent =
            comment.author_name + ': ' + excerpt.slice(0, 100) +
            (excerpt.length > 100 ? '…' : '');
        context.hidden = false;
        form.querySelector('[name="comment"]').focus();
    }

    function clearReply() {
        const modal = document.querySelector('.psv-modal');

        if (!modal) {
            return;
        }

        const form = modal.querySelector('.psv-comment-form');
        const context = modal.querySelector('.psv-reply-context');

        delete form.dataset.parent;
        context.hidden = true;
        context.querySelector('strong').textContent = '';
    }

    async function submitComment(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const formData = new FormData(form);
        const button = form.querySelector('button[type="submit"]');
        const currentSession = sessionId;

        button.disabled = true;

        try {
            const response = await fetch(config.restUrl + 'comments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': config.nonce || ''
                },
                body: JSON.stringify({
                    key: activeDocument.key,
                    url: activeDocument.url,
                    page: pageNumber,
                    name: formData.get('name'),
                    email: formData.get('email'),
                    comment: formData.get('comment'),
                    website: formData.get('website'),
                    parent: form.dataset.parent || 0
                })
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Falha ao enviar comentário.');
            }

            if (currentSession !== sessionId) {
                return;
            }

            form.reset();
            clearReply();
            window.alert(result.message || 'Comentário enviado para moderação.');
        } catch (error) {
            if (currentSession === sessionId) {
                window.alert(error.message);
            }
        } finally {
            button.disabled = false;
        }
    }

    async function searchText() {
        const modal = getModal();
        const query = modal.querySelector('.psv-searchbar input').value.trim();
        const output = modal.querySelector('.psv-searchbar span');

        if (!query || !pdfDocument) {
            return;
        }

        output.textContent = 'Pesquisando…';

        const searchDocument = pdfDocument;
        const searchSession = sessionId;
        const normalizedQuery = query.toLocaleLowerCase();
        let startPage = pageNumber;
        let startOffset = 0;

        if (searchCursor && searchCursor.query === normalizedQuery) {
            startPage = searchCursor.page;
            startOffset = searchCursor.offset + normalizedQuery.length;
        } else {
            searchCursor = null;
        }

        for (let checked = 0; checked < pdfDocument.numPages; checked += 1) {
            const candidatePage = ((startPage - 1 + checked) % pdfDocument.numPages) + 1;
            const page = await searchDocument.getPage(candidatePage);

            if (searchSession !== sessionId || searchDocument !== pdfDocument) {
                return;
            }

            const content = await page.getTextContent();

            if (searchSession !== sessionId || searchDocument !== pdfDocument) {
                return;
            }

            const text = content.items.map(function (item) {
                return item.str;
            }).join(' ');
            const lowerText = text.toLocaleLowerCase();
            const offset = candidatePage === startPage ? startOffset : 0;
            const matchIndex = lowerText.indexOf(normalizedQuery, offset);

            if (matchIndex !== -1) {
                searchCursor = {
                    query: normalizedQuery,
                    page: candidatePage,
                    offset: matchIndex
                };
                pageNumber = candidatePage;
                await renderPage();
                output.textContent = 'Ocorrência encontrada na página ' + candidatePage + '.';
                return;
            }
        }

        searchCursor = null;
        output.textContent = 'Não há outras ocorrências. A busca será reiniciada na próxima tentativa.';
    }

    function handleToolbarAction(event) {
        const button = event.target.closest('[data-a]');

        if (!button || !activeDocument) {
            return;
        }

        switch (button.dataset.a) {
            case 'prev':
                if (pageNumber > 1) {
                    pageNumber -= 1;
                    renderPage();
                }
                break;

            case 'next':
                if (pdfDocument && pageNumber < pdfDocument.numPages) {
                    pageNumber += 1;
                    renderPage();
                }
                break;

            case 'plus':
                zoom = Math.min(3, zoom + 0.2);
                renderPage();
                break;

            case 'minus':
                zoom = Math.max(0.4, zoom - 0.2);
                renderPage();
                break;

            case 'fit':
                zoom = Math.max(
                    0.4,
                    Math.min(2, (getModal().querySelector('.psv-stage').clientWidth - 40) / 700)
                );
                renderPage();
                break;

            case 'rotate':
                rotation = (rotation + 90) % 360;
                renderPage();
                break;

            case 'search': {
                const searchBar = getModal().querySelector('.psv-searchbar');
                searchBar.hidden = !searchBar.hidden;
                if (!searchBar.hidden) {
                    searchBar.querySelector('input').focus();
                }
                break;
            }

            case 'bookmark': {
                let bookmarks = readStore('bookmarks');

                bookmarks = bookmarks.includes(pageNumber)
                    ? bookmarks.filter(function (number) {
                        return number !== pageNumber;
                    })
                    : bookmarks.concat(pageNumber);

                writeStore('bookmarks', bookmarks);
                loadBookmarks();
                break;
            }

            case 'note': {
                const panel = getModal().querySelector('.psv-note-panel');
                panel.hidden = !panel.hidden;
                loadNote();
                break;
            }

            case 'share': {
                const shareUrl = new URL(window.location.href);
                shareUrl.searchParams.set('pdf', activeDocument.url);
                shareUrl.searchParams.set('page', pageNumber);

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(shareUrl.href)
                        .then(function () {
                            window.alert('Link da página copiado.');
                        })
                        .catch(function () {
                            window.prompt('Copie o link:', shareUrl.href);
                        });
                } else {
                    window.prompt('Copie o link:', shareUrl.href);
                }
                break;
            }

            case 'print':
                window.open(activeDocument.url, '_blank', 'noopener');
                break;

            case 'download': {
                const link = document.createElement('a');
                link.href = activeDocument.url;
                link.download = 'documento.pdf';
                link.target = '_blank';
                link.rel = 'noopener';
                link.click();
                break;
            }

            case 'fullscreen': {
                const dialog = getModal().querySelector('.psv-dialog');

                if (document.fullscreenElement) {
                    document.exitFullscreen?.();
                } else {
                    dialog.requestFullscreen?.();
                }
                break;
            }

            case 'drive':
                saveToDrive();
                break;
        }
    }

    function saveToDrive() {
        if (!config.googleClientId || !window.google?.accounts?.oauth2) {
            window.alert('Configure o Client ID do Google no painel.');
            return;
        }

        const documentToSave = activeDocument;
        const currentSession = sessionId;
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: config.googleClientId,
            scope: 'https://www.googleapis.com/auth/drive.file',

            callback: async function (tokenResponse) {
                if (tokenResponse.error || currentSession !== sessionId) {
                    if (tokenResponse.error) {
                        window.alert('Autorização Google não concluída.');
                    }
                    return;
                }

                try {
                    const response = await fetch(documentToSave.url);

                    if (!response.ok) {
                        throw new Error('PDF indisponível ou bloqueado por CORS.');
                    }

                    const blob = await response.blob();
                    const boundary = 'psv_' + Math.random().toString(16).slice(2);
                    const metadata = {
                        name: documentToSave.title + '.pdf',
                        mimeType: 'application/pdf'
                    };
                    const body = new Blob([
                        '--' + boundary + '\r\n',
                        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
                        JSON.stringify(metadata),
                        '\r\n--' + boundary + '\r\n',
                        'Content-Type: application/pdf\r\n\r\n',
                        blob,
                        '\r\n--' + boundary + '--'
                    ], {
                        type: 'multipart/related; boundary=' + boundary
                    });

                    const upload = await fetch(
                        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
                        {
                            method: 'POST',
                            headers: {
                                Authorization: 'Bearer ' + tokenResponse.access_token
                            },
                            body: body
                        }
                    );
                    const result = await upload.json();

                    if (!upload.ok) {
                        throw new Error(result.error?.message || 'Falha ao enviar.');
                    }

                    if (currentSession === sessionId) {
                        window.alert('Documento salvo no Google Drive.');
                    }
                } catch (error) {
                    if (currentSession === sessionId) {
                        window.alert(error.message);
                    }
                }
            }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    function initializeTriggers(root) {
        const scope = root || document;

        scope.querySelectorAll('.psv-open, .psv-open-link').forEach(function (trigger) {
            if (trigger.dataset.psvBound) {
                return;
            }

            trigger.dataset.psvBound = '1';
            trigger.addEventListener('click', function (event) {
                event.preventDefault();
                const launcher = trigger.closest('.psv-launcher');

                if (launcher) {
                    openFrom(launcher);
                }
            });
        });

        scope.querySelectorAll('pdf-smart-viewer, .pdf-smart-viewer').forEach(function (viewer) {
            if (viewer.dataset.psvBound) {
                return;
            }

            viewer.dataset.psvBound = '1';

            const data = readElementData(viewer);
            const button = createElement('button', 'psv-open', data.title);
            button.type = 'button';
            viewer.appendChild(button);
            button.addEventListener('click', function () {
                openFrom(viewer);
            });
        });
    }

    document.addEventListener('click', function (event) {
        if (!config.autoDetect) {
            return;
        }

        const link = event.target.closest('a[href]');

        if (
            !link ||
            link.classList.contains('psv-ignore') ||
            link.classList.contains('psv-open-link') ||
            link.closest('.psv-launcher') ||
            link.target === '_blank' ||
            link.closest('.psv-ignore')
        ) {
            return;
        }

        if (/\.pdf(?:$|[?#])/i.test(link.href)) {
            event.preventDefault();

            openFrom({
                dataset: {
                    pdf: link.href,
                    title: link.textContent.trim() || 'Visualizar PDF',
                    comments: 'true',
                    download: 'true'
                }
            });
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        initializeTriggers();

        const parameters = new URLSearchParams(window.location.search);
        const sharedPdf = parameters.get('pdf');

        if (sharedPdf) {
            const sharedViewer = {
                dataset: {
                    pdf: sharedPdf,
                    title: 'Documento compartilhado',
                    comments: 'true',
                    download: 'true'
                }
            };
            const requestedPage = Math.max(1, parseInt(parameters.get('page'), 10) || 1);

            // The requested page is applied after this exact PDF finishes loading.
            openFrom(sharedViewer, requestedPage);
        }
    });

    if ('MutationObserver' in window) {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) {
                        initializeTriggers(node);
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
})();
