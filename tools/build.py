#!/usr/bin/env python3
"""
Render CMS content into the live HTML pages.

Each managed page carries a marked region:

    <!-- cms:start NAME -->  ...anything...  <!-- cms:end NAME -->

This script reads content/NAME.md, converts the body to HTML, and
replaces whatever sits between those markers. Everything outside the
markers is left exactly as it was, so page design, scripts, forms and
navigation are never touched.

Run with --check to verify without writing.
"""
import re
import sys
import pathlib
import html as html_mod

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'content'

# Which markdown file drives which page, and which marked regions it fills.
#
# Each region names a marker (<!-- cms:start NAME --> ... <!-- cms:end NAME -->),
# the field in the markdown file that fills it, and optional attributes to put
# on every paragraph so the page keeps its existing styling.
PAGES = {
    'unmasking': {
        'path': ROOT / 'unmasking' / 'index.html',
        'set_h1': True,
        'regions': [{'marker': 'unmasking', 'field': 'body', 'intro': True}],
    },
    'survey': {
        'path': ROOT / 'survey' / 'index.html',
        'set_h1': True,
        'regions': [{'marker': 'survey', 'field': 'body', 'intro': True}],
    },
    'signin': {
        'path': ROOT / 'signin' / 'index.html',
        'set_h1': True,
        'regions': [{'marker': 'signin', 'field': 'body', 'intro': True}],
    },
    'studio': {
        'path': ROOT / 'studio.html',
        'regions': [{'marker': 'studio-intro', 'field': 'body'}],
    },
    'psa': {
        'path': ROOT / 'selfadvocacy' / 'index.html',
        'regions': [
            {'marker': 'psa-lede', 'field': 'lede', 'p_attrs': ' class="sa-lede"'},
            {'marker': 'psa-about', 'field': 'body'},
        ],
    },
    'perfectly-imperfect': {
        'path': ROOT / 'perfectly-imperfect' / 'index.html',
        'regions': [
            {'marker': 'pi-lede', 'field': 'lede', 'p_attrs': ' class="lede"'},
            {'marker': 'pi-pull', 'field': 'pull', 'p_attrs': ' class="pull"'},
            {'marker': 'pi-body', 'field': 'body'},
        ],
    },
    'transition': {
        'path': ROOT / 'transition' / 'index.html',
        'regions': [
            {'marker': 'transition-lede', 'field': 'lede', 'p_attrs': ' class="lede"'},
            {'marker': 'transition-pull', 'field': 'pull', 'p_attrs': ' class="pull"'},
            {'marker': 'transition-body', 'field': 'body'},
        ],
    },
    'events': {
        'path': ROOT / 'events' / 'index.html',
        'regions': [{'marker': 'events-intro', 'field': 'body',
                     'p_attrs': ' class="section-lead"'}],
    },
}


def split_front_matter(text):
    """Return (metadata dict, body string)."""
    meta, body = {}, text
    if text.startswith('---'):
        end = text.find('\n---', 3)
        if end != -1:
            raw = text[3:end]
            body = text[end + 4:].lstrip('\n')
            for line in raw.splitlines():
                if ':' in line:
                    k, v = line.split(':', 1)
                    meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, body


def md_to_html(md, p_attrs=''):
    """Small, predictable Markdown subset. No surprises in output."""
    out, lines = [], md.replace('\r\n', '\n').split('\n')
    i, n = 0, len(lines)
    para, list_items, in_list = [], [], False

    def flush_para():
        if para:
            out.append(f'<p{p_attrs}>' + inline(' '.join(para).strip()) + '</p>')
            para.clear()

    def flush_list():
        nonlocal in_list
        if list_items:
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in list_items) + '</ul>')
            list_items.clear()
        in_list = False

    def inline(t):
        t = html_mod.escape(t, quote=False)
        t = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)\)',
                   lambda m: f'<img src="{html_mod.escape(m.group(2),True)}" alt="{html_mod.escape(m.group(1),True)}">', t)
        t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)',
                   lambda m: f'<a href="{html_mod.escape(m.group(2),True)}">{m.group(1)}</a>', t)
        t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
        t = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', t)
        return t

    while i < n:
        line = lines[i].rstrip()
        if not line.strip():
            flush_para(); flush_list()
        elif re.match(r'^#{1,6}\s', line):
            flush_para(); flush_list()
            lvl = len(line) - len(line.lstrip('#'))
            out.append(f'<h{lvl}>{inline(line.lstrip("#").strip())}</h{lvl}>')
        elif re.match(r'^[-*]\s+', line):
            flush_para()
            in_list = True
            list_items.append(re.sub(r'^[-*]\s+', '', line))
        else:
            if in_list:
                flush_list()
            para.append(line.strip())
        i += 1
    flush_para(); flush_list()
    return '\n'.join(out)


def render(name, conf, check=False):
    path = conf['path']
    md_file = CONTENT / f'{name}.md'
    if not md_file.exists():
        return f'skip {name}: no content/{name}.md'
    if not path.exists():
        return f'SKIP {name}: {path} missing'

    meta, body = split_front_matter(md_file.read_text(encoding='utf-8'))
    page = original = path.read_text(encoding='utf-8', errors='surrogateescape')

    for region in conf['regions']:
        marker = region['marker']
        field = region.get('field', 'body')
        text = body if field == 'body' else (meta.get(field) or '')
        rendered = md_to_html(text, region.get('p_attrs', ''))
        if region.get('intro') and meta.get('intro'):
            rendered = (f'<p class="lead">{html_mod.escape(meta["intro"])}</p>\n'
                        + rendered)

        pattern = re.compile(
            rf'(<!--\s*cms:start\s+{re.escape(marker)}\s*-->)(.*?)'
            rf'(<!--\s*cms:end\s+{re.escape(marker)}\s*-->)', re.S)
        if not pattern.search(page):
            return (f'SKIP {name}: no cms:start/{marker} markers in '
                    f'{path.relative_to(ROOT)}')
        page = pattern.sub(lambda m: m.group(1) + '\n' + rendered + '\n' + m.group(3),
                           page)

    if conf.get('set_h1') and meta.get('title'):
        page = re.sub(r'(<h1\b[^>]*>)(.*?)(</h1>)',
                      lambda m: m.group(1) + html_mod.escape(meta['title']) + m.group(3),
                      page, count=1, flags=re.S)

    if page == original:
        return f'ok   {name}: already current'
    if check:
        return f'DIFF {name}: would update {path.relative_to(ROOT)}'
    path.write_text(page, encoding='utf-8', errors='surrogateescape')
    return f'ok   {name}: updated {path.relative_to(ROOT)}'


if __name__ == '__main__':
    check = '--check' in sys.argv
    results = [render(n, c, check) for n, c in PAGES.items()]
    for r in results:
        print(r)
    if any(r.startswith('SKIP') for r in results):
        sys.exit(1)
