=== PDF Smart Viewer ===
Contributors: pdfsmartviewer
Tags: pdf, lightbox, viewer, google drive, comments
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 1.2.0
License: GPLv2 or later

PDF Lightbox com miniaturas, zoom, busca, impressão, download, comentários públicos moderados, respostas, anotações particulares, favoritos, histórico, links para páginas e Google Drive.

== Instalação ==
Instale o ZIP em Plugins > Adicionar novo > Enviar plugin e ative.

== Integrações ==
Shortcode: [pdf_viewer id="123"]
Shortcode URL: [pdf_viewer url="https://site.com/arquivo.pdf" title="Abrir PDF"]
Botão: [pdf_lightbox url="https://site.com/arquivo.pdf" text="Visualizar"]
Gutenberg: bloco PDF Smart Viewer.
Elementor: widget PDF Smart Viewer.
PHP: echo do_shortcode('[pdf_viewer id="123"]');

Tag HTML:
<pdf-smart-viewer src="https://site.com/arquivo.pdf" title="Documento" comments="true" download="true"></pdf-smart-viewer>

Elemento DIV:
<div class="pdf-smart-viewer" data-pdf="https://site.com/arquivo.pdf" data-title="Documento"></div>

Detecção automática:
Ative em PDF Smart Viewer > configurações. Links cujo href termina em .pdf serão abertos no Lightbox. Use class="psv-ignore" no link ou em um ancestral para ignorar. Links target="_blank" são ignorados.

== Google Drive ==
Ative Google Drive API no Google Cloud, configure OAuth Client ID Web, adicione a origem HTTPS do site e informe o Client ID no painel. O visitante concede o escopo drive.file e salva na própria conta. Arquivos em outros domínios precisam permitir CORS.

== Comentários ==
Comentários públicos são moderados no painel. O nome é exibido; o e-mail não. Há limitação simples de frequência por IP. Respostas também passam por moderação.

== Recursos ==
Miniaturas reais, zoom, navegação, rotação, busca textual, download, impressão, tela cheia, favoritos, marcadores, anotações locais, histórico local, link compartilhável de página, comentários e respostas.

== Limitações e observações ==
Anotações e favoritos são armazenados localmente no navegador, não sincronizados entre dispositivos. As anotações desta versão são notas privadas por página, não marcações visuais sobre o texto do PDF.
A busca funciona em PDFs com camada de texto; PDFs digitalizados precisam de OCR.
O botão de impressão abre o PDF original em outra aba.
O PDF deve ser acessível ao navegador. URLs externas precisam de CORS para renderização e upload ao Drive.
PDF.js é carregado por CDN; para ambientes restritos, hospede os arquivos localmente.
O link compartilhado utiliza os parâmetros ?pdf=URL& page=N na URL atual; a página deve ter o plugin carregado.
Teste OAuth, CORS, cache e compatibilidade no ambiente de homologação antes de produção.

== Changelog ==
= 1.2.0 =
* Exportação do texto dos PDFs para DOCX diretamente no Lightbox.
* Respostas dos comentários recolhidas por padrão, com expansão individual.
* Verificações de requisitos, arquivos essenciais e instalação da tabela; falhas de bootstrap e ativação são tratadas sem interromper o WordPress.

= 1.1.0 =
* Detecção automática de links PDF opcional.
* Tag HTML customizada e integração por DIV.
* Gerador de shortcode no painel.
* Miniaturas de páginas renderizadas.
* Favoritos, marcadores, anotações privadas e histórico local.
* Compartilhamento de página específica.
* Respostas e moderação aprovar/rejeitar/excluir.
* Melhorias de interface responsiva.
