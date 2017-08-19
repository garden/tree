# Makefile: start/stop and manage your tree server.
# Copyright © 2017 Thaddee Tyl, Jan Keromnes. All rights reserved.
# The following code is covered by the GPLv2 license.

# The environment: while working on tree, "dev". In a live server, "prod".
ENV ?= dev
ifneq ('$(ENV)', 'prod')
  PORT ?= 1234
endif

# The output of console.log statements goes in this file when you `make`.
LOG = tree.log

# The pid of the process (stored in a file).
PID = .pid

# The current date in ISO8601 format.
DATE = $(shell date "+%Y%m%dT%H%M%S%z")

ifdef SECURE
  PORT ?= 443
  SECURE = yes
else
  PORT ?= 80
  SECURE = no
endif
DEBUG ?= 0

RUNTREE = '  \
  ENV=$(ENV) node app.js $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 &  \
  if [ $$! -ne "0" ]; then echo $$! > $(PID); fi;  \
  chmod a+w $(PID);'

start: install stop
	@echo "[tree] start $(ENV)"
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
	@echo "[tree] stop $(ENV)"
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
	@mv plugs/metadata.json plug-metadata.json
	@cp -rf plugs/* web/
	@jq -s '.[0] * .[1]' metadata.json plug-metadata.json >new-metadata.json
	@mv new-metadata.json metadata.json
	@mv plug-metadata.json plugs/metadata.json
	@echo "[info] deployed web/ and metadata from plugs/"

backup:
	@mkdir -p backup
	@tar cf backup/web$(DATE).tar web
	@tar --append -f backup/web$(DATE).tar metadata.json
	@xz <backup/web$(DATE).tar >backup/web$(DATE).tar.xz
	@rm backup/web$(DATE).tar
	@echo "[info] copied web/ and metadata to backup/web$(DATE).tar.xz"

# When files move around in web/, some dead metadata entries stay in metadata.
# They need to be garbage collected from time to time.
gc:
	node ./tools/meta/rebuild

test:
	node lib/test.js

# We assume the existence of GNU coreutils, node, npm, and git.
install: install-bin web/ node_modules/

install-bin: 
	@ENV=$(ENV) bash admin/setup/install.sh

web/: plugs/
	@if [ ! -e web/ ]; then \
		echo "[install] extracting web"; \
		make load; \
	fi

plugs/:
	@echo "[install] obtaining plugs"
	@git clone http://github.com/garden/plugs

node_modules/:
	@echo "[install] npm dependencies"
	@npm install

uninstall:
	@bash admin/setup/uninstall.sh

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

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: install install-bin uninstall start stop restart save load backup gc test update-camp update-ot rmhttps https jail help me a sandwich

