# Makefile: Publish your website and start/stop your server.
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# Code covered by the LGPL license. 

# The JS minifier. Change the order to your convenience.
# Note: you must create google-closure.sh yourself if you want it.
# It must have some JS in stdin, and must produce the result on stdout.
JSMIN = uglifyjs jsmin google-closure.sh

# The output of console.log statements goes in this file when you `make`.
# Note: when you `make debug`, the output appears on the console.
LOG = node.log

# The name you gave your main server file.
SERVER = server.js

# The folder where your precious website is.
WEB = web

# The folder where your minified, production-ready website will be.
# Warning: `make` and `make clean` will delete this folder.
PUBLISH = publish

MIN = min

ifdef SECURE
  PORT ?= 443
  SECURE = yes
else
  PORT ?= 80
  SECURE = no
endif
DEBUG ?= 0

# Define custom rules and settings in this file.
-include local.mk

all: publish stop start

publish: clean copy minify

debug: stop startweb

clean:
	@echo "clean"
	@rm -rf $(LOG) $(PUBLISH)

copy:
	@echo "copy"
	@cp -rf $(WEB) $(PUBLISH)

minify:
	@echo "minify"
	@for ajsmin in $(JSMIN); do  \
	  if which $$ajsmin > /dev/null; then chosenjsmin=$$ajsmin; break; fi;  \
	done;  \
	if which $$chosenjsmin > /dev/null ; then  \
	  for file in `find $(PUBLISH) -name '*\.js'`; do  \
	    $$chosenjsmin < "$${file}" > "$${file}$(MIN)";  \
	    mv "$${file}$(MIN)" "$${file}";  \
	  done;  \
	else  \
	  echo ' `sudo make jsmin` or install uglifyjs for minification.';  \
	fi

stop:
	@echo "stop"
	@for pid in `ps aux | grep -v make | grep node | grep $(SERVER) | awk '{print $$2}'` ; do  \
	   kill -9 $$pid 2> /dev/null ;  \
	   if [ "$$?" -ne "0" ] ; then  \
	     sudo kill -9 $$pid 2> /dev/null ;  \
	   fi  \
	done;  \

start:
	@echo "start"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  cd $(PUBLISH) ; sudo node ../$(SERVER) $(PORT) $(SECURE) $(DEBUG) > ../$(LOG) ;  \
	else  \
	  cd $(PUBLISH) ; node ../$(SERVER) $(PORT) $(SECURE) $(DEBUG) > ../$(LOG) ;  \
	fi

startweb:
	@echo "start web"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  cd $(WEB) ; sudo node ../$(SERVER) $(PORT) $(SECURE) $(DEBUG) > ../$(LOG) ;  \
	else  \
	  cd $(WEB) ; node ../$(SERVER) $(PORT) $(SECURE) $(DEBUG) > ../$(LOG) ;  \
	fi

test:
	node test/test-plate.js

update:
	@git clone https://github.com/espadrine/ScoutCamp.git
	@cp ScoutCamp/web/js/scout.js ./web/js/scout.js
	@cp ScoutCamp/camp/* ./camp/
	@cp ScoutCamp/Makefile .
	@rm -rf ScoutCamp/

jsmin:
	@if [ `id -u` = "0" ] ;  \
	  then  wget "http://crockford.com/javascript/jsmin.c" && gcc -o /usr/bin/jsmin jsmin.c ;  \
	        rm -rf jsmin.c ;  \
	  else echo ' `sudo make jsmin`'; fi

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

wtf: help

?: wtf

coffee:
	@echo "\n           )      (\n           (  )   )\n         _..,-(--,.._\n      .-;'-.,____,.-';\n     (( |            |\n      \`-;            ;\n         \\          /	\n      .-''\`-.____.-'''-.\n     (     '------'     )\n      \`--..________..--'\n";

me:
	@echo -n ""

a:
	@ls > /dev/null

sandwich:
	@if [ `id -u` = "0" ] ; then echo "OKAY." ; else echo "What? Make it yourself." ; fi

.PHONY: all publish debug clean copy minify stop start startweb test update jsmin https help wtf ? coffee me a sandwich

