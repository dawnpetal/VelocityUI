const Preview = (() => {
  function _base64ToUint8Array(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function _fileSrc(file) {
    const convert =
      window.__TAURI__?.core?.convertFileSrc ||
      window.__TAURI__?.convertFileSrc ||
      window.__TAURI__?.tauri?.convertFileSrc;
    try {
      const src = convert?.(file.path) || '';
      if (src === file.path || /^\/(?!\/)/.test(src) || /^[A-Za-z]:[\\/]/.test(src)) return '';
      return src;
    } catch {
      return '';
    }
  }
  async function _blobUrlFromFile(file) {
    const b64 = await window.__TAURI__?.core?.invoke?.('read_binary_file', { path: file.path });
    if (!b64) throw new Error('Binary file reader is unavailable');
    const bytes = _base64ToUint8Array(b64);
    const blob = new Blob([bytes], {
      type: LangMap.mimeFor(file.name),
    });
    const url = URL.createObjectURL(blob);
    EditorModels.setBlobUrl(file.id, url);
    return url;
  }
  function _tbBtn(label, onClick) {
    const b = document.createElement('button');
    b.className = 'preview-tb-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function _buildImageUI(pane, src, name) {
    let zoom = 1;
    const toolbar = document.createElement('div');
    toolbar.className = 'preview-toolbar';
    const zoomVal = document.createElement('span');
    zoomVal.className = 'preview-zoom-val';
    zoomVal.textContent = '100%';
    const viewport = document.createElement('div');
    viewport.className = 'preview-image-viewport';
    const img = document.createElement('img');
    img.className = 'preview-img';
    img.src = src;
    img.alt = name;
    img.draggable = false;
    img.onload = () => {
      const info = document.createElement('span');
      info.className = 'preview-img-info';
      info.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
      toolbar.appendChild(info);
      applyZoom();
    };
    const applyZoom = () => {
      if (zoom === 'fit') {
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.width = '';
        img.style.height = '';
        zoomVal.textContent = 'Fit';
      } else {
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.width = img.naturalWidth * zoom + 'px';
        img.style.height = img.naturalHeight * zoom + 'px';
        zoomVal.textContent = Math.round(zoom * 100) + '%';
      }
    };
    toolbar.append(
      _tbBtn('−', () => {
        zoom = Math.max(0.1, zoom - 0.1);
        applyZoom();
      }),
      zoomVal,
      _tbBtn('+', () => {
        zoom = Math.min(8, zoom + 0.1);
        applyZoom();
      }),
      _tbBtn('Fit', () => {
        zoom = 'fit';
        applyZoom();
      }),
      _tbBtn('1:1', () => {
        zoom = 1;
        applyZoom();
      }),
    );
    viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (zoom === 'fit') zoom = 1;
        zoom = Math.min(8, Math.max(0.1, zoom - e.deltaY * 0.001));
        applyZoom();
      },
      {
        passive: false,
      },
    );
    viewport.appendChild(img);
    pane.append(toolbar, viewport);
    return img;
  }
  function renderImage(pane, file) {
    pane.className = 'preview-pane preview-image-pane';
    const token = `${file.id}:${file.path}`;
    pane.dataset.previewToken = token;
    const isCurrent = () => pane.dataset.previewToken === token;
    if (file.binaryData) {
      const mime = LangMap.mimeFor(file.name);
      const bytes = _base64ToUint8Array(file.binaryData);
      const blob = new Blob([bytes], {
        type: mime,
      });
      const url = URL.createObjectURL(blob);
      EditorModels.setBlobUrl(file.id, url);
      _buildImageUI(pane, url, file.name);
    } else {
      const src = _fileSrc(file);
      if (!src) {
        pane.textContent = 'Loading image...';
        _blobUrlFromFile(file)
          .then((url) => {
            if (!isCurrent()) return;
            pane.textContent = '';
            _buildImageUI(pane, url, file.name);
          })
          .catch((err) => {
            if (!isCurrent()) return;
            pane.textContent = 'Could not load image: ' + (err?.message ?? err);
          });
        return;
      }
      const img = _buildImageUI(pane, src, file.name);
      img.onerror = () => {
        img.onerror = null;
        _blobUrlFromFile(file)
          .then((url) => {
            if (!isCurrent()) return;
            img.src = url;
          })
          .catch((err) => {
            if (!isCurrent()) return;
            pane.textContent = 'Could not load image: ' + (err?.message ?? err);
          });
      };
    }
  }
  function renderSvg(pane, file) {
    pane.className = 'preview-pane preview-image-pane';
    const blob = new Blob([file.content], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    EditorModels.setBlobUrl(file.id, url);
    _buildImageUI(pane, url, file.name);
  }
  function renderMarkdown(pane, file) {
    pane.className = 'preview-pane preview-md-pane';
    const scroll = document.createElement('div');
    scroll.className = 'preview-md-scroll';
    const article = document.createElement('article');
    article.className = 'preview-md-body';
    article.innerHTML = _mdToHtml(file.content);
    scroll.appendChild(article);
    pane.appendChild(scroll);
  }
  function renderHtml(pane, file) {
    pane.className = 'preview-pane preview-html-pane';
    const toolbar = document.createElement('div');
    toolbar.className = 'preview-toolbar';
    const label = document.createElement('span');
    label.className = 'preview-toolbar-label';
    label.textContent = 'HTML Preview — sandboxed, scripts disabled';
    toolbar.appendChild(label);
    const frame = document.createElement('iframe');
    frame.className = 'preview-html-frame';
    frame.sandbox = 'allow-same-origin';
    frame.srcdoc = file.content;
    pane.append(toolbar, frame);
  }
  function renderVideo(pane, file) {
    pane.className = 'preview-pane preview-video-pane';
    let url = _fileSrc(file);
    if (file.binaryData) {
      const mime = LangMap.mimeFor(file.name);
      const bytes = _base64ToUint8Array(file.binaryData);
      const blob = new Blob([bytes], {
        type: mime,
      });
      url = URL.createObjectURL(blob);
      EditorModels.setBlobUrl(file.id, url);
    }
    const toolbar = document.createElement('div');
    toolbar.className = 'preview-toolbar';
    const label = document.createElement('span');
    label.className = 'preview-toolbar-label';
    label.textContent = file.name;
    toolbar.appendChild(label);
    const viewport = document.createElement('div');
    viewport.className = 'preview-video-viewport';
    const video = document.createElement('video');
    video.className = 'preview-video';
    video.src = url;
    video.controls = true;
    video.style.cssText = 'max-width:100%;max-height:100%';
    video.onloadedmetadata = () => {
      const info = document.createElement('span');
      info.className = 'preview-img-info';
      info.textContent = `${video.videoWidth} × ${video.videoHeight}  ${_fmtDuration(video.duration)}`;
      toolbar.appendChild(info);
    };
    viewport.appendChild(video);
    pane.append(toolbar, viewport);
  }
  function _fmtDuration(secs) {
    if (!isFinite(secs)) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }
  function _mdToHtml(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split('\n');
    let html = '',
      i = 0,
      inUl = false,
      inOl = false,
      inCode = false,
      codeLang = '',
      codeBuf = '';
    const closeList = () => {
      if (inUl) {
        html += '</ul>';
        inUl = false;
      }
      if (inOl) {
        html += '</ol>';
        inOl = false;
      }
    };
    const inline = (s) =>
      esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
          const safe = /^(https?:|mailto:)/i.test(url.trim()) ? url : '#';
          return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        });
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        if (!inCode) {
          closeList();
          inCode = true;
          codeLang = line.slice(3).trim();
          codeBuf = '';
        } else {
          html += `<pre><code class="lang-${esc(codeLang)}">${esc(codeBuf.replace(/\n$/, ''))}</code></pre>`;
          inCode = false;
          codeBuf = '';
          codeLang = '';
        }
        i++;
        continue;
      }
      if (inCode) {
        codeBuf += line + '\n';
        i++;
        continue;
      }
      const hm = line.match(/^(#{1,6})\s+(.+)/);
      if (hm) {
        closeList();
        html += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`;
        i++;
        continue;
      }
      if (/^>\s?/.test(line)) {
        closeList();
        const bq = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          bq.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        html += `<blockquote>${_mdToHtml(bq.join('\n'))}</blockquote>`;
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        closeList();
        html += '<hr>';
        i++;
        continue;
      }
      if (/^[\*\-\+]\s/.test(line)) {
        if (!inUl) {
          if (inOl) {
            html += '</ol>';
            inOl = false;
          }
          html += '<ul>';
          inUl = true;
        }
        html += `<li>${inline(line.replace(/^[\*\-\+]\s/, ''))}</li>`;
        i++;
        continue;
      }
      if (/^\d+\.\s/.test(line)) {
        if (!inOl) {
          if (inUl) {
            html += '</ul>';
            inUl = false;
          }
          html += '<ol>';
          inOl = true;
        }
        html += `<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`;
        i++;
        continue;
      }
      if (line.trim() === '') {
        closeList();
        html += '<br>';
        i++;
        continue;
      }
      if (/\|/.test(line) && i + 1 < lines.length && /^\|?[\s\-:]+\|/.test(lines[i + 1])) {
        closeList();
        const headers = line
          .split('|')
          .filter((c, idx) => idx > 0 || c.trim())
          .map((c) => c.trim())
          .filter(Boolean);
        i += 2;
        const rows = [];
        while (i < lines.length && /\|/.test(lines[i])) {
          rows.push(
            lines[i]
              .split('|')
              .filter((c, idx) => idx > 0 || c.trim())
              .map((c) => c.trim())
              .filter(Boolean),
          );
          i++;
        }
        html +=
          '<table><thead><tr>' +
          headers.map((h) => `<th>${inline(h)}</th>`).join('') +
          '</tr></thead>';
        html +=
          '<tbody>' +
          rows
            .map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
            .join('') +
          '</tbody></table>';
        continue;
      }
      closeList();
      html += `<p>${inline(line)}</p>`;
      i++;
    }
    closeList();
    if (inCode) html += `<pre><code>${esc(codeBuf)}</code></pre>`;
    return html;
  }
  return {
    renderImage,
    renderSvg,
    renderMarkdown,
    renderHtml,
    renderVideo,
  };
})();
