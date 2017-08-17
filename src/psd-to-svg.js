const path = require('path')
const fs = require('fs')
const co = require('co')
const cb2p = require('cb2p')
const PSD = require('psd')
const util = require('util')
const debug = require('debug')('psd-to-svg')

const renderSvg = require('./render-svg')

const mkdir = cb2p(fs.mkdir)
const exists = cb2p(fs.exists)
const writeFile = cb2p(fs.writeFile)

module.exports = function (inputFile, outputFile, options) {
    return co(function*() {
        options = Object.assign({}, options)

        var outputDir = path.dirname(outputFile)
        var outputResourceDir = options.outputResouceDir || path.join(outputDir, path.basename(outputFile).replace(/\.htm(l?)$/, '') + '_files')
        var outputResourceUrlBase = options.outputResourceUrlBase || path.relative(outputDir, outputResourceDir)

        debug(`Parsing ${inputFile} to ${outputFile} with resources in ${outputResourceDir}`)

        var psd = PSD.fromFile(inputFile)
        if (!psd || !psd.parse()) {
            throw new Error('Failed to parse PSD file ' + inputFile)
        }

        try {
            yield mkdir(outputResourceDir)
        } catch (e) {
            debug(`Failed to make directory ${outputResourceDir}: `, e)
        }


        var zIndex = 10000
        var psdRoot = psd.tree()
        //debug(psdRoot)
        var domRoot = {}
        scanTree(psdRoot, domRoot, 0)

        debug("Got DOM tree: ")
        debug(util.inspect(domRoot, true, 10, true))

        debug("Rendering DOM tree to HTML...")
        var domSvg = renderSvg(domRoot)
        var fullSvg = fullfillSvg(domSvg)
        debug("Full svg:\n" + fullSvg)

        yield writeFile(outputFile, fullSvg, 'utf-8')

        return fullSvg

        /**
         * 遍历整个树
         * @param psdNode
         * @param svgNode
         * @param id
         */
        function scanTree(psdNode, svgNode, id) {
            debug("scanTree: ", inspectTreeNode(psdNode, id))

            if (!psdNode.isRoot() && psdNode.layer && !psdNode.layer.visible) {
                debug(`ignore invisible layer ${id} ${psdNode.name}`)
                Object.assign(svgNode, {tagName: 'div', isValid: false, isVisible: false})
                return;
            }

            var children = psdNode.children()

            var isLink = /\|link$/.test(psdNode.name)

            Object.assign(svgNode, {
                tagName: isLink ? 'a' : 'div',
                className: psdNode.type,
                id: 'p' + id,
                children: [],
                style: {
                    'z-index': zIndex--,
                    top: psdNode.coords.top + 'px',
                    left: psdNode.coords.left + 'px',
                    width: (psdNode.coords.right - psdNode.coords.left) + 'px',
                    height: (psdNode.coords.bottom - psdNode.coords.top) + 'px',
                },
                'data-node-name': psdNode.name
            })

            if (isLink) {
                svgNode.href = 'javascript:;'
            }

            if (psdNode.type === 'layer'
                && psdNode.layer) {
                fillSvgNodeFromPsdNode(psdNode, svgNode, id);
            }

            children.forEach((childPsdNode, i) => {
                var childDomNode = {}
                domRoot.children.push(childDomNode)
                scanTree(childPsdNode, childDomNode, `${id}_${i}`)
            })
        }

        /**
         * 从PSD的节点转换为HTML的节点
         * @param psdNode
         * @param svgNode
         * @param id
         */
        function fillSvgNodeFromPsdNode(psdNode, svgNode, id) {
            if (!psdNode.layer.visible) {
                debug(`ignore invisible layer ${id} ${psdNode.name}`)
                svgNode.style.display = 'none'
                return;
            }

            var exportedPsdNode = psdNode.export()

            if (exportedPsdNode) {
                // text node
                var text = exportedPsdNode.text
                if (text) {
                    debug(`rendering text node ${id}: `, text)

                    svgNode.className = svgNode.className + ' text'
                    svgNode.innerText = text.value

                    var textLines = text.value.split("\r").length || text.value.split("\n").length
                    svgNode.style['line-height'] = (Math.round((psdNode.coords.bottom - psdNode.coords.top) / textLines) + 1) + 'px'

                    var font = text.font;
                    if (font) {
                        if (font.sizes && font.sizes[0]) {
                            svgNode.style['font-size'] = font.sizes[0] + 'px'
                        }

                        if (font.colors && font.colors[0]) {
                            var color = font.colors[0]
                            svgNode.style['color'] = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
                        }

                        if (font.alignment && font.alignment[0]) {
                            svgNode.style['text-align'] = font.alignment[0]
                        }
                    }

                    return;
                }
            }

            if (psdNode.layer.image
                && psdNode.layer.image.saveAsPng) {
                debug(`saving ${outputResourceDir}/${id}.png`)

                psdNode.layer.image.saveAsPng(`${outputResourceDir}/${id}.png`)
                svgNode.style['background-image'] = `url(${outputResourceUrlBase}/${id}.png)`
            }
        }
    })
};


function inspectTreeNode(node, id) {
    if (!node) {
        return '<null>';
    }

    var children = node.children()

    return {
        __id__: id,
        type: node.type,
        name: node.name,
        isRoot: node.isRoot(),
        coords: node.coords,
        offset: {
            top: node.topOffset,
            left: node.leftOffset,
        },
        childrenCount: children ? children.length : 0,
        //layer: node.layer
    }
}

/*
 <style>
    .layer{
        position: absolute;
        padding: 0;
        margin: 0;
        border: none;
        background-size: contain;
        background-repeat: no-repeat;
    }
    .text{
        word-spacing: -4px;
        letter-spacing: 1px;
        white-space: pre;
    }
</style>
 */
function fullfillSvg(main) {
    return `<?xml version="1.0" standalone="no"?>
<svg>
    ${main}
</svg>
    `
}