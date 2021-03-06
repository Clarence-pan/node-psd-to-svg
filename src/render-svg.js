module.exports = function (tag) {
    return renderSvgTag(tag)
}


/**
 * 一个便捷方法，渲染多个标签，默认使用div进行包裹
 * @param children
 * @param container
 * @returns {*}
 */
function renderSvgTags(children, container) {
    container = container || {tagName: 'rect'};
    container.children = children;
    return renderSvgTag(container);
}

/**
 * 渲染一个Svg标签
 * 注意：大多数的属性与Svg本身定义的一样，除了一下几个：
 * - tagName    -- 标签名，这个不会作为属性进行输出，而是当作标签名进行渲染 {tagName: 'a'} => <a></a>
 * - children   -- 子元素，这个需要传一个数组，里面每个元素都是一段Svg或一个标签的定义
 * - innerSvg  -- 同DOM的innerSvg
 * - innerText  -- 同DOM的innerText
 * - label      -- innerText的别名 （如果同时有innerText则使用innerText）
 * - className  -- 为了避免与关键词class冲突，而起的别名，即是css的class
 * - isVisible  -- 如果是一个falsy，则渲染的style里面会追加";display:none;"
 * - isValid    -- 如果是一个falsy，则就不渲染了（返回空字符串）
 * - disabled, checked, readonly 如果是一个falsy则不渲染这个属性，否则会渲染为disabled="disabled"这样子的
 *
 * @param tag {string|object} 标签定义，或标签名（tagName）
 * @param options {object}    标签定义 -- 只有第一个参数是标签名的时候才需要传
 * @returns {*}
 */
function renderSvgTag(tag, options) {
    if (!tag) {
        console.error("Invalid tag: " + JSON.stringify(tag));
        return '';
    }

    var tagName;

    if (arguments.length >= 2) {
        tagName = arguments[0];
        tag = arguments[1];
    } else {
        tagName = tag.tagName || 'p';
    }

    // 处理是否渲染
    if ('isValid' in tag) {
        if (!tag.isValid) {
            return '';
        }

        delete tag.isValid;
    }

    // 处理是否显示
    if ('isVisible' in tag) {
        if (!tag.isVisible) {
            tag.style = (tag.style || {});
            tag.style.display = 'none';
        }

        delete tag.isVisible;
    }

    // 拼接所有的属性
    var attributesArr = [];
    for (var attrKey in tag) {
        if (tag.hasOwnProperty(attrKey)
            && attrKey != 'tagName' && attrKey != 'className'
            && attrKey != 'data' && attrKey != 'label'
            && attrKey != 'innerSvg' && attrKey != 'innerText'
            && attrKey != 'children') {

            // disabled等属性只有在非falsy的时候才需要赋值
            if (attrKey === 'disabled' || attrKey === 'checked' || attrKey === 'readonly') {
                if (tag[attrKey] && render(tag[attrKey])) {
                    attributesArr.push(attrKey + '="' + attrKey + '"');
                }
            } else if (attrKey === 'style' && tag[attrKey] && typeof(tag[attrKey]) === 'object'){
                var styleValueMap = tag[attrKey];
                var styleValueArr = [];
                for (var styleKey in styleValueMap){
                    if (styleValueMap.hasOwnProperty(styleKey)){
                        styleValueArr.push(styleKey + ': ' + styleValueMap[styleKey]);
                    }
                }

                attributesArr.push(attrKey + '="' + encodeSvgAttribute(styleValueArr.join(';')) + '"');
            } else {
                attributesArr.push(attrKey + '="' + encodeSvgAttribute(render(tag[attrKey])) + '"');
            }

        }
    }

    if (tag.className) {
        attributesArr.push('class="' + encodeSvgAttribute(render(tag.className)) + '"');
    }


    if (tag.data) {
        for (var dataKey in tag.data) {
            if (tag.data.hasOwnProperty(dataKey)) {
                attributesArr.push(" data-" + dataKey + '="' + encodeSvgAttribute(render(tag.data[dataKey])) + '"');
            }
        }
    }

    var attributesStr = attributesArr.join(' ');

    if (tagName == 'input' || tagName == 'img') {
        return '<' + tagName + ' ' + attributesStr + '/>';
    }

    var innerSvg = tag.innerSvg || encodeSvgSpecialChars(render(tag.innerText || tag.label)) || '';

    if (!innerSvg && tag.children) {
        var childrenSvgArr = [];
        for (var i in tag.children) {
            if (tag.children.hasOwnProperty(i)) {
                var child = tag.children[i];
                childrenSvgArr.push(typeof(child) == 'string' ? child : renderSvgTag(child));
            }
        }

        innerSvg = childrenSvgArr.join('');
    }

    return '<' + tagName + ' ' + attributesStr + '>' + innerSvg + '</' + tagName + '>';
}


/**
 * 转义模版
 * @param str
 * @returns {*}
 */
function escape(str) {
    if (str instanceof raw) {
        return str + ''
    }

    return str.replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&#34;')
        .replace(/'/g, '&#39;')
}



function encodeSvgAttribute(attr) {
    attr = (attr === 0 ? '0' : (attr || '')) + '';
    return encodeSvgSpecialChars(attr).replace(/\n/g, "&#10;");
}

function encodeSvgSpecialChars(text) {
    text = (text === 0 ? '0' : (text || '')) + '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}



function render(something, data) {
    if (something === null || typeof something === 'undefined') {
        return '';
    }

    return (something + '') || '';
}

