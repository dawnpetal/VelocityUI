const VirtualList = (() => {
  const ROW_HEIGHT = 26;
  const OVERSCAN = 8;

  function create({ container, getCount, getItem, getItemHeight, renderRow, onScroll }) {
    let _totalCount = 0;
    let _scrollTop = 0;
    let _viewportHeight = 0;
    let _rendered = new Map();
    let _inner = null;
    let _rafId = null;
    let _resizeObserver = null;
    let _lastStart = -1;
    let _lastEnd = -1;

    function _setup() {
      container.style.overflowY = 'auto';
      container.style.position = 'relative';

      _inner = document.createElement('div');
      _inner.style.position = 'relative';
      container.appendChild(_inner);

      container.addEventListener('scroll', _onScroll, { passive: true });

      const ro = new ResizeObserver((entries) => {
        _viewportHeight = entries[0].contentRect.height;
        _flush();
      });
      ro.observe(container);
      _resizeObserver = ro;
    }

    function _onScroll() {
      _scrollTop = container.scrollTop;
      if (_rafId) return;
      _rafId = requestAnimationFrame(() => {
        _rafId = null;
        _flush();
        onScroll?.(_scrollTop);
      });
    }

    function _heightAt(index) {
      const item = getItem ? getItem(index) : null;
      const value = getItemHeight?.(index, item);
      return Number.isFinite(value) && value > 0 ? value : ROW_HEIGHT;
    }

    function _offsetFor(index) {
      let offset = 0;
      for (let i = 0; i < index; i++) offset += _heightAt(i);
      return offset;
    }

    function _totalHeight() {
      let height = 0;
      for (let i = 0; i < _totalCount; i++) height += _heightAt(i);
      return height;
    }

    function _getRange() {
      let start = 0;
      let y = 0;
      while (start < _totalCount && y + _heightAt(start) < _scrollTop) {
        y += _heightAt(start);
        start++;
      }
      start = Math.max(0, start - OVERSCAN);
      let end = start;
      y = _offsetFor(start);
      const limit = _scrollTop + _viewportHeight;
      while (end < _totalCount && y < limit) {
        y += _heightAt(end);
        end++;
      }
      end = Math.min(_totalCount, end + OVERSCAN);
      return { start, end };
    }

    function _flush() {
      const { start, end } = _getRange();
      if (start === _lastStart && end === _lastEnd) return;

      for (const [idx, el] of _rendered) {
        if (idx < start || idx >= end) {
          el.remove();
          _rendered.delete(idx);
        }
      }

      for (let i = start; i < end; i++) {
        if (_rendered.has(i)) continue;
        const item = getItem ? getItem(i) : null;
        const el = renderRow(i, item);
        if (!el) continue;
        el.style.position = 'absolute';
        el.style.top = _offsetFor(i) + 'px';
        el.style.left = '0';
        el.style.right = '0';
        el.style.height = _heightAt(i) + 'px';
        _inner.appendChild(el);
        _rendered.set(i, el);
      }

      _lastStart = start;
      _lastEnd = end;
    }

    function update(count) {
      _totalCount = count;
      _viewportHeight = container.getBoundingClientRect().height;
      _inner.style.height = _totalHeight() + 'px';
      _scrollTop = container.scrollTop;
      _lastStart = -1;
      _lastEnd = -1;

      for (const [, el] of _rendered) el.remove();
      _rendered.clear();

      _flush();
    }

    function invalidateRow(idx) {
      const el = _rendered.get(idx);
      if (!el) return;
      const item = getItem ? getItem(idx) : null;
      const fresh = renderRow(idx, item);
      if (!fresh) return;
      fresh.style.cssText = el.style.cssText;
      el.replaceWith(fresh);
      _rendered.set(idx, fresh);
    }

    function scrollToIndex(idx) {
      const top = _offsetFor(idx);
      const bottom = top + _heightAt(idx);
      if (top < container.scrollTop) {
        container.scrollTop = top;
      } else if (bottom > container.scrollTop + _viewportHeight) {
        container.scrollTop = bottom - _viewportHeight;
      }
    }

    function getRenderedEl(idx) {
      return _rendered.get(idx) ?? null;
    }

    function destroy() {
      if (_rafId) cancelAnimationFrame(_rafId);
      _rafId = null;
      container.removeEventListener('scroll', _onScroll);
      _resizeObserver?.disconnect();
      _resizeObserver = null;
      for (const [, el] of _rendered) el.remove();
      _rendered.clear();
      _inner?.remove();
      _inner = null;
    }

    _setup();

    return { update, invalidateRow, scrollToIndex, getRenderedEl, destroy };
  }

  return { create, ROW_HEIGHT };
})();
