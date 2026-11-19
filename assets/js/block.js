(function (blocks, element, components, blockEditor) {
    'use strict';

    const createElement = element.createElement;
    const InspectorControls = blockEditor.InspectorControls;
    const PanelBody = components.PanelBody;
    const TextControl = components.TextControl;

    blocks.registerBlockType('pdf-smart-viewer/viewer', {
        title: 'PDF Smart Viewer',
        icon: 'media-document',
        category: 'widgets',

        attributes: {
            url: {
                type: 'string',
                default: ''
            },
            title: {
                type: 'string',
                default: 'Visualizar PDF'
            }
        },

        edit: function (props) {
            const url = props.attributes.url;
            const title = props.attributes.title;

            return createElement(
                'div',
                { className: 'psv-block-editor' },
                createElement(
                    InspectorControls,
                    {},
                    createElement(
                        PanelBody,
                        { title: 'Configurações', initialOpen: true },
                        createElement(TextControl, {
                            label: 'URL do PDF',
                            type: 'url',
                            value: url,
                            onChange: function (value) {
                                props.setAttributes({ url: value });
                            }
                        }),
                        createElement(TextControl, {
                            label: 'Texto do botão',
                            value: title,
                            onChange: function (value) {
                                props.setAttributes({ title: value });
                            }
                        })
                    )
                ),
                createElement(
                    'p',
                    {},
                    'PDF Smart Viewer: ',
                    url || 'Configure a URL do PDF.'
                ),
                title ? createElement('p', {}, 'Botão: ' + title) : null
            );
        },

        save: function () {
            // The PHP render_callback generates the frontend markup.
            return null;
        }
    });
})(
    window.wp.blocks,
    window.wp.element,
    window.wp.components,
    window.wp.blockEditor
);
