JSMIN = uglifyjs
CSSMIN = cat
DATE = $$(date "+%Y-%m-%d")

update:
	@git clone http://github.com/marijnh/CodeMirror2 mirror
	@cp -rf mirror/LICENSE .
	@cp -rf mirror/README.md .
	@echo "Compressing js files..."
	@JSFILE=codemirror$(DATE).js;  \
	cat mirror/lib/codemirror.js | $(JSMIN) > $$JSFILE;  \
	cat mirror/lib/util/*.js | $(JSMIN) >> $$JSFILE;  \
	cat mirror/mode/*/*.js | $(JSMIN) >> $$JSFILE;  \
	cat mirror/mode/rpm/*/*.js | $(JSMIN) >> $$JSFILE;  \
	cat mirror/keymap/*.js | $(JSMIN) >> $$JSFILE
	@echo "Compressing css files..."
	@CSSFILE=codemirror$(DATE).css;  \
	cat mirror/lib/*.css | $(CSSMIN) > $$CSSFILE;  \
	cat mirror/lib/util/*.css | $(CSSMIN) >> $$CSSFILE;  \
	cat mirror/theme/*.css | $(CSSMIN) >> $$CSSFILE; \
	cat mirror/mode/*/*.css | $(CSSMIN) >> $$CSSFILE; \
	cat mirror/mode/*/*/*.css | $(CSSMIN) >> $$CSSFILE
	@rm -rf mirror
	@echo
	@echo "Don't forget to update types and paths!"

types:
	@cat codemirror$(DATE).js | grep -oE "(text|application)/[a-zA-Z0-9\+\-]+"  \
	     | sed "s,text/plain,,"  | grep -E .\+ | sort | uniq  \
	     | sed "s/.*/addType('&', [fromName['text\/plain']]);/"

.PHONY: update types
