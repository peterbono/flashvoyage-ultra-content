/**
 * GA4 Flywheel Events — FlashVoyage
 *
 * Copy this code into WPCode Lite as a site-wide footer snippet.
 * It tracks the full user journey from first touch to affiliate click.
 *
 * Events tracked:
 *   1. scroll_depth (25%, 50%, 75%, 100%)
 *   2. widget_visible (Travelpayouts widget enters viewport)
 *   3. affiliate_click (widget or CTA link click)
 *   4. internal_link_click (cross-article navigation)
 *   5. return_visit (repeat visitor detection)
 *
 * These events feed the cohort analysis in ga4-fetcher.js
 * and the A/B test engine in ab-test-engine.js.
 *
 * Prerequisites:
 *   - gtag.js already loaded (via Rank Math or manual insertion)
 *   - GA4 property 505793742 configured
 */

(function() {
  'use strict';

  // ── 1. Scroll Depth Tracking ──────────────────────────────────────────────
  // Fires at 25%, 50%, 75%, 100% scroll depth.
  // Only on article pages (not homepage, admin, etc.)

  var scrollThresholds = [25, 50, 75, 100];
  var scrollFired = {};

  function getScrollPercent() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop;
    var scrollHeight = Math.max(
      body.scrollHeight, doc.scrollHeight,
      body.offsetHeight, doc.offsetHeight,
      body.clientHeight, doc.clientHeight
    );
    var clientHeight = doc.clientHeight || window.innerHeight;
    return Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
  }

  function detectContentGroup() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('budget') || path.includes('prix') || path.includes('cout')) return 'budget';
    if (path.includes('guide') || path.includes('complet') || path.includes('itineraire')) return 'guide';
    if (path.includes('vs') || path.includes('versus') || path.includes('comparatif')) return 'comparison';
    if (path.includes('actualite') || path.includes('news') || path.includes('alerte')) return 'news';
    return 'article';
  }

  if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/wp-')) {
    window.addEventListener('scroll', function() {
      var percent = getScrollPercent();
      for (var i = 0; i < scrollThresholds.length; i++) {
        var threshold = scrollThresholds[i];
        if (percent >= threshold && !scrollFired[threshold]) {
          scrollFired[threshold] = true;
          if (typeof gtag === 'function') {
            gtag('event', 'scroll_depth', {
              percent: threshold,
              page_path: window.location.pathname,
              content_group: detectContentGroup()
            });
          }
        }
      }
    }, { passive: true });
  }

  // ── 2. Widget Visibility Tracking ─────────────────────────────────────────
  // Fires when a Travelpayouts widget enters the viewport.
  // Uses IntersectionObserver (97%+ browser support).

  if ('IntersectionObserver' in window) {
    var widgetObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var widget = entry.target;
          var widgetType = widget.getAttribute('data-tp-widget') ||
                          widget.getAttribute('data-tp') ||
                          widget.className.match(/tp-(\w+)/)?.[1] ||
                          'unknown';

          // Determine position in article
          var allWidgets = document.querySelectorAll('[data-tp-widget], [data-tp], .tp-widget');
          var position = 'unknown';
          for (var i = 0; i < allWidgets.length; i++) {
            if (allWidgets[i] === widget) {
              position = i === 0 ? 'first' : i === allWidgets.length - 1 ? 'last' : 'middle_' + i;
              break;
            }
          }

          if (typeof gtag === 'function') {
            gtag('event', 'widget_visible', {
              widget_type: widgetType,
              widget_position: position,
              page_path: window.location.pathname
            });
          }

          // Only fire once per widget
          widgetObserver.unobserve(widget);
        }
      });
    }, { threshold: 0.5 }); // 50% visible

    // Observe all Travelpayouts widgets after DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
      var widgets = document.querySelectorAll('[data-tp-widget], [data-tp], .tp-widget, iframe[src*="travelpayouts"]');
      widgets.forEach(function(w) {
        widgetObserver.observe(w);
      });
    });
  }

  // ── 3. Affiliate Click Tracking ───────────────────────────────────────────
  // Fires on:
  //   a) Travelpayouts widget interactions (click inside widget)
  //   b) CTA links with rel="sponsored" or rel="nofollow"
  //   c) Links to travelpayouts domains

  document.addEventListener('click', function(e) {
    // Widget click
    var widget = e.target.closest('[data-tp-widget], [data-tp], .tp-widget');
    if (widget) {
      var wType = widget.getAttribute('data-tp-widget') ||
                  widget.getAttribute('data-tp') ||
                  'widget';
      if (typeof gtag === 'function') {
        gtag('event', 'affiliate_click', {
          event_category: 'monetization',
          event_label: wType,
          page_path: window.location.pathname
        });
      }
    }

    // CTA link click
    var link = e.target.closest('a');
    if (link) {
      var rel = (link.getAttribute('rel') || '').toLowerCase();
      var href = (link.getAttribute('href') || '').toLowerCase();

      var isAffiliate = rel.includes('sponsored') ||
                        href.includes('travelpayouts') ||
                        href.includes('tp.media') ||
                        href.includes('aviasales') ||
                        href.includes('hotellook');

      if (isAffiliate) {
        if (typeof gtag === 'function') {
          gtag('event', 'affiliate_click', {
            event_category: 'monetization',
            event_label: 'cta_link',
            link_url: href.substring(0, 200),
            page_path: window.location.pathname
          });
        }
      }
    }
  }, true);

  // ── 4. Internal Link Click Tracking ───────────────────────────────────────
  // Tracks navigation between FlashVoyage articles.
  // Helps measure internal link equity flow.

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    var isInternal = href.startsWith('/') ||
                     href.includes('flashvoyage.com');
    var isArticleLink = !href.includes('/wp-') &&
                        !href.includes('/tag/') &&
                        !href.includes('/category/') &&
                        !href.startsWith('#');

    if (isInternal && isArticleLink && href !== window.location.pathname) {
      // Determine link position
      var position = 'unknown';
      var article = link.closest('article, .entry-content, .post-content');
      if (article) position = 'inline';
      if (link.closest('.sidebar, aside')) position = 'sidebar';
      if (link.closest('footer, .footer')) position = 'footer';
      if (link.closest('.related-posts, .jeg_postblock')) position = 'related';

      if (typeof gtag === 'function') {
        gtag('event', 'internal_link_click', {
          link_text: (link.textContent || '').trim().substring(0, 100),
          destination_path: href.replace(/https?:\/\/[^\/]+/, ''),
          source_path: window.location.pathname,
          link_position: position
        });
      }
    }
  });

  // ── 5. Return Visit Detection ─────────────────────────────────────────────
  // Tracks whether this is a new or returning visitor.
  // Stored in localStorage (persists across sessions).

  try {
    var FV_KEY_FIRST = 'fv_first_visit';
    var FV_KEY_COUNT = 'fv_visit_count';
    var now = new Date().toISOString().slice(0, 10);

    var firstVisit = localStorage.getItem(FV_KEY_FIRST);
    var visitCount = parseInt(localStorage.getItem(FV_KEY_COUNT) || '0', 10);

    if (!firstVisit) {
      // First visit ever
      localStorage.setItem(FV_KEY_FIRST, now);
      localStorage.setItem(FV_KEY_COUNT, '1');
    } else {
      // Return visit — only count once per day
      var lastCounted = sessionStorage.getItem('fv_counted_today');
      if (lastCounted !== now) {
        visitCount++;
        localStorage.setItem(FV_KEY_COUNT, String(visitCount));
        sessionStorage.setItem('fv_counted_today', now);
      }

      if (visitCount >= 2) {
        var daysSinceFirst = Math.floor(
          (new Date(now) - new Date(firstVisit)) / (24 * 60 * 60 * 1000)
        );

        if (typeof gtag === 'function') {
          gtag('event', 'return_visit', {
            visit_number: visitCount,
            first_visit_date: firstVisit,
            days_since_first: daysSinceFirst,
            page_path: window.location.pathname
          });
        }
      }
    }
  } catch (e) {
    // localStorage may be blocked in private browsing
  }

})();
