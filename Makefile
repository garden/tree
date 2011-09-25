# Makefile: Publish your website and start/stop your server.
# Copyright (c) 2011 Jan Keromnes, Yann Tyl. All rights reserved.
# Code covered by the LGPL license.

# Please change those settings to your preferred choice.

# The JS minifier. Change the order to your convenience.
# Note: you must create google-closure.sh yourself if you want it.
# It must have some JS in stdin, and must produce the result on stdout.
JSMIN = uglifyjs jsmin google-closure.sh

# The output of console.log statements goes in this file when you `make`.
# Note: when you `make nodeploy`, the output appears on the console.
LOG = node.log

# The name you gave your main server file.
SERVER = server.js

# The folders where your minified, production-ready code rests.
TARGET = publish

# This is no longer the settings section.

MIN = min
WEB = web

all: clean deploy minify stop start

nodeploy: stop startweb

startweb:
	@echo "start web"
	@cd $(WEB) ; sudo node ../$(SERVER) > ../$(LOG)

clean:
	@echo "clean"
	@rm -rf $(TARGET) $(LOG)

deploy:
	@echo "deploy"
	@if [ ! -d $(TARGET) ]; then mkdir $(TARGET); fi
	@cp -r $(WEB)/* $(TARGET)
  
minify:
	@echo "minify"
	@for ajsmin in $(JSMIN); do  \
	  if which $$ajsmin > /dev/null; then chosenjsmin=$$ajsmin; break; fi;  \
	done;  \
	if [ "$$chosenjsmin" == "" ]; then  \
	echo " Please install uglifyjs [https://github.com/mishoo/UglifyJS/] for minification.";  \
	else  \
	  for file in `find $(TARGET) -name '*\.js'`; do  \
	    $$chosenjsmin < "$${file}" > "$${file}$(MIN)";  \
	    mv "$${file}$(MIN)" "$${file}";  \
	  done;  \
	fi

start:
	@echo "start"
	@cd $(TARGET) ; sudo node ../$(SERVER) > ../$(LOG)

stop:
	@echo "stop"
	@for pid in `ps aux | grep -v make | grep node | grep $(SERVER) | awk '{print $$2}'` ; do sudo kill -9 $$pid 2> /dev/null ; done;
	
test:
	node test/test-plate.js

update:
	@git clone git://github.com/espadrine/ScoutCamp.git
	@cp ScoutCamp/lib/* ./lib/
	@cp ScoutCamp/Makefile .
	@cp ScoutCamp/web/js/scout.js ./web/js/scout.js
	@rm -rf ScoutCamp/

help:
	@cat Makefile | less
	
?: help

wtf: help

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

sandwich:
	@if [ `id -u` = "0" ] ; then echo "\nOKAY." ; else echo "\nWhat? Make it yourself." ; fi

.PHONY: all nodeploy startweb clean deploy minify start stop test update help wtf ? coffee sandwich
