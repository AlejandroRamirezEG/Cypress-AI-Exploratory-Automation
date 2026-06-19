'use strict';

// ── shared CSS ────────────────────────────────────────────────────────────────

const CSS_BASE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.5;font-size:15px}
  .wrap{max-width:980px;margin:0 auto;padding:36px 24px}
  h2{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:14px}
  details>summary::-webkit-details-marker{display:none}
  details>summary{user-select:none}
  details[open]>summary::after{content:' ▾'}
  details:not([open])>summary::after{content:' ▸'}
  a{color:#2563eb}
  @media print{body{background:#fff}.wrap{padding:12px}details{break-inside:avoid}}
`;

const CSS_TABS = `
  .tab-bar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:2px solid #e2e8f0;display:flex;flex-wrap:wrap;padding:0 16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .tab-btn{padding:11px 18px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;border:none;background:none;color:#64748b;border-bottom:3px solid transparent;margin-bottom:-2px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
  .tab-btn:hover:not(.active){color:#334155;border-bottom-color:#cbd5e1}
  .tab-btn.active{color:#1d4ed8;border-bottom-color:#1d4ed8}
  .panel[hidden]{display:none!important}
  .panel.wrap{padding-top:28px}
`;

// ── settings panel ─────────────────────────────────────────────────────────────
// Gear icon (⚙) opens this popover. Appears in the sticky tab bar for combined
// reports and as a fixed button in the top-right for standalone reports.
// Settings are stored in localStorage['wcag-settings'] — browser-side, no file.

const HTML_SETTINGS_BTN_FIXED = `
<button id="wcag-settings-btn" title="Report settings — press ? to toggle"
  aria-label="Report settings"
  style="position:fixed;top:10px;right:14px;z-index:200;background:#1e293b;color:#e2e8f0;
         border:none;border-radius:10px;width:48px;height:48px;font-size:20px;cursor:pointer;
         display:flex;align-items:center;justify-content:center;
         box-shadow:0 2px 8px rgba(0,0,0,.25)">&#9881;</button>`;

const HTML_SETTINGS_BTN_TABBAR = `<button id="wcag-settings-btn"
  title="Report settings — press ? to toggle" aria-label="Report settings"
  style="margin-left:auto;min-width:48px;min-height:44px;padding:0 14px;background:none;border:none;color:#64748b;
         font-size:20px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
         flex-shrink:0;border-bottom:3px solid transparent;margin-bottom:-2px">&#9881;</button>`;

const HTML_SETTINGS_PANEL = `
<div id="wcag-settings-panel" role="dialog" aria-label="Report settings" aria-modal="true"
  style="display:none;position:fixed;top:54px;right:16px;z-index:9999;
         background:#1e293b;color:#f8fafc;border-radius:12px;
         box-shadow:0 8px 32px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.08);
         width:284px;overflow:hidden;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">

  <div style="padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.1);
              display:flex;align-items:center;gap:8px">
    <span style="font-size:15px" aria-hidden="true">&#9881;</span>
    <span style="font-weight:700;font-size:14px">Report Settings</span>
    <button id="wcag-settings-close" aria-label="Close settings"
      style="margin-left:auto;background:none;border:none;color:#94a3b8;
             font-size:18px;line-height:1;cursor:pointer;padding:2px 5px;border-radius:4px">&#10005;</button>
  </div>

  <div style="padding:16px 18px">

    <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                letter-spacing:.8px;color:#64748b;margin-bottom:10px">Display</div>
    <label style="display:flex;align-items:center;gap:10px;font-size:13px;
                  cursor:pointer;padding:4px 0">
      <input type="checkbox" id="wcag-hide-passing"
        style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb;flex-shrink:0">
      <span>Hide passing sections</span>
    </label>

    <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                letter-spacing:.8px;color:#64748b;margin-top:18px;margin-bottom:10px">Text Size</div>
    <div style="display:flex;gap:6px">
      <button id="wcag-ts-small" style="flex:1;padding:5px 0;background:rgba(255,255,255,.08);
                     border:1px solid rgba(255,255,255,.12);border-radius:6px;
                     color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">S</button>
      <button id="wcag-ts-medium" style="flex:1;padding:5px 0;background:#2563eb;border:1px solid #2563eb;
                     border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer">M</button>
      <button id="wcag-ts-large" style="flex:1;padding:5px 0;background:rgba(255,255,255,.08);
                     border:1px solid rgba(255,255,255,.12);border-radius:6px;
                     color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">L</button>
      <button id="wcag-ts-xl" style="flex:1;padding:5px 0;background:rgba(255,255,255,.08);
                     border:1px solid rgba(255,255,255,.12);border-radius:6px;
                     color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">XL</button>
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                  letter-spacing:.8px;color:#64748b;margin-bottom:10px">Section Order</div>
      <button id="wcag-reset-order"
        style="width:100%;padding:7px 0;background:rgba(255,255,255,.07);
               border:1px solid rgba(255,255,255,.12);border-radius:6px;color:#f8fafc;
               font-size:12px;font-weight:600;cursor:pointer;display:flex;
               align-items:center;justify-content:center;gap:6px">
        &#8635; Reset section order
      </button>
    </div>

    <div style="font-size:11px;color:#94a3b8;margin-top:14px;padding-top:12px;
                border-top:1px solid rgba(255,255,255,.07);
                display:grid;grid-template-columns:1fr 1fr;gap:6px 12px">
      <span><kbd style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace">?</kbd> settings</span>
      <span><kbd style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace">Esc</kbd> close</span>
      <span><kbd style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace">&lt;</kbd> collapse all</span>
      <span><kbd style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:1px 6px;font-size:11px;font-family:monospace">&gt;</kbd> expand all</span>
    </div>

  </div>
</div>`;

const JS_SETTINGS = `
<script>
(function(){
  var SKEY='wcag-settings',settings={};
  try{settings=JSON.parse(localStorage.getItem(SKEY)||'{}');}catch(e){}
  function save(){try{localStorage.setItem(SKEY,JSON.stringify(settings));}catch(e){}}

  function applyHidePassing(hide){
    document.querySelectorAll('[data-wcag-pass]').forEach(function(el){
      el.style.display=hide?'none':'';
    });
  }

  var TEXT_SIZES={small:'0.8',medium:'1',large:'1.3',xl:'1.7'};
  function applyTextSize(size){
    document.documentElement.style.zoom=TEXT_SIZES[size]||'1';
    ['small','medium','large','xl'].forEach(function(s){
      var b=document.getElementById('wcag-ts-'+s);
      if(!b)return;
      var active=s===size;
      b.style.background=active?'#2563eb':'rgba(255,255,255,.08)';
      b.style.borderColor=active?'#2563eb':'rgba(255,255,255,.12)';
      b.style.color=active?'#fff':'#f8fafc';
    });
  }

  function panel(){return document.getElementById('wcag-settings-panel');}
  function isOpen(){var p=panel();return p&&p.style.display!=='none'&&p.style.display!=='';}
  function openPanel(){var p=panel();if(p)p.style.display='block';}
  function closePanel(){var p=panel();if(p)p.style.display='none';}
  function togglePanel(){isOpen()?closePanel():openPanel();}

  function init(){
    var cb=document.getElementById('wcag-hide-passing');
    if(cb){
      cb.checked=!!settings.hidePassing;
      applyHidePassing(cb.checked);
      cb.addEventListener('change',function(){
        settings.hidePassing=cb.checked;
        save();
        applyHidePassing(cb.checked);
      });
    }

    var currentSize=settings.textSize||'medium';
    applyTextSize(currentSize);
    ['small','medium','large','xl'].forEach(function(s){
      var b=document.getElementById('wcag-ts-'+s);
      if(b)b.addEventListener('click',function(){
        settings.textSize=s;
        save();
        applyTextSize(s);
      });
    });

    var btn=document.getElementById('wcag-settings-btn');
    if(btn)btn.addEventListener('click',function(e){e.stopPropagation();togglePanel();});

    var cls=document.getElementById('wcag-settings-close');
    if(cls)cls.addEventListener('click',closePanel);

    document.addEventListener('click',function(e){
      if(!isOpen())return;
      var p=panel(),b=document.getElementById('wcag-settings-btn');
      if(p&&!p.contains(e.target)&&(!b||!b.contains(e.target)))closePanel();
    });

    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'){closePanel();return;}
      var tag=(e.target||{}).tagName||'';
      if(tag==='INPUT'||tag==='TEXTAREA')return;
      if(e.key==='?'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        e.preventDefault();togglePanel();
      }
      if((e.key==='<'||e.key==='>')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        e.preventDefault();
        var open=e.key==='>';
        document.querySelectorAll('details[data-wcag-section]').forEach(function(d){d.open=open;});
      }
    });
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
</script>`;

// Settings state persists in localStorage['wcag-settings'].
// Section collapse state persists separately in localStorage['wcag-section-prefs'].
const JS_PREFS = `
<script>
(function(){
  var KEY='wcag-section-prefs',prefs={};
  try{prefs=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){}
  function init(){
    document.querySelectorAll('details[data-wcag-section]').forEach(function(d){
      var k=d.getAttribute('data-wcag-section');
      if(k in prefs)d.open=prefs[k];
      d.addEventListener('toggle',function(){
        prefs[k]=d.open;
        try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}
      });
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
</script>`;

// Section reorder — HTML5 DnD on desktop, ▲▼ arrows on touch devices.
// Order persisted in localStorage['wcag-section-order'] as an array of section keys.
// Reset (↺ button in settings) removes the key and reloads.
// In combined reports all panels share the same order (sections are identical across scans).
const JS_REORDER = `
<script>
(function(){
  var ORDER_KEY='wcag-section-order';
  var isTouch=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
  function containers(){return Array.from(document.querySelectorAll('[data-wcag-sections]'));}
  function sectionsIn(c){return Array.from(c.children).filter(function(el){return el.hasAttribute('data-wcag-section');});}
  function saveOrder(){
    var c=containers()[0];if(!c)return;
    var o=sectionsIn(c).map(function(s){return s.getAttribute('data-wcag-section');});
    try{localStorage.setItem(ORDER_KEY,JSON.stringify(o));}catch(e){}
  }
  function applyOrder(order){
    containers().forEach(function(c){
      var byKey={};
      sectionsIn(c).forEach(function(s){byKey[s.getAttribute('data-wcag-section')]=s;});
      order.forEach(function(k){var el=byKey[k];if(el)c.appendChild(el);});
    });
  }
  function syncOtherPanels(sourceContainer){
    var order=sectionsIn(sourceContainer).map(function(s){return s.getAttribute('data-wcag-section');});
    containers().forEach(function(c){
      if(c===sourceContainer)return;
      var byKey={};
      sectionsIn(c).forEach(function(s){byKey[s.getAttribute('data-wcag-section')]=s;});
      order.forEach(function(k){var el=byKey[k];if(el)c.appendChild(el);});
    });
  }
  function loadOrder(){
    try{var saved=JSON.parse(localStorage.getItem(ORDER_KEY)||'null');
      if(Array.isArray(saved)&&saved.length)applyOrder(saved);}catch(e){}
  }
  function resetOrder(){try{localStorage.removeItem(ORDER_KEY);}catch(e){}location.reload();}

  function initDnd(){
    var dragging=null,mouseOnHandle=false;
    document.addEventListener('mouseup',function(){mouseOnHandle=false;});
    containers().forEach(function(c){
      sectionsIn(c).forEach(function(section){
        section.setAttribute('draggable','true');
        var h=section.querySelector('.wcag-drag-handle');
        if(h){h.style.cursor='grab';h.addEventListener('mousedown',function(){mouseOnHandle=true;});}
        section.addEventListener('dragstart',function(e){
          if(!mouseOnHandle){e.preventDefault();return;}
          dragging=section;
          setTimeout(function(){section.style.opacity='0.4';},0);
          e.dataTransfer.effectAllowed='move';
        });
        section.addEventListener('dragend',function(){
          section.style.opacity='';
          sectionsIn(c).forEach(function(s){s.style.outline='';s.style.outlineOffset='';});
          if(dragging){syncOtherPanels(c);saveOrder();}
          dragging=null;
        });
        section.addEventListener('dragover',function(e){
          e.preventDefault();
          if(!dragging||dragging===section||dragging.parentNode!==c)return;
          e.dataTransfer.dropEffect='move';
          sectionsIn(c).forEach(function(s){s.style.outline='';s.style.outlineOffset='';});
          section.style.outline='2px dashed #2563eb';section.style.outlineOffset='2px';
        });
        section.addEventListener('dragleave',function(e){
          if(!section.contains(e.relatedTarget)){section.style.outline='';section.style.outlineOffset='';}
        });
        section.addEventListener('drop',function(e){
          e.preventDefault();
          sectionsIn(c).forEach(function(s){s.style.outline='';s.style.outlineOffset='';});
          if(!dragging||dragging===section||dragging.parentNode!==c)return;
          var all=sectionsIn(c),fi=all.indexOf(dragging),ti=all.indexOf(section);
          if(fi<ti)c.insertBefore(dragging,section.nextSibling);else c.insertBefore(dragging,section);
        });
      });
    });
  }

  function initArrows(){
    containers().forEach(function(c){
      sectionsIn(c).forEach(function(section){
        var h=section.querySelector('.wcag-drag-handle');if(h)h.style.display='none';
        var sm=section.querySelector('summary');if(!sm)return;
        var wrap=document.createElement('span');
        wrap.style.cssText='display:inline-flex;gap:2px;flex-shrink:0;margin-right:2px';
        function makeBtn(sym,title,dir){
          var b=document.createElement('button');
          b.textContent=sym;b.title=title;
          b.style.cssText='background:rgba(0,0,0,.06);border:1px solid #e2e8f0;border-radius:3px;'+
            'width:20px;height:20px;font-size:10px;cursor:pointer;color:#64748b;'+
            'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0';
          b.addEventListener('click',function(e){
            e.preventDefault();e.stopPropagation();
            var all=sectionsIn(c),idx=all.indexOf(section);
            if(dir===-1&&idx>0)c.insertBefore(section,all[idx-1]);
            else if(dir===1&&idx<all.length-1)c.insertBefore(all[idx+1],section);
            syncOtherPanels(c);saveOrder();
          });
          return b;
        }
        wrap.appendChild(makeBtn('▲','Move section up',-1));
        wrap.appendChild(makeBtn('▼','Move section down',1));
        sm.insertBefore(wrap,sm.firstChild);
      });
    });
  }

  function init(){
    loadOrder();
    if(isTouch)initArrows();else initDnd();
    var rb=document.getElementById('wcag-reset-order');
    if(rb)rb.addEventListener('click',resetOrder);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
</script>`;

// ── rendering helpers ─────────────────────────────────────────────────────────

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function prettifySegment(seg) {
  return seg
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function pageLabel(url, title, pageHeading) {
  if (pageHeading && pageHeading.trim()) {
    const h = pageHeading.trim();
    return h.length > 28 ? h.slice(0, 25) + '…' : h;
  }
  try {
    const parsed = new URL(url);
    const pathSeg = parsed.pathname.split('/').filter(Boolean).pop();
    if (pathSeg) return prettifySegment(pathSeg.replace(/\.[^.]+$/, ''));
    const hashSeg = parsed.hash.replace(/^#\/?/, '').split('/').filter(Boolean).pop();
    if (hashSeg) return prettifySegment(hashSeg.replace(/\.[^.]+$/, ''));
  } catch {}
  if (title && title.trim()) {
    const t = title.trim();
    return t.length > 28 ? t.slice(0, 25) + '…' : t;
  }
  return null;
}

const IMPACT = {
  critical: { bg: '#fef2f2', border: '#fca5a5', chip: '#dc2626' },
  serious:  { bg: '#fff7ed', border: '#fdba74', chip: '#ea580c' },
  moderate: { bg: '#fefce8', border: '#fde047', chip: '#ca8a04' },
  minor:    { bg: '#eff6ff', border: '#93c5fd', chip: '#2563eb' },
};
const SORT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

// ── discipline classification ─────────────────────────────────────────────────
// Maps axe rule IDs → designer-friendly discipline (Visual / Interaction / Form /
// Structure). Helps designers triage: "these three are color issues, those two are form issues."

const DISCIPLINE_COLORS = {
  Visual:      { bg: '#ede9fe', color: '#5b21b6' },
  Interaction: { bg: '#dbeafe', color: '#1e40af' },
  Form:        { bg: '#d1fae5', color: '#065f46' },
  Structure:   { bg: '#ffedd5', color: '#9a3412' },
  Other:       { bg: '#f1f5f9', color: '#475569' },
};

const DISCIPLINE_ORDER = ['Visual', 'Interaction', 'Form', 'Structure', 'Other'];

const DISCIPLINE_MAP = {
  // Visual
  'color-contrast': 'Visual', 'color-contrast-enhanced': 'Visual',
  'image-alt': 'Visual', 'image-redundant-alt': 'Visual',
  'background-img-redundant': 'Visual', 'link-in-text-block': 'Visual',
  'meta-viewport': 'Visual', 'css-orientation-lock': 'Visual',
  // Interaction
  'tabindex': 'Interaction', 'scrollable-region-focusable': 'Interaction',
  'interactive-supports-focus': 'Interaction', 'nested-interactive': 'Interaction',
  'keyboard': 'Interaction', 'accesskeys': 'Interaction',
  'focus-order-semantics': 'Interaction', 'focus-visible': 'Interaction',
  'target-size': 'Interaction', 'pointer-cancelation': 'Interaction',
  'motion-actuation': 'Interaction',
  // Form
  'label': 'Form', 'label-content-name-mismatch': 'Form',
  'select-name': 'Form', 'textarea-name': 'Form',
  'input-button-name': 'Form', 'form-field-multiple-labels': 'Form',
  'autocomplete-valid': 'Form', 'required-children': 'Form',
  'required-parent': 'Form', 'radiogroup': 'Form',
  // Structure
  'bypass': 'Structure', 'skip-link': 'Structure',
  'page-has-heading-one': 'Structure', 'document-title': 'Structure',
  'frame-title': 'Structure', 'frame-tested': 'Structure',
  'html-lang-valid': 'Structure', 'html-has-lang': 'Structure',
  'valid-lang': 'Structure', 'scope-attr-valid': 'Structure',
  'td-headers-attr': 'Structure', 'th-has-data-cells': 'Structure',
  'list': 'Structure', 'listitem': 'Structure',
  'definition-list': 'Structure', 'dlitem': 'Structure',
  'duplicate-id': 'Structure', 'duplicate-id-active': 'Structure', 'duplicate-id-aria': 'Structure',
};

function getDiscipline(v) {
  if (DISCIPLINE_MAP[v.id]) return DISCIPLINE_MAP[v.id];
  if (/^(landmark-|heading-|aria-|role-)/.test(v.id)) return 'Structure';
  if (/^(focus-|keyboard-)/.test(v.id)) return 'Interaction';
  if (/^(input-|select-|textarea-)/.test(v.id)) return 'Form';
  const tags = v.wcag || [];
  if (tags.some(t => /^wcag1[14]/.test(t))) return 'Visual';
  if (tags.some(t => /^wcag2[125]/.test(t))) return 'Interaction';
  if (tags.some(t => /^wcag33/.test(t))) return 'Form';
  if (tags.some(t => /^wcag(1[23]|2[34]|4)/.test(t))) return 'Structure';
  return 'Other';
}

function chip(impact) {
  const c = IMPACT[impact] || { chip: '#6b7280' };
  return `<span style="background:${c.chip};color:#fff;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">${esc(impact)}</span>`;
}

function scTags(tags) {
  return (tags || [])
    .map(t => { const m = t.match(/^wcag(\d)(\d)(\d+)$/); return m ? `SC ${m[1]}.${m[2]}.${m[3]}` : null; })
    .filter(Boolean).join(' · ');
}

function scoreCard(count, label, sub, color) {
  return `<div style="flex:1;min-width:120px;background:#fff;border-radius:10px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border-top:4px solid ${color}">
  <div style="font-size:34px;font-weight:800;color:${count === 0 ? '#22c55e' : color};line-height:1">${count}</div>
  <div style="font-weight:700;color:#0f172a;margin-top:4px;font-size:14px">${label}</div>
  <div style="font-size:11px;color:#94a3b8;margin-top:2px">${sub}</div>
</div>`;
}

function landmarkPill(n, tag) {
  const ok = n > 0;
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:${ok ? '#dcfce7' : '#fee2e2'};color:${ok ? '#166534' : '#991b1b'}">${ok ? '&#10003;' : '&#10007;'} &lt;${tag}&gt;</span>`;
}

function nodeBlock(n) {
  return `<div style="margin-bottom:10px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
  <code style="display:block;font-size:11px;white-space:pre-wrap;word-break:break-all;background:#1e293b;color:#e2e8f0;padding:10px 12px;border-radius:4px;margin-bottom:8px;line-height:1.5">${esc(n.html)}</code>
  <div style="font-size:11px;color:#64748b;margin-bottom:6px">Selector: <code style="font-size:11px;background:#f1f5f9;padding:1px 4px;border-radius:3px">${esc((n.target || []).join(', '))}</code></div>
  <pre style="margin:0;font-size:11px;color:#6b7280;white-space:pre-wrap;font-family:inherit;line-height:1.4">${esc(n.failureSummary)}</pre>
</div>`;
}

function violationCard(v) {
  const c = IMPACT[v.impact] || IMPACT.minor;
  const sc = scTags(v.wcag);
  const disc = getDiscipline(v);
  const dc = DISCIPLINE_COLORS[disc] || DISCIPLINE_COLORS.Other;
  const discPill = `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:${dc.bg};color:${dc.color};text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">${esc(disc)}</span>`;
  return `<details style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;margin-bottom:12px">
  <summary style="padding:14px 18px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    ${chip(v.impact)}
    ${discPill}
    <code style="font-weight:700;font-size:13px;color:#0f172a">${esc(v.id)}</code>
    <span style="color:#334155;flex:1;min-width:180px;font-size:14px">${esc(v.help)}</span>
    ${sc ? `<span style="font-size:11px;color:#64748b;font-weight:600;white-space:nowrap">${sc}</span>` : ''}
    <span style="font-size:12px;color:${c.chip};font-weight:700;white-space:nowrap">${v.nodeCount} element${v.nodeCount !== 1 ? 's' : ''}</span>
  </summary>
  <div style="padding:4px 18px 18px">
    <p style="color:#475569;margin:0 0 10px;font-size:13px">${esc(v.description)}</p>
    <a href="${esc(v.helpUrl)}" target="_blank" rel="noopener"
       style="display:inline-block;margin-bottom:14px;font-size:13px;color:#2563eb;font-weight:600;text-decoration:none">Learn how to fix &#8594;</a>
    ${(v.nodes || []).map(nodeBlock).join('')}
  </div>
</details>`;
}

function labelTable(rows) {
  if (!rows.length) return `<p style="color:#16a34a;font-size:14px;font-weight:600">None found &#10003;</p>`;

  const COLS = [
    { key: 'formcontrolname', label: 'formcontrolname', mono: true },
    { key: 'name',            label: 'name',            mono: false },
    { key: 'id',              label: 'id',              mono: false },
    { key: 'placeholder',     label: 'placeholder',     mono: false, italic: true },
    { key: 'ariaDescribedby', label: 'aria-describedby',mono: false },
    { key: 'classSnippet',    label: 'classes',         mono: true },
  ];
  const activeCols = COLS.filter(c => rows.some(r => r[c.key]));

  if (!activeCols.length) {
    return `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;font-size:13px;color:#78350f">
  <strong>${rows.length} element${rows.length !== 1 ? 's' : ''} found</strong> with no accessible label, but no identifying attributes
  (no <code>name</code>, <code>id</code>, <code>placeholder</code>, or <code>formcontrolname</code>) were captured.
  The <strong>axe violations section above</strong> contains the HTML snippets and CSS selectors for these elements.
</div>`;
  }

  const th = 'padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px';
  const td = 'padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px';
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="${th}">Element</th>
    ${activeCols.map(c => `<th style="${th}">${c.label}</th>`).join('')}
    <th style="${th}">#</th>
  </tr></thead>
  <tbody>${rows.map(r => `<tr>
    <td style="${td};font-family:monospace">${esc(r.tag)}${r.type ? `[type="${esc(r.type)}"]` : ''}</td>
    ${activeCols.map(c => {
      const v = r[c.key];
      const style = `${td};${c.italic ? 'font-style:italic;' : ''}color:${v ? '#0f172a' : '#cbd5e1'}`;
      const display = v ? (c.mono ? `<code style="font-size:11px">${esc(v)}</code>` : esc(v)) : '—';
      return `<td style="${style}">${display}</td>`;
    }).join('')}
    <td style="${td};color:#94a3b8">${r.domIndex != null ? r.domIndex : '—'}</td>
  </tr>`).join('')}</tbody>
</table>`;
}

// ── collapsible section helpers ───────────────────────────────────────────────

function passBadge() {
  return `<span style="font-size:11px;font-weight:600;background:#dcfce7;color:#166534;padding:2px 9px;border-radius:10px;white-space:nowrap">&#10003; Pass</span>`;
}

function issueBadge(n) {
  if (n === 0) return passBadge();
  return `<span style="font-size:11px;font-weight:700;background:#fef2f2;color:#dc2626;padding:2px 9px;border-radius:10px;white-space:nowrap">${n} issue${n !== 1 ? 's' : ''}</span>`;
}

function warnBadge(n) {
  if (n === 0) return passBadge();
  return `<span style="font-size:11px;font-weight:700;background:#fffbeb;color:#d97706;padding:2px 9px;border-radius:10px;white-space:nowrap">${n} warning${n !== 1 ? 's' : ''}</span>`;
}

function violationsBadge(violations, byImpact) {
  if (!violations.length) return passBadge();
  const total = violations.length;
  const crit = byImpact.critical || 0;
  const ser  = byImpact.serious  || 0;
  const color = crit ? '#dc2626' : ser ? '#ea580c' : '#d97706';
  const bg    = crit ? '#fef2f2' : ser ? '#fff7ed' : '#fffbeb';
  return `<span style="font-size:11px;font-weight:700;background:${bg};color:${color};padding:2px 9px;border-radius:10px;white-space:nowrap">${total} violation${total !== 1 ? 's' : ''}${crit ? ` · ${crit} critical` : ''}</span>`;
}

function touchTargetBadge(smallTargets) {
  if (!smallTargets.length) return passBadge();
  const fails = smallTargets.filter(t => t.severity === 'fail').length;
  if (fails > 0) {
    const warns = smallTargets.length - fails;
    return `<span style="font-size:11px;font-weight:700;background:#fef2f2;color:#dc2626;padding:2px 9px;border-radius:10px;white-space:nowrap">${fails} fail${fails !== 1 ? 's' : ''}${warns ? ` · ${warns} warn` : ''}</span>`;
  }
  return warnBadge(smallTargets.length);
}

function typographyBadge(issues) {
  if (!issues.length) return passBadge();
  const fails = issues.filter(t => t.severity === 'fail').length;
  if (fails > 0) {
    const warns = issues.length - fails;
    return `<span style="font-size:11px;font-weight:700;background:#fef2f2;color:#dc2626;padding:2px 9px;border-radius:10px;white-space:nowrap">${fails} fail${fails !== 1 ? 's' : ''}${warns ? ` · ${warns} warn` : ''}</span>`;
  }
  return warnBadge(issues.length);
}

function sectionDivider(label) {
  return `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:16px 2px 8px">${esc(label)}</div>`;
}

// passing=true adds data-wcag-pass attribute; the settings panel's "hide passing"
// toggle uses [data-wcag-pass] to visually remove the element from the layout.
// screenshot and inventory are neutral (neither pass nor fail) — omit passing.
function sectionWrap(key, title, scRef, badge, isOpen, content, passing) {
  return `<details data-wcag-section="${esc(key)}"${passing ? ' data-wcag-pass' : ''}${isOpen ? ' open' : ''} style="background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:14px;overflow:hidden">
  <summary style="padding:14px 20px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;user-select:none">
    <span class="wcag-drag-handle" aria-hidden="true" title="Drag to reorder" style="color:#cbd5e1;font-size:18px;flex-shrink:0;user-select:none;line-height:1">⠿</span>
    <span style="font-weight:700;font-size:15px;color:#0f172a;flex:1">${esc(title)}</span>
    ${scRef ? `<span style="font-size:11px;color:#94a3b8;font-weight:500;white-space:nowrap">${esc(scRef)}</span>` : ''}
    ${badge}
  </summary>
  <div style="padding:0 20px 20px">
    ${content}
  </div>
</details>`;
}

// ── single-scan body (no html/head/body wrapper) ──────────────────────────────

function generateScanBody(audit, date, screenshotRelPath) {
  const { summary: s = {}, violations = [], missingAlt = [], missingLabel = [], negativeFocus = [], positiveFocus = [], smallTargets = [], headingIssues = [], typographyIssues = [], reducedMotion = {}, ariaIssues = [] } = audit;
  const byImpact = s.byImpact || {};
  const lm = s.landmarks || {};
  const ec = s.elementCounts || {};
  const sortedViolations = [...violations].sort((a, b) => (SORT_ORDER[a.impact] ?? 9) - (SORT_ORDER[b.impact] ?? 9));
  const missingLandmarks = ['nav', 'header', 'footer'].filter(l => !(lm[l] > 0));
  const scanNum = s.scanLabel ? parseInt(s.scanLabel.replace(/^scan-/, ''), 10) : null;
  const inventoryTotal = Object.values(ec).reduce((a, b) => a + b, 0);

  return `
  <!-- Header -->
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px">
    <div style="width:6px;height:48px;border-radius:3px;background:linear-gradient(to bottom,#dc2626,#2563eb);flex-shrink:0"></div>
    <div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
        <h1 style="font-size:22px;font-weight:800;color:#0f172a">WCAG 2.1 AA Accessibility Report</h1>
        ${s.mode === 'interactive'
          ? `<span title="Audited after manual interaction" style="background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">&#9654; Interactive</span>`
          : `<span title="Audited automatically from URL" style="background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap">&#9654; Automated</span>`}
        ${scanNum !== null
          ? `<span title="Scan number in this session" style="background:#475569;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.4px;white-space:nowrap">Scan ${scanNum}</span>`
          : ''}
      </div>
      <div style="font-size:13px;color:#64748b">
        <a href="${esc(s.url || '')}" style="color:#2563eb">${esc(s.url || '')}</a>
        &nbsp;·&nbsp; Audited ${esc(date)}
        &nbsp;·&nbsp; Page title: <em>${esc(s.title || '')}</em>
      </div>
    </div>
  </div>

  <!-- Score cards — axe severity row + heuristics row -->
  <div style="margin-bottom:28px">
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      ${scoreCard(byImpact.critical || 0, 'Critical',  'axe WCAG Failure',  '#dc2626')}
      ${scoreCard(byImpact.serious  || 0, 'Serious',   'axe WCAG Failure',  '#ea580c')}
      ${scoreCard(byImpact.moderate || 0, 'Moderate',  'axe WCAG Warning',  '#ca8a04')}
      ${scoreCard(byImpact.minor    || 0, 'Minor',     'axe WCAG Advisory', '#2563eb')}
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${scoreCard(s.missingLabelCount    || 0, 'Missing Labels',  'SC 1.3.1 / 4.1.2', '#7c3aed')}
      ${scoreCard(s.missingAltCount     || 0, 'Missing Alt',     'SC 1.1.1',          '#0891b2')}
      ${scoreCard(s.smallTargetCount    || 0, 'Small Targets',   'SC 2.5.8 / 44px',   '#f59e0b')}
      ${scoreCard(s.headingIssueCount   || 0, 'Heading Issues',  'SC 1.3.1 / 2.4.6',  '#8b5cf6')}
      ${scoreCard(s.typographyIssueCount|| 0, 'Typography',      'SC 1.4.4 / size+wt', '#db2777')}
      ${scoreCard(s.reducedMotionWarning|| 0, 'Motion Guard',    'SC 2.3.3 / best practice', '#0ea5e9')}
      ${scoreCard(s.ariaIssueCount      || 0, 'ARIA Misuse',     'SC 4.1.2 / 1.3.1',         '#f43f5e')}
    </div>
  </div>

  <div data-wcag-sections>
  ${screenshotRelPath ? sectionWrap(
    'screenshot', 'Page Screenshot', null,
    `<span style="font-size:11px;font-weight:400;font-family:monospace;color:#94a3b8;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block">${esc(screenshotRelPath)}</span>`,
    true,
    `<div style="text-align:center;padding-top:8px">
      <img src="${esc(screenshotRelPath)}" alt="Page state at audit time"
           style="max-width:520px;width:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12);display:inline-block">
    </div>`
  ) : ''}

  ${sectionWrap(
    'axe-violations',
    `${sortedViolations.length} Axe Violation${sortedViolations.length !== 1 ? 's' : ''}`,
    null,
    violationsBadge(sortedViolations, byImpact),
    sortedViolations.length > 0,
    sortedViolations.length
      ? (() => {
          const grouped = {};
          sortedViolations.forEach(v => { const d = getDiscipline(v); (grouped[d] = grouped[d] || []).push(v); });
          return `<p style="font-size:13px;color:#64748b;margin:8px 0 16px">Click a row to expand details and see affected elements. Violations are grouped by design discipline.</p>
            ${DISCIPLINE_ORDER.filter(d => grouped[d]).map(d => {
              const vs = grouped[d].sort((a, b) => (SORT_ORDER[a.impact] ?? 9) - (SORT_ORDER[b.impact] ?? 9));
              const dc = DISCIPLINE_COLORS[d];
              return `<details open style="margin-bottom:16px">
                <summary style="padding:7px 4px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;user-select:none;border-bottom:1px solid #f1f5f9;margin-bottom:10px">
                  <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:4px;background:${dc.bg};color:${dc.color};text-transform:uppercase;letter-spacing:.5px">${esc(d)}</span>
                  <span style="font-size:12px;color:#94a3b8;font-weight:500">${vs.length} violation${vs.length !== 1 ? 's' : ''}</span>
                </summary>
                ${vs.map(v => violationCard(v)).join('\n')}
              </details>`;
            }).join('\n')}`;
        })()
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">No axe violations found &#10003;</p>`,
    sortedViolations.length === 0
  )}

  ${sectionWrap(
    'missing-labels', 'Inputs Missing Accessible Label', 'SC 1.3.1 / 4.1.2',
    issueBadge(missingLabel.length),
    missingLabel.length > 0,
    `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">
      Each input needs a visible <code>&lt;label for&gt;</code>, <code>aria-label</code>, or <code>aria-labelledby</code>.
      A <code>placeholder</code> alone does not count as a label.
    </p>
    ${labelTable(missingLabel)}`,
    missingLabel.length === 0
  )}

  ${sectionWrap(
    'missing-alt', 'Images Missing Alt Text', 'SC 1.1.1',
    issueBadge(missingAlt.length),
    missingAlt.length > 0,
    missingAlt.length
      ? `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">Meaningful images need descriptive <code>alt</code> text. Decorative images need <code>alt=""</code>.</p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">src</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">classes</th>
           </tr></thead>
           <tbody>${missingAlt.map(img => `<tr>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;word-break:break-all">${esc(img.src || '—')}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${esc(img.classes || '—')}</td>
           </tr>`).join('')}</tbody>
         </table>`
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">No images missing alt text &#10003;</p>`,
    missingAlt.length === 0
  )}

  ${sectionWrap(
    'touch-targets', 'Small Touch Targets', 'SC 2.5.8',
    touchTargetBadge(smallTargets),
    smallTargets.length > 0,
    smallTargets.length
      ? `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">
           Interactive elements must be at least 24×24 px (WCAG 2.2 failure) and ideally 44×44 px (iOS HIG / Material Design recommendation).
         </p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Element</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Text / Label</th>
             <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">W</th>
             <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">H</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Severity</th>
           </tr></thead>
           <tbody>${smallTargets.map(el => {
             const sevColor = el.severity === 'fail' ? '#dc2626' : '#d97706';
             const sevBg    = el.severity === 'fail' ? '#fef2f2' : '#fffbeb';
             const sevLabel = el.severity === 'fail' ? 'Fail &lt;24px' : 'Warn &lt;44px';
             return `<tr>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px">${esc(el.tag)}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(el.text || '—')}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:center;font-weight:600;color:${el.w < 24 ? '#dc2626' : el.w < 44 ? '#d97706' : '#22c55e'}">${el.w}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:center;font-weight:600;color:${el.h < 24 ? '#dc2626' : el.h < 44 ? '#d97706' : '#22c55e'}">${el.h}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${sevBg};color:${sevColor}">${sevLabel}</span></td>
           </tr>`;
           }).join('')}</tbody>
         </table>`
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">All interactive elements meet the 44×44 px target size &#10003;</p>`,
    smallTargets.length === 0
  )}

  ${sectionWrap(
    'keyboard', 'Focusable Elements Removed from Tab Order', 'SC 2.1.1',
    issueBadge(negativeFocus.length),
    negativeFocus.length > 0,
    negativeFocus.length
      ? `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">
           These interactive elements have <code>tabindex="-1"</code>. Confirm each is intentionally unreachable via keyboard.
         </p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Element</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Text</th>
           </tr></thead>
           <tbody>${negativeFocus.map(el => `<tr>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px">${esc(el.tag)}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${esc(el.text || '—')}</td>
           </tr>`).join('')}</tbody>
         </table>`
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">No interactive elements found with <code>tabindex="-1"</code> &#10003;</p>`,
    negativeFocus.length === 0
  )}

  ${sectionWrap(
    'positive-tabindex', 'Elements With Positive tabindex', 'SC 1.3.2 / 2.4.3',
    issueBadge(positiveFocus.length),
    positiveFocus.length > 0,
    positiveFocus.length
      ? `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">
           Positive <code>tabindex</code> values override the natural DOM tab order and almost always indicate a focus-management bug.
           Remove the positive values and re-order elements in the DOM instead.
         </p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Element</th>
             <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase">tabindex</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase">Text / Label</th>
           </tr></thead>
           <tbody>${positiveFocus.map(el => `<tr>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px">${esc(el.tag)}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:center;font-weight:700;color:#dc2626">${esc(el.tabindex)}</td>
             <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${esc(el.text || '—')}</td>
           </tr>`).join('')}</tbody>
         </table>`
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">No elements with positive <code>tabindex</code> found &#10003;</p>`,
    positiveFocus.length === 0
  )}

  ${sectionWrap(
    'typography', 'Typography Issues', 'SC 1.4.4',
    typographyBadge(typographyIssues),
    typographyIssues.length > 0,
    typographyIssues.length
      ? `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">
           Text below 12 px is a hard failure. Text below 16 px with font-weight ≤ 300 is a warning — a common Ionic anti-pattern where thin weights disappear on low-contrast screens.
         </p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Element</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Text / Label</th>
             <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Size (px)</th>
             <th style="padding:8px 10px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Weight</th>
             <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Severity</th>
           </tr></thead>
           <tbody>${typographyIssues.map(el => {
             const isFail = el.severity === 'fail';
             const sevColor = isFail ? '#dc2626' : '#d97706';
             const sevBg    = isFail ? '#fef2f2' : '#fffbeb';
             const sevLabel = isFail ? 'Fail &lt;12px' : 'Warn thin+small';
             return `<tr>
               <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px">${esc(el.tag)}</td>
               <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(el.text)}</td>
               <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:center;font-weight:700;color:${isFail ? '#dc2626' : '#d97706'}">${el.fontSize}</td>
               <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:center;color:${el.fontWeight <= 300 ? '#d97706' : '#64748b'}">${el.fontWeight}</td>
               <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:${sevBg};color:${sevColor}">${sevLabel}</span></td>
             </tr>`;
           }).join('')}</tbody>
         </table>`
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">No typography issues found &#10003;</p>`,
    typographyIssues.length === 0
  )}

  ${sectionWrap(
    'reduced-motion', 'Reduced Motion Support', 'SC 2.3.3 / best practice',
    reducedMotion.status === 'warn' ? warnBadge(1) : passBadge(),
    false,
    (() => {
      const { hasAnimation, hasReducedMotionQuery, keyframeCount, status } = reducedMotion;
      if (!hasAnimation) {
        return `<p style="color:#16a34a;font-size:14px;font-weight:600;padding:8px 0">No CSS animations or transitions detected &#10003;</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">No <code>@media (prefers-reduced-motion)</code> guard needed.</p>`;
      }
      if (status === 'pass') {
        return `<p style="color:#16a34a;font-size:14px;font-weight:600;padding:8px 0">CSS motion detected — <code>@media (prefers-reduced-motion)</code> guard present &#10003;</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">
            Found ${esc(String(keyframeCount))} <code>@keyframes</code> rule${keyframeCount !== 1 ? 's' : ''} and animation/transition properties.
            The <code>@media (prefers-reduced-motion: reduce)</code> block provides an override for users who need it.
          </p>`;
      }
      return `<p style="font-size:14px;font-weight:600;padding:8px 0;color:#b45309">
          CSS animations or transitions detected but no <code>@media (prefers-reduced-motion)</code> guard found.
        </p>
        <p style="font-size:13px;color:#64748b;margin:8px 0 14px">
          Users who have requested reduced motion in their OS settings will still see all animations.
          Wrap non-essential animations in a <code>@media (prefers-reduced-motion: reduce)</code> block and set them to <code>animation: none</code> or <code>transition: none</code>.
        </p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;font-size:13px;color:#78350f">
          <strong>Detected:</strong>
          ${keyframeCount ? `${esc(String(keyframeCount))} @keyframes rule${keyframeCount !== 1 ? 's' : ''}` : ''}
          ${hasAnimation && !keyframeCount ? 'CSS <code>animation</code> or <code>transition</code> properties' : ''}
          <br>
          <strong>Missing:</strong> <code>@media (prefers-reduced-motion: reduce) { … }</code>
        </div>`;
    })(),
    reducedMotion.status !== 'warn'
  )}

  ${(() => {
    const errors    = ariaIssues.filter(i => i.type === 'aria-hidden-focusable');
    const warnings  = ariaIssues.filter(i => i.type === 'conflicting-role');
    const advisory  = ariaIssues.filter(i => i.type === 'redundant-label');
    const issueCount = errors.length + warnings.length;

    function ariaTable(rows) {
      const th = 'padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px';
      const td = 'padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px';
      return `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
          <th style="${th}">Element</th>
          <th style="${th}">Role</th>
          <th style="${th}">Text / Label</th>
          <th style="${th}">Issue</th>
        </tr></thead>
        <tbody>${rows.map(r => {
          const sevColor = r.severity === 'error' ? '#dc2626' : r.severity === 'warning' ? '#d97706' : '#2563eb';
          const sevBg    = r.severity === 'error' ? '#fef2f2' : r.severity === 'warning' ? '#fffbeb' : '#eff6ff';
          return `<tr>
            <td style="${td};font-family:monospace">&lt;${esc(r.tag)}&gt;</td>
            <td style="${td};color:#64748b;font-family:monospace;font-size:11px">${r.role ? esc(r.role) : '—'}</td>
            <td style="${td};color:#64748b;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.visibleText || r.label || '—')}</td>
            <td style="${td}"><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${sevBg};color:${sevColor}">${esc(r.severity)}</span> ${esc(r.message)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    }

    const content = issueCount === 0 && advisory.length === 0
      ? `<p style="color:#16a34a;font-size:14px;font-weight:600;padding:8px 0">No ARIA misuse detected &#10003;</p>`
      : `<p style="font-size:13px;color:#64748b;margin:8px 0 16px">
          Heuristic checks complementing axe's ARIA rules. Errors and warnings indicate real problems;
          advisories are informational only.
        </p>
        ${errors.length ? `<div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#dc2626;margin-bottom:8px">
            aria-hidden with focusable children (${errors.length})
          </div>
          ${ariaTable(errors)}
        </div>` : ''}
        ${warnings.length ? `<div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#d97706;margin-bottom:8px">
            Conflicting role (${warnings.length})
          </div>
          ${ariaTable(warnings)}
        </div>` : ''}
        ${advisory.length ? `<details style="margin-top:8px">
          <summary style="font-size:12px;color:#64748b;cursor:pointer;list-style:none;padding:4px 0">
            Advisory — redundant aria-label (${advisory.length}) &#9656;
          </summary>
          <div style="margin-top:8px">${ariaTable(advisory)}</div>
        </details>` : ''}`;

    return sectionWrap(
      'aria-misuse', 'ARIA Misuse', 'SC 4.1.2 / 1.3.1',
      issueCount > 0 ? issueBadge(issueCount) : (advisory.length > 0 ? warnBadge(advisory.length) : passBadge()),
      issueCount > 0,
      content,
      issueCount === 0 && advisory.length === 0
    );
  })()}

  ${sectionWrap(
    'structure', 'Document Structure', 'SC 1.3.1 / 2.4.6',
    issueBadge(headingIssues.length),
    headingIssues.length > 0,
    headingIssues.length
      ? `<p style="font-size:13px;color:#64748b;margin:8px 0 14px">
           Headings must start with a single <code>&lt;h1&gt;</code> and not skip levels. Level skips break the document outline for screen reader users.
         </p>
         <ol style="padding-left:20px;margin:0">${headingIssues.map(issue => {
           const icon = issue.type === 'level-skip' ? '&#8618;' : '&#9888;';
           return `<li style="font-size:13px;color:#92400e;padding:6px 0;border-bottom:1px solid #fef3c7">
             <span style="margin-right:6px">${icon}</span>
             <strong>${esc(issue.message)}</strong>${issue.text ? ` &mdash; <em style="color:#64748b">${esc(issue.text)}</em>` : ''}
           </li>`;
         }).join('')}</ol>`
      : `<p style="color:#166334;font-size:14px;font-weight:600;padding:8px 0">Heading hierarchy is correct &#10003;</p>`,
    headingIssues.length === 0
  )}

  ${sectionWrap(
    'landmarks', 'Landmark Coverage', 'SC 1.3.6 / 2.4.1',
    missingLandmarks.length ? issueBadge(missingLandmarks.length) : passBadge(),
    missingLandmarks.length > 0,
    `<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;margin-bottom:${missingLandmarks.length ? '12' : '0'}px">
      ${landmarkPill(lm.main,   'main')}
      ${landmarkPill(lm.nav,    'nav')}
      ${landmarkPill(lm.header, 'header')}
      ${landmarkPill(lm.footer, 'footer')}
    </div>
    ${missingLandmarks.length ? `<p style="font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:8px 12px;border-radius:6px;margin-top:12px">
      Missing <strong>${missingLandmarks.map(l => `&lt;${l}&gt;`).join(', ')}</strong> — screen reader users cannot jump directly to these regions.
    </p>` : ''}`,
    missingLandmarks.length === 0
  )}

  ${sectionWrap(
    'inventory', 'Element Inventory', null,
    `<span style="font-size:11px;font-weight:500;color:#94a3b8;white-space:nowrap">${inventoryTotal} total</span>`,
    false,
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;padding-top:8px">
      ${Object.entries(ec).map(([k, v]) => `<div style="text-align:center;padding:14px 8px;background:#f8fafc;border-radius:8px">
        <div style="font-size:26px;font-weight:800;color:${v > 0 ? '#0f172a' : '#cbd5e1'}">${v}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.3px;margin-top:3px">${esc(k)}</div>
      </div>`).join('')}
    </div>`
  )}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0 4px;font-size:11px;color:#94a3b8">
    Generated by Cypress axe-core audit &nbsp;·&nbsp; ${esc(date)} &nbsp;·&nbsp;
    <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener" style="color:#94a3b8">WCAG 2.1 Quick Reference</a>
    &nbsp;·&nbsp;
    <a href="https://dequeuniversity.com/rules/axe/4.11/" target="_blank" rel="noopener" style="color:#94a3b8">axe Rule Library</a>
  </div>`;
}

// ── standalone single-scan report ────────────────────────────────────────────

function generateWcagHtml(audit, date, screenshotRelPath) {
  const { summary: s = {} } = audit;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WCAG Report — ${esc(s.title || s.url || 'Accessibility Audit')}</title>
  <style>${CSS_BASE}</style>
</head>
<body>
<div class="wrap">
${generateScanBody(audit, date, screenshotRelPath)}
</div>
${HTML_SETTINGS_BTN_FIXED}
${HTML_SETTINGS_PANEL}
${JS_PREFS}
${JS_SETTINGS}
${JS_REORDER}
</body>
</html>`;
}

// ── multi-scan tabbed combined report ─────────────────────────────────────────
// scans: Array<{ audit, date, screenshotRelPath }>
// Regenerated after every scan so an early Cypress exit still leaves a valid file.

function generateCombinedWcagHtml(scans) {
  function tabBtn(scan, i) {
    const s = scan.audit.summary || {};
    const n = s.scanLabel ? parseInt(s.scanLabel.replace(/^scan-/, ''), 10) : i + 1;
    const label = pageLabel(s.url, s.title, s.pageHeading) || `Scan ${n}`;
    const total = s.axeViolations || 0;
    const crit  = (s.byImpact || {}).critical || 0;
    const badge = total === 0
      ? `<span style="font-size:11px;font-weight:600;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:10px">&#10003; clean</span>`
      : `<span style="font-size:11px;font-weight:600;background:${crit ? '#fef2f2' : '#fff7ed'};color:${crit ? '#dc2626' : '#ea580c'};padding:2px 7px;border-radius:10px">${total}${crit ? ` · ${crit} crit` : ''}</span>`;
    return `<button class="tab-btn${i === 0 ? ' active' : ''}" onclick="showTab(${i})" title="Scan ${n} — ${esc(s.url || '')}">${esc(label)} ${badge}</button>`;
  }

  const first = (scans[0] && scans[0].audit.summary) || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>WCAG Report — ${esc(first.title || first.url || 'Accessibility Audit')} (${scans.length} scan${scans.length !== 1 ? 's' : ''})</title>
  <style>${CSS_BASE}${CSS_TABS}</style>
</head>
<body>

<div class="tab-bar">
  ${scans.map(tabBtn).join('\n  ')}
  ${HTML_SETTINGS_BTN_TABBAR}
</div>

${scans.map((scan, i) => `<div class="panel wrap" id="panel-${i}"${i > 0 ? ' hidden' : ''}>
${generateScanBody(scan.audit, scan.date, scan.screenshotRelPath)}
</div>`).join('\n')}

<script>
  function showTab(n) {
    document.querySelectorAll('.panel').forEach(function(el, i) { el.hidden = i !== n; });
    document.querySelectorAll('.tab-btn').forEach(function(el, i) { el.classList.toggle('active', i === n); });
    window.scrollTo(0, 0);
  }
</script>
${HTML_SETTINGS_PANEL}
${JS_PREFS}
${JS_SETTINGS}
${JS_REORDER}

</body>
</html>`;
}

module.exports = { generateWcagHtml, generateCombinedWcagHtml };
