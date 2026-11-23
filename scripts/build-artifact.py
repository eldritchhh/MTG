"""Crea una versione in un solo file HTML (demo, modalità locale) da pubblicare come pagina su claude.ai.
Uso: VITE_DEMO=1 npx vite build --outDir dist-artifact && python3 scripts/build-artifact.py dist-artifact out.html"""
import re, sys, pathlib

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
html = (src / 'index.html').read_text()
css = ''.join((src / m).read_text() for m in re.findall(r'<link rel="stylesheet"[^>]*href="\./([^"]+\.css)"', html))
js = ''.join((src / m).read_text() for m in re.findall(r'<script type="module"[^>]*src="\./([^"]+\.js)"', html))
js = js.replace('</script', '<\\/script')
page = f'''<title>MTG tra amici</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap">
<style>
:root {{ color-scheme: dark; }}
html, body {{ height: 100%; }}
{css}
</style>
<div id="root"></div>
<script type="module">
{js}
</script>
'''
out.write_text(page)
print(out, len(page) // 1024, 'KB')
