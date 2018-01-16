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

const warn = (msg, ...args) => debug("Warn: " + msg, ...args)

module.exports = function (inputFile, outputFile, options) {
    return co(function*() {
        options = Object.assign({}, options)

        var outputDir = path.dirname(outputFile)
        var outputResourceDir = options.outputResouceDir || path.join(outputDir, path.basename(outputFile) + '.files.d')
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
        // debug(psdRoot)
        var domRoot = {
            tagName: 'svg',
            width: psdRoot.coords.right,
            height: psdRoot.coords.bottom,
            xmlns: 'http://www.w3.org/2000/svg',
            'xmlns:xlink': 'http://www.w3.org/1999/xlink',
            children: []
        }

        var domImagesGroup = {
            tagName: 'g',
            children: [],
        }

        scanTree(psdRoot, domRoot, 0)

        domRoot.children.push(domImagesGroup)

        // psd中的层与层之间的z轴排列顺序与svg是反的
        reverseDomTree(domRoot)

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

            if (psdNode.type === 'group') {
                svgNode.tagName = 'g'
                svgNode.children = []
                children.forEach((childPsdNode, i) => {
                    var childDomNode = {}
                    svgNode.children.push(childDomNode)
                    scanTree(childPsdNode, childDomNode, `${id}_${i}`)
                })
            } else if (psdNode.type === 'root'){
                svgNode.tagName = 'svg'
                svgNode.children = []
                children.forEach((childPsdNode, i) => {
                    var childDomNode = {}
                    svgNode.children.push(childDomNode)
                    scanTree(childPsdNode, childDomNode, `${id}_${i}`)
                })
            } else if (psdNode.type === 'layer') {
                if (psdNode.layer){
                    Object.assign(svgNode, {
                        tagName: 'rect',
                        className: psdNode.type,
                        id: 'p' + id,
                        x: psdNode.coords.left,
                        y: psdNode.coords.top,
                        width: (psdNode.coords.right - psdNode.coords.left),
                        height: (psdNode.coords.bottom - psdNode.coords.top) ,
                        'data-node-name': psdNode.name,
                        style: {},
                        children: [],
                    })
                    
                    fillSvgNodeFromPsdNode(psdNode, svgNode, id);
                } else {
                    warn('layer has no data!')
                }
            } else {
                warn('Unknown PSD Node type: ', psdNode.type)
            }

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
                svgNode.isValid = false
                return;
            }

            var exportedPsdNode = psdNode.export()

            if (exportedPsdNode) {
                // text node
                var text = exportedPsdNode.text
                if (text) {
                    debug(`rendering text node ${id}: `, text)
                    // debugger;

                    svgNode.tagName = 'text'
                    svgNode.className = svgNode.className + ' text'

                    let textLines = text.value.split("\r").length || text.value.split("\n").length
                    let fontSize = 16
                    let font = text.font;
                    if (font) {
                        if (font.sizes && font.sizes[0]) {
                            fontSize = font.sizes[0]
                            svgNode.style['font-size'] = font.sizes[0] + 'px'
                        }

                        if (font.colors && font.colors[0]) {
                            var color = font.colors[0]
                            svgNode.style['color'] = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
                            svgNode.fill = `rgb(${color[0]}, ${color[1]}, ${color[2]})`
                        }

                        if (font.alignment && font.alignment[0]) {
                            svgNode.style['text-align'] = font.alignment[0]
                        }
                    }
                    
                    svgNode['xml:space'] = 'preserve'
                    svgNode.children = autoWrapText(text.value, fontSize, fontSize * 1.8, svgNode.width, svgNode.x)

                    return;
                }
            }

            // else image layer
            if (psdNode.layer.image
                && psdNode.layer.image.saveAsPng) {
                debug(`saving ${outputResourceDir}/${id}.png`)

                psdNode.layer.image.saveAsPng(`${outputResourceDir}/${id}.png`)
                // svgNode.style['background-image'] = `url(${outputResourceUrlBase}/${id}.png)`
                svgNode.tagName = "image"
                svgNode['xlink:href'] = `${outputResourceUrlBase}/${id}.png`
            }
        }
    })
};

function reverseDomTree(node) {
    if (node.tagName !== 'text' && node.children){
        node.children.reverse()
        node.children.forEach(x => {
            reverseDomTree(x)
        })
    }
}

function autoWrapText(text, fontSize, lineHeight, containerWidth, containerLeft) {
    let tspans = []
    let lines = text.split(/\r|\n|\r\n/);
    lines.forEach(line => {
        let tspanBegin = 0
        let tspanWidth = 0
        let i = 0, n = line.length
        for (; i < n; i++){
            let charCode = line.charCodeAt(i)
            let nextWidth = tspanWidth + (charCode === 32 ? 0.3125 : (charCode < 256 ? 0.5 : 1)) * fontSize
            if (nextWidth - fontSize * 0.5 > containerWidth){
                tspans.push({
                    tagName: 'tspan',
                    x: containerLeft,
                    dy: lineHeight + 'px',
                    innerText: line.substring(tspanBegin, i),
                    'data-text-width': tspanWidth,
                })

                tspanBegin = i
                tspanWidth = nextWidth - tspanWidth
            } else {
                tspanWidth = nextWidth
            }
        }

        tspans.push({
            tagName: 'tspan',
            x: containerLeft,
            dy: lineHeight + 'px',
            innerText: line.substring(tspanBegin, i),
            'data-text-width': tspanWidth,
        })
    })

    tspans[0].dy = fontSize;

    return tspans
}

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
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
  ${main}`
}