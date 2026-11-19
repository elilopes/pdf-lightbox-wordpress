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
    let commentPage = 1;
    let commentTotalPages = 1;

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
                        <button type="button" data-a="outline" aria-expanded="true">Sumário</button>
                        <button type="button" data-a="search">Buscar</button>
                        <button type="button" data-a="comments" aria-expanded="false">Comentários</button>
                        <button type="button" data-a="bookmark">☆ Favoritar</button>
                        <button type="button" data-a="note">Anotação</button>
                        <button type="button" data-a="share">Compartilhar página</button>
                        <button type="button" data-a="print" title="Abre o PDF em outra aba">Abrir PDF</button>
                        <button type="button" data-a="download">Baixar</button>
                        <button type="button" data-a="docx" title="Exportar o texto do PDF para Word">Exportar DOCX</button>
                        <button type="button" data-a="drive">Drive</button>
                        <button type="button" data-a="theme" aria-pressed="false">Modo escuro</button>
                        <button type="button" data-a="contrast" aria-pressed="false">Contraste</button>
                        <button type="button" data-a="reader" aria-pressed="false">Modo de leitura</button>
                        <button type="button" data-a="ai-summary" hidden>Resumir com IA</button>
                        <button type="button" data-a="ai-question" hidden>Perguntar à IA</button>
                        <button type="button" data-a="ai-explain" hidden>Explicar termo</button>
                        <button type="button" data-a="qrcode" hidden>QR Code</button>
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
                        <h3>Sumário do documento</h3>
                        <nav class="psv-outline" aria-label="Sumário do documento"><p>Verificando marcadores…</p></nav>
                        <h3>Favoritos pessoais</h3>
                        <div class="psv-bookmarks"></div>
                    </aside>

                    <main class="psv-stage">
                        <div class="psv-status">Carregando PDF…</div>
                        <canvas class="psv-canvas" hidden></canvas>
                    </main>

                    <aside class="psv-comments" hidden>
                        <h3>Comentários</h3>
                        <div class="psv-comment-list"></div>
                        <div class="psv-comment-pagination" hidden>
                            <button type="button" data-a="comments-prev">Anterior</button>
                            <span aria-live="polite"></span>
                            <button type="button" data-a="comments-next">Próxima</button>
                        </div>
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

                <section class="psv-ai-panel" hidden aria-label="Assistente de IA">
                    <div class="psv-ai-heading"><strong>Assistente do documento</strong><button type="button" data-a="ai-close" aria-label="Fechar assistente">×</button></div>
                    <label for="psv-ai-question">Pergunta ou termo para explicar</label>
                    <textarea id="psv-ai-question" rows="2" maxlength="1000"></textarea>
                    <button type="button" data-a="ai-submit">Enviar pergunta</button>
                    <p class="psv-ai-disclaimer">O texto do PDF será enviado ao serviço de IA configurado pelo administrador para gerar a resposta.</p>
                    <div class="psv-ai-answer" aria-live="polite"></div>
                </section>

                <section class="psv-qr-panel" hidden aria-label="QR Code do documento">
                    <div class="psv-ai-heading"><strong>QR Code para acessar este documento</strong><button type="button" data-a="qr-close" aria-label="Fechar QR Code">×</button></div>
                    <img class="psv-qr-image" alt="QR Code de acesso ao documento" width="220" height="220">
                    <p>O QR Code é gerado por um serviço externo. O endereço do documento será enviado a esse serviço.</p>
                    <a class="psv-qr-open" target="_blank" rel="noopener noreferrer">Abrir imagem do QR Code para salvar</a>
                </section>

                <div class="psv-note-panel" hidden>
                    <label>Anotação particular desta página<textarea></textarea></label>
                    <button type="button" data-a="save-note">Salvar anotação</button>
                    <span aria-live="polite"></span>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.querySelector('[data-a="drive"]').hidden = !config.googleClientId;

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
        modal.querySelector('[data-a="ai-close"]').addEventListener('click', function () { modal.querySelector('.psv-ai-panel').hidden = true; });
        modal.querySelector('[data-a="qr-close"]').addEventListener('click', function () { modal.querySelector('.psv-qr-panel').hidden = true; });
        modal.querySelector('.psv-comments').addEventListener('click', handleCommentPagination);
        modal.querySelector('[data-a="find"]').addEventListener('click', searchText);
        modal.querySelector('.psv-comment-form').addEventListener('submit', submitComment);
        modal.querySelector('[data-a="save-note"]').addEventListener('click', saveNote);
        modal.querySelector('[data-a="ai-submit"]').addEventListener('click', function () {
            const question = modal.querySelector('#psv-ai-question').value.trim();
            const aiAction = modal.querySelector('[data-a="ai-submit"]').dataset.aiAction || 'question';
            if (question) runDocumentAI(aiAction, question);
        });

        document.addEventListener('keydown', function (event) {
            if (!modal.classList.contains('is-open')) return;
            if (event.key === 'Escape') { closeViewer(); return; }
            if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
            if (event.altKey || event.ctrlKey || event.metaKey) {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                    event.preventDefault();
                    modal.querySelector('[data-a="search"]').click();
                }
                return;
            }
            if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); modal.querySelector('[data-a="next"]').click(); }
            else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); modal.querySelector('[data-a="prev"]').click(); }
            else if (event.key === '+' || event.key === '=') { modal.querySelector('[data-a="plus"]').click(); }
            else if (event.key === '-') { modal.querySelector('[data-a="minus"]').click(); }
            else if (event.key.toLowerCase() === 'd') { modal.querySelector('[data-a="theme"]').click(); }
            else if (event.key.toLowerCase() === 'c') { modal.querySelector('[data-a="contrast"]').click(); }
            else if (event.key.toLowerCase() === 'r') { modal.querySelector('[data-a="reader"]').click(); }
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
            download: data.psvDownload !== '0' && data.download !== 'false',
            ai: data.psvAi !== '0',
            qrcode: data.psvQrcode !== '0',
            height: Math.min(2000, Math.max(300, parseInt(data.psvHeight, 10) || 700))
        };
    }

    function normalizeDocumentUrl(value) {
        const parsed = new URL(String(value || '').trim(), window.location.href);

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Protocolo de PDF inválido.');
        }

        return parsed.href;
    }

    async function resolveDocument(value) {
        const absoluteUrl = normalizeDocumentUrl(value);
        const response = await fetch(
            config.restUrl + 'document?url=' + encodeURIComponent(absoluteUrl),
            { headers: { Accept: 'application/json' }, cache: 'no-store' }
        );
        const result = await parseApiResponse(response);

        if (!response.ok || !result.url || !result.key) {
            throw new Error(apiErrorMessage(response.status, result));
        }

        return result;
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
            const resolvedDocument = await resolveDocument(data.url);
            documentUrl = resolvedDocument.url;
            data.key = resolvedDocument.key;
        } catch (error) {
            if (currentSession !== sessionId) {
                return;
            }

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
        modal.querySelector('.psv-dialog').style.height = data.height + 'px';
        modal.querySelector('.psv-dialog').style.maxHeight = '96vh';
        const commentsPanel = modal.querySelector('.psv-comments');
        const commentsToggle = modal.querySelector('[data-a="comments"]');
        commentsPanel.hidden = true;
        commentsToggle.hidden = !data.comments;
        commentsToggle.textContent = 'Comentários';
        commentsToggle.setAttribute('aria-expanded', 'false');
        commentPage = 1;
        commentTotalPages = 1;
        modal.querySelector('.psv-comment-pagination').hidden = true;
        modal.querySelector('[data-a="drive"]').hidden = !config.googleClientId;
        modal.querySelector('[data-a="download"]').hidden = !data.download;
        ['ai-summary', 'ai-question', 'ai-explain'].forEach(function (action) {
            modal.querySelector('[data-a="' + action + '"]').hidden = !(data.ai && config.aiEnabled);
        });
        modal.querySelector('[data-a="qrcode"]').hidden = !data.qrcode;
        modal.querySelector('.psv-ai-panel').hidden = true;
        modal.querySelector('.psv-qr-panel').hidden = true;
        modal.querySelector('.psv-dialog').classList.remove('psv-reading-mode', 'psv-dark-mode', 'psv-high-contrast', 'psv-show-sidebar');
        modal.querySelector('[data-a="outline"]').setAttribute('aria-expanded', 'true');
        ['theme', 'contrast', 'reader'].forEach(function (action) {
            modal.querySelector('[data-a="' + action + '"]').setAttribute('aria-pressed', 'false');
        });
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
            buildDocumentOutline(pdfDocument, currentSession);

            if (data.comments) {
                loadComments(currentSession, 1);
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

    async function loadComments(expectedSession, requestedPage) {
        const modal = getModal();
        const list = modal.querySelector('.psv-comment-list');
        const pagination = modal.querySelector('.psv-comment-pagination');
        const pageToLoad = Math.max(1, Number(requestedPage) || 1);
        list.textContent = 'Carregando comentários…';
        pagination.hidden = true;

        try {
            const response = await fetch(
                config.restUrl + 'comments?key=' + encodeURIComponent(activeDocument.key) +
                '&page=' + pageToLoad + '&per_page=20',
                { headers: { Accept: 'application/json' }, cache: 'no-store' }
            );
            const result = await parseApiResponse(response);

            if (expectedSession !== sessionId) {
                return;
            }
            if (!response.ok) {
                throw new Error(apiErrorMessage(response.status, result));
            }

            const rows = result && Array.isArray(result.comments) ? result.comments : null;
            if (!rows) {
                throw new Error('O WordPress retornou uma resposta inesperada ao carregar os comentários.');
            }

            commentPage = Number(result.page) || pageToLoad;
            commentTotalPages = Number(result.total_pages) || 1;
            list.replaceChildren();

            const roots = rows.filter(function (row) {
                return !Number(row.parent_id);
            });

            if (!roots.length) {
                list.textContent = 'Nenhum comentário publicado nesta página.';
            } else {
                roots.forEach(function (row) {
                    const item = createElement('article', 'psv-comment');
                    const author = createElement('b', '', row.author_name + ' · pág. ' + row.page_number);
                    const text = createElement('p', '', row.comment_text);
                    const reply = createElement('button', 'psv-reply', 'Responder');

                    reply.type = 'button';
                    reply.addEventListener('click', function () {
                        setReply(row);
                    });
                    item.append(author, text, reply);

                    const replies = rows.filter(function (child) {
                        return Number(child.parent_id) === Number(row.id);
                    });
                    if (replies.length) {
                        const replyToggle = createElement(
                            'button',
                            'psv-replies-toggle',
                            '▸ Exibir ' + replies.length + (replies.length === 1 ? ' resposta' : ' respostas')
                        );
                        const replyList = createElement('div', 'psv-replies-list');
                        replyList.hidden = true;
                        replyToggle.type = 'button';
                        replyToggle.setAttribute('aria-expanded', 'false');
                        replyToggle.addEventListener('click', function () {
                            const expanded = !replyList.hidden;
                            replyList.hidden = expanded;
                            replyToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                            replyToggle.textContent = (expanded ? '▸ Exibir ' : '▾ Ocultar ') +
                                replies.length + (replies.length === 1 ? ' resposta' : ' respostas');
                        });
                        replies.forEach(function (child) {
                            const replyItem = createElement('div', 'psv-reply-item');
                            replyItem.append(
                                createElement('b', '', child.author_name + ' respondeu'),
                                createElement('p', '', child.comment_text)
                            );
                            replyList.appendChild(replyItem);
                        });
                        item.append(replyToggle, replyList);
                    }
                    list.appendChild(item);
                });
            }

            const previous = pagination.querySelector('[data-a="comments-prev"]');
            const next = pagination.querySelector('[data-a="comments-next"]');
            pagination.querySelector('span').textContent =
                'Página ' + commentPage + ' de ' + commentTotalPages;
            previous.disabled = !result.has_previous;
            next.disabled = !result.has_more;
            pagination.hidden = commentTotalPages <= 1;
        } catch (error) {
            if (expectedSession === sessionId) {
                list.textContent = error instanceof TypeError
                    ? 'Falha de conexão ao carregar os comentários. Verifique sua internet e tente novamente.'
                    : (error.message || 'Não foi possível carregar os comentários.');
            }
        }
    }

    function handleCommentPagination(event) {
        const button = event.target.closest('[data-a]');
        if (!button || !activeDocument) {
            return;
        }

        if (button.dataset.a === 'comments-prev' && commentPage > 1) {
            loadComments(sessionId, commentPage - 1);
        } else if (button.dataset.a === 'comments-next' && commentPage < commentTotalPages) {
            loadComments(sessionId, commentPage + 1);
        }
    }

    async function parseApiResponse(response) {
        const raw = await response.text();
        if (!raw) {
            return {};
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            if (!response.ok) {
                return { message: 'O servidor retornou um erro HTTP ' + response.status + '.' };
            }
            throw new Error('O WordPress retornou uma resposta inválida. Verifique a API REST.');
        }
    }

    function apiErrorMessage(status, result) {
        if (result && result.message) {
            return result.message;
        }
        if (status === 400) {
            return 'A solicitação de comentários é inválida.';
        }
        if (status === 403) {
            return 'A sessão de segurança expirou. Atualize o código de segurança e tente novamente.';
        }
        if (status === 404) {
            return 'A API de comentários não foi encontrada. Verifique se o plugin está ativo.';
        }
        if (status >= 500) {
            return 'O servidor encontrou um erro ao consultar os comentários. Tente novamente mais tarde.';
        }
        return 'Não foi possível carregar os comentários (HTTP ' + status + ').';
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

    async function refreshRestNonce() {
        const response = await fetch(
            config.restUrl + 'nonce?_=' + Date.now(),
            { headers: { Accept: 'application/json' }, cache: 'no-store' }
        );
        const result = await parseApiResponse(response);

        if (!response.ok || !result.nonce) {
            throw new Error('Não foi possível renovar o código de segurança. Verifique sua conexão e tente novamente.');
        }

        config.nonce = result.nonce;
        return result.nonce;
    }

    async function postComment(payload, retryAfterNonce) {
        const response = await fetch(config.restUrl + 'comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': config.nonce || ''
            },
            body: JSON.stringify(payload)
        });
        const result = await parseApiResponse(response);

        if (response.status === 403 && retryAfterNonce) {
            await refreshRestNonce();
            return postComment(payload, false);
        }

        if (!response.ok) {
            throw new Error(apiErrorMessage(response.status, result));
        }
        return result;
    }

    async function submitComment(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const formData = new FormData(form);
        const button = form.querySelector('button[type="submit"]');
        const currentSession = sessionId;

        if (!activeDocument) {
            window.alert('Abra um documento antes de enviar comentários.');
            return;
        }

        const payload = {
            key: activeDocument.key,
            url: activeDocument.url,
            page: pageNumber,
            name: formData.get('name'),
            email: formData.get('email'),
            comment: formData.get('comment'),
            website: formData.get('website'),
            parent: form.dataset.parent || 0
        };

        button.disabled = true;

        try {
            const result = await postComment(payload, true);
            if (currentSession !== sessionId) {
                return;
            }

            form.reset();
            clearReply();
            window.alert(result.message || 'Comentário enviado para moderação.');
        } catch (error) {
            if (currentSession === sessionId) {
                const message = error instanceof TypeError
                    ? 'Falha de conexão ao enviar o comentário. Verifique sua internet e tente novamente.'
                    : (error.message || 'Não foi possível enviar o comentário.');
                window.alert(message);
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

    function escapeXml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&apos;'
            }[character];
        });
    }

    function calculateCrc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (let index = 0; index < bytes.length; index += 1) {
            crc ^= bytes[index];
            for (let bit = 0; bit < 8; bit += 1) {
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /**
     * Build a minimal standards-compliant DOCX package locally.
     * ZIP entries are stored without compression to avoid a runtime dependency.
     */
    function createDocxBlob(title, pages) {
        const encoder = new TextEncoder();
        const files = [
            {
                name: '[Content_Types].xml',
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                    '<Default Extension="xml" ContentType="application/xml"/>' +
                    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
                    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
                    '</Types>'
            },
            {
                name: '_rels/.rels',
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
                    '</Relationships>'
            },
            {
                name: 'word/styles.xml',
                content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
                    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
                    '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style>' +
                    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>' +
                    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>' +
                    '</w:styles>'
            }
        ];

        const paragraph = function (text, style) {
            const styleXml = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '';
            return '<w:p>' + styleXml + '<w:r><w:t xml:space="preserve">' +
                escapeXml(text) + '</w:t></w:r></w:p>';
        };

        let documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:body>' + paragraph(title || 'Documento PDF', 'Title');

        pages.forEach(function (lines, index) {
            if (index > 0) {
                documentXml += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
            }
            documentXml += paragraph('Página ' + (index + 1), 'Heading1');
            lines.forEach(function (line) {
                if (line) documentXml += paragraph(line);
            });
        });

        documentXml += '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
            '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
            'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>';
        files.push({ name: 'word/document.xml', content: documentXml });

        const localEntries = [];
        const centralEntries = [];
        let localOffset = 0;

        files.forEach(function (file) {
            const nameBytes = encoder.encode(file.name);
            const dataBytes = encoder.encode(file.content);
            const crc = calculateCrc32(dataBytes);
            const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
            const localView = new DataView(local.buffer);

            localView.setUint32(0, 0x04034B50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, 0, true);
            localView.setUint16(12, 0x21, true);
            localView.setUint32(14, crc, true);
            localView.setUint32(18, dataBytes.length, true);
            localView.setUint32(22, dataBytes.length, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);
            local.set(nameBytes, 30);
            local.set(dataBytes, 30 + nameBytes.length);
            localEntries.push(local);

            const central = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(central.buffer);
            centralView.setUint32(0, 0x02014B50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, 0, true);
            centralView.setUint16(14, 0x21, true);
            centralView.setUint32(16, crc, true);
            centralView.setUint32(20, dataBytes.length, true);
            centralView.setUint32(24, dataBytes.length, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, localOffset, true);
            central.set(nameBytes, 46);
            centralEntries.push(central);
            localOffset += local.length;
        });

        const centralSize = centralEntries.reduce(function (total, entry) {
            return total + entry.length;
        }, 0);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054B50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, localOffset, true);
        endView.setUint16(20, 0, true);

        return new Blob(localEntries.concat(centralEntries, [end]), {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
    }

    async function exportDocx() {
        if (!pdfDocument || !activeDocument) {
            window.alert('Abra um PDF antes de exportar.');
            return;
        }

        const modal = getModal();
        const button = modal.querySelector('[data-a="docx"]');
        const originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Preparando DOCX…';

        try {
            const sourceDocument = pdfDocument;
            const sourceSession = sessionId;
            const extractedPages = [];

            for (let number = 1; number <= sourceDocument.numPages; number += 1) {
                if (sourceSession !== sessionId || sourceDocument !== pdfDocument) {
                    throw new Error('A exportação foi interrompida porque o documento foi fechado.');
                }

                const page = await sourceDocument.getPage(number);
                const content = await page.getTextContent();
                const lines = [];

                content.items.forEach(function (item) {
                    if (!item.str || !item.str.trim()) return;
                    const y = Math.round(item.transform ? item.transform[5] : 0);
                    let line = lines.find(function (entry) {
                        return Math.abs(entry.y - y) <= 2;
                    });
                    if (!line) {
                        line = { y: y, parts: [] };
                        lines.push(line);
                    }
                    line.parts.push(item.str);
                });

                lines.sort(function (a, b) { return b.y - a.y; });
                extractedPages.push(lines.map(function (line) {
                    return line.parts.join(' ').replace(/\s+/g, ' ').trim();
                }).filter(Boolean));
            }

            const blob = createDocxBlob(activeDocument.title || 'Documento PDF', extractedPages);
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const safeTitle = String(activeDocument.title || 'documento')
                .replace(/[\\/:*?"<>|]+/g, '-')
                .replace(/\s+/g, '-')
                .slice(0, 80);
            link.href = objectUrl;
            link.download = (safeTitle || 'documento') + '.docx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
        } catch (error) {
            window.alert(error.message || 'Não foi possível exportar o PDF para DOCX.');
        } finally {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }


    async function buildDocumentOutline(documentToRender, expectedSession) {
        const container = getModal().querySelector('.psv-outline');
        container.replaceChildren();
        try {
            const outlineItems = await documentToRender.getOutline();
            if (expectedSession !== sessionId || documentToRender !== pdfDocument) return;
            if (!outlineItems || !outlineItems.length) {
                container.appendChild(createElement('p', '', 'Este PDF não possui marcadores internos.'));
                return;
            }
            const buildLevel = function (items, parent) {
                const list = createElement('ul', 'psv-outline-list');
                items.forEach(function (item) {
                    const li = createElement('li', 'psv-outline-item');
                    const link = createElement('button', 'psv-outline-link', item.title || 'Seção sem título');
                    link.type = 'button';
                    link.addEventListener('click', async function () {
                        try {
                            let destination = item.dest;
                            if (typeof destination === 'string') destination = await documentToRender.getDestination(destination);
                            if (!destination || !destination[0]) return;
                            const index = await documentToRender.getPageIndex(destination[0]);
                            if (expectedSession !== sessionId || documentToRender !== pdfDocument) return;
                            pageNumber = index + 1;
                            await renderPage(expectedSession);
                        } catch (error) {
                            container.setAttribute('aria-label', 'Não foi possível abrir este marcador.');
                        }
                    });
                    li.appendChild(link);
                    if (item.items && item.items.length) {
                        const toggle = createElement('button', 'psv-outline-toggle', '−');
                        toggle.type = 'button';
                        toggle.setAttribute('aria-expanded', 'true');
                        const children = buildLevel(item.items, li);
                        toggle.addEventListener('click', function () {
                            const expanded = toggle.getAttribute('aria-expanded') === 'true';
                            toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                            toggle.textContent = expanded ? '+' : '−';
                            children.hidden = expanded;
                        });
                        li.insertBefore(toggle, link);
                        li.appendChild(children);
                    }
                    list.appendChild(li);
                });
                parent.appendChild(list);
                return list;
            };
            buildLevel(outlineItems, container);
        } catch (error) {
            container.textContent = 'Não foi possível carregar o sumário deste PDF.';
        }
    }

    async function extractDocumentText(maxCharacters) {
        if (!pdfDocument) throw new Error('Nenhum PDF está aberto.');
        const chunks = [];
        let total = 0;
        for (let page = 1; page <= pdfDocument.numPages && total < maxCharacters; page += 1) {
            const pageObject = await pdfDocument.getPage(page);
            const content = await pageObject.getTextContent();
            const text = content.items.map(function (item) { return item.str || ''; }).join(' ');
            const remaining = maxCharacters - total;
            chunks.push('Página ' + page + ': ' + text.slice(0, remaining));
            total += Math.min(text.length, remaining);
        }
        if (!total) throw new Error('Não foi possível extrair texto. PDFs digitalizados podem precisar de OCR.');
        return chunks.join('\n\n');
    }

    async function runDocumentAI(action, question) {
        const modal = getModal();
        const panel = modal.querySelector('.psv-ai-panel');
        const output = modal.querySelector('.psv-ai-answer');
        const currentSession = sessionId;
        panel.hidden = false;
        output.textContent = 'Lendo o documento e preparando a resposta…';
        try {
            const text = await extractDocumentText(24000);
            const response = await fetch(config.restUrl + 'ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce || '' },
                body: JSON.stringify({ action: action, question: question || '', title: activeDocument ? activeDocument.title : 'Documento PDF', text: text })
            });
            const result = await parseApiResponse(response);
            if (response.status === 403) {
                await refreshRestNonce();
                throw new Error('O código de segurança foi atualizado. Clique novamente para repetir a solicitação.');
            }
            if (!response.ok) throw new Error(apiErrorMessage(response.status, result));
            if (currentSession === sessionId) output.textContent = result.answer || 'Não foi possível gerar uma resposta.';
        } catch (error) {
            if (currentSession === sessionId) output.textContent = error.message || 'Erro ao consultar o assistente.';
        }
    }

    function showDocumentQr() {
        if (!activeDocument) return;
        const modal = getModal();
        const panel = modal.querySelector('.psv-qr-panel');
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('pdf', activeDocument.url);
        shareUrl.searchParams.set('page', '1');
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=png&data=' + encodeURIComponent(shareUrl.href);
        modal.querySelector('.psv-qr-image').src = qrUrl;
        modal.querySelector('.psv-qr-open').href = qrUrl;
        panel.hidden = false;
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

            case 'comments': {
                const panel = getModal().querySelector('.psv-comments');
                const toggle = getModal().querySelector('[data-a="comments"]');
                panel.hidden = !panel.hidden;
                toggle.textContent = panel.hidden ? 'Comentários' : 'Fechar comentários';
                toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
                break;
            }

            case 'outline': {
                const dialog = getModal().querySelector('.psv-dialog');
                dialog.classList.toggle('psv-show-sidebar');
                button.setAttribute('aria-expanded', dialog.classList.contains('psv-show-sidebar') ? 'true' : 'false');
                break;
            }

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

            case 'docx':
                exportDocx();
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

            case 'theme': {
                const dialog = getModal().querySelector('.psv-dialog');
                dialog.classList.toggle('psv-dark-mode');
                button.setAttribute('aria-pressed', dialog.classList.contains('psv-dark-mode') ? 'true' : 'false');
                break;
            }

            case 'contrast': {
                const dialog = getModal().querySelector('.psv-dialog');
                dialog.classList.toggle('psv-high-contrast');
                button.setAttribute('aria-pressed', dialog.classList.contains('psv-high-contrast') ? 'true' : 'false');
                break;
            }

            case 'reader': {
                const dialog = getModal().querySelector('.psv-dialog');
                dialog.classList.toggle('psv-reading-mode');
                button.setAttribute('aria-pressed', dialog.classList.contains('psv-reading-mode') ? 'true' : 'false');
                break;
            }

            case 'ai-summary':
                runDocumentAI('summary', '');
                break;

            case 'ai-question':
            case 'ai-explain': {
                const panel = getModal().querySelector('.psv-ai-panel');
                panel.hidden = false;
                const field = panel.querySelector('textarea');
                field.placeholder = button.dataset.a === 'ai-explain' ? 'Digite o termo que deseja explicar…' : 'Digite sua pergunta sobre o documento…';
                panel.querySelector('[data-a="ai-submit"]').dataset.aiAction = button.dataset.a === 'ai-explain' ? 'explain' : 'question';
                field.focus();
                break;
            }

            case 'qrcode':
                showDocumentQr();
                break;
        }
    }

    function loadGoogleIdentity() {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            return Promise.resolve();
        }

        return new Promise(function (resolve, reject) {
            const existing = document.querySelector('script[data-psv-google-identity]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.dataset.psvGoogleIdentity = '1';
            script.onload = resolve;
            script.onerror = function () {
                reject(new Error('Não foi possível carregar a autenticação do Google.'));
            };
            document.head.appendChild(script);
        });
    }

    async function saveToDrive() {
        if (!config.googleClientId) {
            window.alert('Configure o Client ID do Google no painel.');
            return;
        }

        const documentToSave = activeDocument;
        const currentSession = sessionId;

        try {
            await loadGoogleIdentity();
            if (!window.google?.accounts?.oauth2) {
                throw new Error('O serviço de autenticação do Google não está disponível.');
            }

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
        } catch (error) {
            window.alert(error.message || 'Não foi possível iniciar a integração com o Google Drive.');
        }
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
