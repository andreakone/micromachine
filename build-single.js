// Genera APRI-QUESTO.html: copia autosufficiente di index.html con css e js
// incollati dentro (serve per aprire il gioco con doppio clic / content://,
// dove i file vicini non sono raggiungibili). Eseguire dopo ogni modifica
// a js/ o css/:  node build-single.js
var fs = require('fs');
var path = require('path');
var root = __dirname;

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

html = html.replace(/<link rel="stylesheet"[\s\S]*?>/, '<style>\n' + css + '\n</style>');

['util', 'audio', 'input', 'tracks', 'render', 'physics', 'ai', 'game', 'main']
  .forEach(function (n) {
    var re = new RegExp('<script src="js/' + n + '\\.js"[^>]*></script>');
    if (!re.test(html)) {
      console.error('ERRORE: tag <script src="js/' + n + '.js"> non trovato in index.html');
      process.exit(1);
    }
    var code = fs.readFileSync(path.join(root, 'js', n + '.js'), 'utf8');
    if (/<\/script/i.test(code)) {
      console.error('ERRORE: js/' + n + '.js contiene </script>');
      process.exit(1);
    }
    html = html.replace(re, '<script>\n/* ==== js/' + n + '.js ==== */\n' + code + '\n</script>');
  });

if (/<script src=|rel="stylesheet"/.test(html)) {
  console.error('ERRORE: risorse esterne rimaste in/APRI-QUESTO.html');
  process.exit(1);
}

var out = path.join(root, 'APRI-QUESTO.html');
fs.writeFileSync(out, html);
console.log('APRI-QUESTO.html generato: ' + html.length + ' byte');
