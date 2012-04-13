# Local Makefile to adapt ScoutCamp to TheFileTree
# Copyright © 2011 Jan Keromnes, Thaddee Tyl. All rights reserved.
# Code covered by the LGPL license. 

tree: stop run

run:
	@echo "run"
	@if [ `id -u` -ne "0" -a $(PORT) -lt 1024 ] ;  \
	then  \
	  sudo node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 ;  \
	else  \
	  node $(SERVER) $(PORT) $(SECURE) $(DEBUG) >> $(LOG) 2>&1 ;  \
	fi
