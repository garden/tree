# Makefile: Publish your website and start/stop your server.
# Copyright (c) 2011 Jan Keromnes, Yann Tyl. All rights reserved.
# Code covered by the LGPL license.

LOG = node.log
SERVER = server.js
TARGET = publish
JSMIN = jsmin
MIN = min
WEB = web

all: clean deploy minify stop start

nodeploy: stop startweb

startweb:
	@echo "start web"
	@cd $(WEB) ; sudo node ../$(SERVER) > ../$(LOG)

clean:
	@echo "clean"
	@rm -rf $(TARGET)/* $(LOG)

deploy:
	@echo "deploy"
	@cp -r $(WEB)/* $(TARGET)
  
minify:
	@echo "minify"
	@for file in `find $(TARGET) -name '*\.js'` ; do cat "$${file}" | $(JSMIN) > "$${file}$(MIN)" ; mv "$${file}$(MIN)" "$${file}" ; done

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
	@mv ScoutCamp/lib/* ./lib/
	@rm -rf ScoutCamp/

help:
	@cat Makefile
	
?: help

wtf: help

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

sandwich:
	@if [ `id -u` = "0" ] ; then echo "\nOKAY." ; else echo "\nWhat? Make it yourself." ; fi

.PHONY: all nodeploy startweb clean deploy minify start stop test help wtf ? coffee sandwich
