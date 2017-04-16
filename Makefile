# Makefile: start/stop and manage your tree server.
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# The following code is covered by the GPLv2 license.

# The output of console.log statements goes in this file when you `make`.
LOG = tree.log

# The name of your main server file.
SERVER = app.js

# The pid of the process (stored in a file).
PID = .pid

# The current date in ISO8601 format.
DATE = $$(date "+%Y%m%dT%H%M%S%z")

ifdef SECURE
  PORT ?= 443
  SECURE = yes
else
  PORT ?= 80
  SECURE = no
endif
DEBUG ?= 0

RUNTREE = '  \
  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 &  \
  if [ $$! -ne "0" ]; then echo $$! > $(PID); fi;  \
  chmod a+w $(PID);'

start: init stop
	@echo "[tree] start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ];  \
	then  \
	  sudo -p '[sudo] password for $(USER): ' echo;  \
	  sudo -n sh -c $(RUNTREE);  \
	  sudo chmod a+w $(LOG);  \
	else  \
	  sh -c $(RUNTREE); \
	fi; \
	echo "[info] tree running on port $(PORT) (see $(LOG))"; \
	echo "[info] use 'make stop' to kill it"

stop:
	@echo "[tree] stop"
	@if [ -e $(PID) ]; then  \
	  ps -p $$(cat $(PID)) >/dev/null 2>&1;  \
	  if [ $$? -eq 0 ]; then  \
	    kill $$(cat $(PID)) 2>/dev/null || sudo kill $$(cat $(PID));  \
	  fi;  \
	  rm $(PID);  \
	fi

restart: stop start

save:
	@if [ -e web/.git ]; then mv web/.git .git-bk; fi
	@cp -r web/* plugs/
	@rm -rf plugs/test/
	@cat metadata.json | jq 'del(.files.test)' > plugs/metadata.json
	@if [ -e .git-bk ]; then mv .git-bk web/.git; fi
	@echo "[info] you may now commit what is in plugs/"

load:
	@# WARNING: This operation overwrites files in web/.
	@if [ ! -e web/ ]; then mkdir web; fi
	@# We must not copy the metadata to web/.
	@mv plugs/metadata.json .
	@cp -rf plugs/* web/
	@# FIXME: Override existing paths, but don't delete paths.
	@cp metadata.json plugs
	@echo "[info] deployed web/ and metadata from plugs/"

backup:
	@mkdir web$(DATE)
	@cp -r web/* web$(DATE)/
	@cp -r metadata.json web$(DATE)/
	@echo "[info] copied web/ and metadata to new backup web$(DATE)/"

# When files move around in web/, some dead metadata entries stay in metadata.
# They need to be garbage collected from time to time.
gc:
	node ./tools/meta/rebuild

test:
	node lib/test.js

# List all first-launch dependencies here
init: web/ node_modules/

web/: load

plugs/:
	@echo "[init] obtaining plugs"
	@git clone http://github.com/garden/plugs

node_modules/:
	@echo "[init] npm dependencies"
	@npm install

update-camp:
	npm update camp

update-ot:
	npm update ot
	curl 'https://raw.githubusercontent.com/Operational-Transformation/ot.js/master/dist/ot-min.js' > web/lib/js/ot-min.js
	curl 'https://raw.githubusercontent.com/Operational-Transformation/ot.js/master/dist/ot.js' > web/lib/js/ot.js

https.key:
	@echo "[https] generating KEY"
	@openssl genrsa -aes256 -out https.key 1024

https.csr: https.key
	@echo "[https] generating CSR"
	@openssl req -new -key https.key -out https.csr

https.crt: https.key https.csr
	@echo "[https] generating CRT"
	@openssl x509 -req -days 365 -in https.csr -signkey https.key -out https.crt

rmhttps:
	@echo "[https] deleting https credentials"
	@rm -rf https.key https.csr https.crt

https: https.crt
	@echo "[info] you can now use https.key, https.csr, https.crt"

jail:
	@echo "[jail] Constructing the program jail."
	cd jail && sudo docker build -t tree-jail .

help:
	@cat Makefile | less

wtf ?: help

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: start stop restart save load backup gc test init update-camp update-ot rmhttps https jail help wtf ? coffee me a sandwich

