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
        'regions': [
            {'marker': 'unmasking', 'field': 'body', 'intro': True},
            {'marker': 'um-lede', 'field': 'lede', 'p_attrs': ' class="lede"'},
            {'marker': 'um-pull', 'field': 'pull', 'p_attrs': ' class="pull"'},
            {'marker': 'um-landfill', 'field': 'landfill',
             'p_attrs': ' style="margin:0"'},
            {'marker': 'um-doing', 'field': 'doing'},
            {'marker': 'um-flow', 'field': 'flow',
             'wrap': {'tag': 'ol', 'class': 'flow', 'bold_first': True}},
            {'marker': 'um-why', 'field': 'why'},
            {'marker': 'um-education', 'field': 'education',
             'wrap': {'tag': 'ul', 'class': 'steps'}},
            {'marker': 'um-whocan', 'field': 'whocan',
             'wrap': {'tag': 'ul', 'class': 'steps'}},
            {'marker': 'um-whocan-note', 'field': 'whocan_note',
             'p_attrs': ' class="note"'},
            {'marker': 'um-donate', 'field': 'donate'},
            {'marker': 'um-sponsor', 'field': 'sponsor'},
            {'marker': 'um-questions', 'field': 'questions'},
        ],
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
    """Return (metadata dict, body string).

    Understands the YAML the CMS writes: plain scalars, quoted scalars, and
    block scalars (| |- > >-) for fields that run to several lines.
    """
    meta, body = {}, text
    if not text.startswith('---'):
        return meta, body
    end = text.find('\n---', 3)
    if end == -1:
        return meta, body
    raw = text[3:end]
    body = text[end + 4:].lstrip('\n')

    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        if not line.strip() or line.lstrip().startswith('#') or ':' not in line:
            continue
        key, value = line.split(':', 1)
        key, value = key.strip(), value.strip()
        if value[:1] in ('|', '>'):
            fold = value[0] == '>'
            block = []
            while i < len(lines) and (not lines[i].strip() or lines[i][:1] in (' ', '\t')):
                block.append(lines[i])
                i += 1
            while block and not block[-1].strip():
                block.pop()
            indents = [len(b) - len(b.lstrip()) for b in block if b.strip()]
            pad = min(indents) if indents else 0
            text_block = '\n'.join(b[pad:] if len(b) >= pad else b for b in block)
            if fold:
                paras = text_block.split('\n\n')
                text_block = '\n\n'.join(' '.join(x.split()) for x in paras)
            meta[key] = text_block
        else:
            if len(value) > 1 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
                value = value.replace('\\n', '\n').replace('\\"', '"')
            meta[key] = value
    return meta, body


def md_to_html(md, p_attrs='', wrap=None):
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
            tag = (wrap or {}).get('tag', 'ul')
            cls = (wrap or {}).get('class')
            bold_first = (wrap or {}).get('bold_first')
            opener = f'<{tag} class="{cls}">' if cls else f'<{tag}>'
            items = []
            for x in list_items:
                if bold_first:
                    m = re.match(r'\*\*([^*]+)\*\*\s?(.*)$', x, re.S)
                    if m:
                        items.append(f'<li><b>{inline(m.group(1))}</b>{inline(m.group(2))}</li>')
                        continue
                items.append(f'<li>{inline(x)}</li>')
            out.append(opener + ''.join(items) + f'</{tag}>')
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
        rendered = md_to_html(text, region.get('p_attrs', ''), region.get('wrap'))
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
