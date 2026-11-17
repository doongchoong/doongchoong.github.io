/* chatlog 숏코드: 말풍선 ↔ CRT 터미널 전환.
 * 각 대화 상자에 전환 버튼을 붙이고, CRT로 처음 바꿀 때 crt-terminal.js를 불러온다.
 * 숏코드가 data-style="crt"로 나왔으면 처음부터 CRT로 보여준다. */
(function () {
  'use strict';
  var SRC = (document.currentScript && document.currentScript.src || '/static/js/chatlog.js')
    .replace(/chatlog\.js(\?.*)?$/, 'crt-terminal.js');
  var loading = null;

  function loadCRT() {
    if (window.CRT) return Promise.resolve(window.CRT);
    if (!loading) loading = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = SRC;
      s.onload = function () { ok(window.CRT); };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---------- 렌더링된 HTML → 터미널에 찍을 글자 ---------- */
  var BLOCK = /^(P|DIV|PRE|UL|OL|LI|H[1-6]|BLOCKQUOTE|TABLE|HR|SECTION|DETAILS|FIGURE|IMG|SCRIPT|STYLE|CANVAS|SVG|BUTTON|IFRAME)$/;

  function inline(n) {
    var s = '';
    n.childNodes.forEach(function (c) {
      if (c.nodeType === 3) s += c.nodeValue.replace(/\s*\n\s*/g, ' ');
      else if (c.nodeName === 'BR') s += '\n';
      else if (c.nodeType === 1) s += inline(c);
    });
    return s;
  }

  function indent(s, first, rest) {
    return s.split('\n').map(function (l, i) { return (i ? rest : first) + l; }).join('\n');
  }

  function blocks(root) {
    var out = [], buf = '';
    function flush() {
      var t = buf.replace(/[ \t]*\n[ \t]*/g, '\n').trim();
      if (t) out.push(t);
      buf = '';
    }
    root.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { buf += n.nodeValue.replace(/\s*\n\s*/g, ' '); return; }
      if (n.nodeType !== 1) return;
      var tag = n.nodeName.toUpperCase();
      if (tag === 'BR') { buf += '\n'; return; }
      if (!BLOCK.test(tag)) { buf += inline(n); return; }
      flush();
      var b = block(n, tag);
      if (b) out.push(b);
    });
    flush();
    return out;
  }

  function block(n, tag) {
    if (n.classList.contains('code-title')) return n.textContent.trim() ? '[' + n.textContent.trim() + ']' : '';
    if (tag === 'P') return inline(n).replace(/[ \t]*\n[ \t]*/g, '\n').trim();
    if (tag === 'PRE') return indent(n.textContent.replace(/\n+$/, ''), '  ', '  ');
    if (/^H[1-6]$/.test(tag)) return '## ' + inline(n).trim();
    if (tag === 'UL' || tag === 'OL') {
      var start = parseInt(n.getAttribute('start') || '1', 10);
      return [].map.call(n.children, function (li, i) {
        var m = tag === 'OL' ? (start + i) + '. ' : '- ';
        return indent(blocks(li).join('\n'), m, new Array(m.length + 1).join(' '));
      }).join('\n');
    }
    if (tag === 'BLOCKQUOTE') return indent(blocks(n).join('\n\n'), '| ', '| ');
    if (tag === 'TABLE') return [].map.call(n.rows, function (r) {
      return [].map.call(r.cells, function (c) { return inline(c).trim(); }).join(' | ');
    }).join('\n');
    if (tag === 'HR') return '────────';
    if (tag === 'IMG') return '[그림' + (n.alt ? ': ' + n.alt : '') + ']';
    if (/^(SCRIPT|STYLE|CANVAS|SVG|BUTTON|IFRAME)$/.test(tag)) return '';
    return blocks(n).join('\n\n');
  }

  /* 턴 하나의 글자. 맨 앞의 화자 표기(**User**, **🤖 Claude:**)는 뺀다. */
  function turnText(turn) {
    var c = turn.cloneNode(true);
    var first = c.firstElementChild;
    if (first && first.firstChild && first.firstChild.nodeName === 'STRONG') {
      first.removeChild(first.firstChild);
      var t = first.firstChild;
      if (t && t.nodeType === 3) t.nodeValue = t.nodeValue.replace(/^[\s.:]+/, '');
      while (first.firstChild && first.firstChild.nodeName === 'BR') first.removeChild(first.firstChild);
    }
    return blocks(c).join('\n\n').trim();
  }

  function script(log) {
    return [].map.call(log.querySelectorAll('.chatlog-body > .chat-turn'), function (t) {
      return { role: t.getAttribute('data-role') || 'sys', text: turnText(t) };
    }).filter(function (s) { return s.text; });
  }

  /* ---------- 전환 ---------- */
  function setMode(log, crt) {
    var btn = log.querySelector('.chatlog-toggle');
    if (!crt) {
      log.classList.remove('is-crt');
      if (btn) btn.textContent = '터미널로 보기';
      return;
    }
    var screen = log.querySelector(':scope > .crt');
    if (!screen) {
      var s = script(log);
      var ai = log.querySelector('.chat-turn[data-role=ai]');
      var who = (ai && ai.getAttribute('data-who') || 'terminal').toLowerCase();
      var chars = s.reduce(function (n, x) { return n + x.text.length; }, 0);
      screen = document.createElement('div');
      screen.className = 'crt';
      screen.setAttribute('data-title', who + ' // ' + (log.getAttribute('data-date') || ''));
      screen.setAttribute('data-speed', Math.max(1, chars / 1200).toFixed(2));
      log.appendChild(screen);
      log.__script = s;
    }
    log.classList.add('is-crt');
    if (btn) btn.textContent = '말풍선으로 보기';
    loadCRT().then(function (CRT) { return CRT.mount(screen, log.__script); })
      .catch(function (e) { console.warn('[chatlog] CRT를 불러오지 못함', e); setMode(log, false); });
  }

  function init() {
    [].forEach.call(document.querySelectorAll('.chatlog'), function (log) {
      var style = log.getAttribute('data-style');
      if (log.__chatlog || (style !== 'crt' && style !== 'toggle')) return;
      log.__chatlog = true;
      if (style === 'crt') { setMode(log, true); return; }
      var bar = document.createElement('div');
      bar.className = 'chatlog-bar';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chatlog-toggle';
      bar.appendChild(btn);
      log.insertBefore(bar, log.firstChild);
      btn.addEventListener('click', function () { setMode(log, !log.classList.contains('is-crt')); });
      setMode(log, false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
