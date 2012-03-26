JSMIN = uglifyjs
CSSMIN = cat

update:
	@git clone http://github.com/marijnh/CodeMirror2 mirror
	@cp -rf mirror/LICENSE .
	@cp -rf mirror/README.md .
	@echo "Compressing js files..."
	@JSFILE=codemirror$$(date "+%Y-%m-%d").js;  \
	cat mirror/lib/codemirror.js | $(JSMIN) >> $$JSFILE;  \
	cat mirror/lib/util/*.js | $(JSMIN) >> $$JSFILE;  \
	cat mirror/mode/*/*.js | $(JSMIN) >> $$JSFILE;  \
	cat mirror/keymap/*.js | $(JSMIN) >> $$JSFILE
	@echo "Compressing css files..."
	@CSSFILE=codemirror$$(date "+%Y-%m-%d").css;  \
	cat mirror/lib/*.css | $(CSSMIN) >> $$CSSFILE;  \
	cat mirror/lib/util/*.css | $(CSSMIN) >> $$CSSFILE;  \
	cat mirror/theme/*.css | $(CSSMIN) >> $$CSSFILE
	@rm -rf mirror
	@echo
	@echo "Don't forget to update types and paths!"

types:
	@cat codemirror*.js | grep -oE "text/[a-zA-Z0-9\+\-]+" | sed "s,text/plain,,"  \
	                    | grep -E .\+ | sort | uniq  \
	                    | sed "s/.*/addType('&', [fromName['text\/plain']]);/"

.PHONY: update types
