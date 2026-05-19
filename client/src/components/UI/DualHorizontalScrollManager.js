import { useEffect } from 'react';
import './DualHorizontalScrollManager.css';

const TARGET_SELECTOR = [
  '.data-grid-table-container',
  '.e-grid .e-content',
  '.role-messages-list',
  '.booth-report-table',
  '.org-users-table-scroll',
  '.qualifications-table-scroll',
  '[data-dual-scroll-target="true"]'
].join(', ');

const hasHorizontalScroll = (element) => element.scrollWidth > element.clientWidth + 1;

export default function DualHorizontalScrollManager() {
  useEffect(() => {
    const attachments = new Map();

    const detach = (target) => {
      const entry = attachments.get(target);
      if (!entry) return;

      target.removeEventListener('scroll', entry.onBottomScroll);
      entry.topScrollbar.removeEventListener('scroll', entry.onTopScroll);
      entry.resizeObserver.disconnect();
      entry.topScrollbar.remove();
      target.removeAttribute('data-dual-scroll-attached');
      attachments.delete(target);
    };

    const attach = (target) => {
      if (!target || target.dataset.dualScrollAttached === 'true' || !target.parentElement) {
        return;
      }

      const topScrollbar = document.createElement('div');
      topScrollbar.className = 'dual-scrollbar dual-scrollbar--top';
      topScrollbar.setAttribute('aria-hidden', 'true');

      const spacer = document.createElement('div');
      spacer.className = 'dual-scrollbar__spacer';
      topScrollbar.appendChild(spacer);

      target.parentElement.insertBefore(topScrollbar, target);

      let isSyncing = false;

      const onBottomScroll = () => {
        if (isSyncing) return;
        isSyncing = true;
        topScrollbar.scrollLeft = target.scrollLeft;
        isSyncing = false;
      };

      const onTopScroll = () => {
        if (isSyncing) return;
        isSyncing = true;
        target.scrollLeft = topScrollbar.scrollLeft;
        isSyncing = false;
      };

      const update = () => {
        const contentWidth = target.scrollWidth;
        spacer.style.width = `${contentWidth}px`;
        topScrollbar.style.display = hasHorizontalScroll(target) ? 'block' : 'none';
        topScrollbar.scrollLeft = target.scrollLeft;
      };

      const resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(target);
      if (target.firstElementChild) {
        resizeObserver.observe(target.firstElementChild);
      }

      target.addEventListener('scroll', onBottomScroll, { passive: true });
      topScrollbar.addEventListener('scroll', onTopScroll, { passive: true });
      target.dataset.dualScrollAttached = 'true';

      attachments.set(target, {
        topScrollbar,
        resizeObserver,
        onBottomScroll,
        onTopScroll,
        update
      });

      update();
    };

    const refresh = () => {
      const targets = document.querySelectorAll(TARGET_SELECTOR);
      targets.forEach((target) => attach(target));

      attachments.forEach((entry, target) => {
        if (!target.isConnected) {
          detach(target);
          return;
        }
        entry.update();
      });
    };

    const mutationObserver = new MutationObserver(() => refresh());
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    refresh();

    return () => {
      mutationObserver.disconnect();
      attachments.forEach((_, target) => detach(target));
    };
  }, []);

  return null;
}
