# Makefile: Publish your website and start/stop your server.
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# Code covered by the LGPL license.

# The output of console.log statements goes in this file when you `make`.
# Note: when you `make debug`, the output appears on the console.
LOG = node.log

# The name you gave your main server file.
SERVER = app.js

# The folder where your awesome website is.
WEB = web

ifdef SECURE
  PORT ?= 443
  SECURE = yes
else
  PORT ?= 80
  SECURE = no
endif
DEBUG ?= 0

start: stop web/ node_modules/bcrypt/
	@echo "start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  sudo node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 ;  \
	else  \
	  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 ;  \
	fi

stop:
	@echo "stop"
	@for pid in `ps aux | grep -v make | grep node | grep $(SERVER) | awk '{print $$2}'` ; do  \
	   kill -9 $$pid 2> /dev/null ;  \
	   if [ "$$?" -ne "0" ] ; then  \
	     sudo kill -9 $$pid 2> /dev/null ;  \
	   fi  \
	done;  \

clean:
	@echo "clean"
	@rm -rf $(LOG)

init: clean web/ node_modules/bcrypt/

web/:
	@git clone http://github.com/garden/plugs
	@if [ -e web ]; then rm -r web; fi  # Otherwise cp -r would behave wrong.
	@if [ -e meta ]; then rm -r meta; fi
	@cp -r plugs web
	@mv web/meta .
	@rm -rf web/.git

plugs:
	@# This operation is destructive in web.
	@cp -rf plugs/* web/
	@rm -rf web/meta/

snapshot:
	@if [ -e web/.git ]; then mv -rf web/.git .git-bk; fi
	@cp -r web/* plugs
	@cp -r meta plugs/
	@if [ -e .git-bk ]; then mv -r .git-bk web/.git; fi
	@echo 'You may now commit what is in plugs/.'

node_modules/bcrypt/:
	@npm install bcrypt

test:
	node lib/test.js

# We mustn't update everything simultaneously – or else debugging
# whatever might break with the update becomes painful.
update:
	@npm update

update-camp:
	@npm update camp

update-ot:
	@npm update operational-transformation

https.key:
	@openssl genrsa -aes256 -out https.key 1024

https.csr: https.key
	@openssl req -new -key https.key -out https.csr

https.crt: https.key https.csr
	@openssl x509 -req -days 365 -in https.csr -signkey https.key -out https.crt

rmhttps:
	@echo "delete https credentials"
	@rm -rf https.key https.csr https.crt

https: https.crt

help:
	@cat Makefile | less

wtf ?: help

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me a:
	@cd .

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: restart stop start clean snapshot plugs test update update-camp update-ot https https.key https.csr https.crt help wtf ? coffee me a sandwich

