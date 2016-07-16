FROM ubuntu:14.04
MAINTAINER Thaddée Tyl <thaddee.tyl@gmail.com>

RUN apt-get -y update
RUN apt-get install -y build-essential wget curl libedit-dev g++ clang make \
  patch binutils-gold python ruby sbcl openjdk-7-jdk mono-complete llvm clang \
  golang scala texlive-full libicu-dev rsync libxml2 git
RUN mkdir /home/node-js && cd /home/node-js && \
  wget -Nq http://nodejs.org/dist/node-latest.tar.gz && \
  tar xzf node-latest.tar.gz && cd node-v* && ./configure && make && \
  make install && rm -rf /home/node-js
RUN curl -sSf https://static.rust-lang.org/rustup.sh | sh

ENV SWIFT_BRANCH development
ENV SWIFT_VERSION DEVELOPMENT-SNAPSHOT-2016-05-03-a
ENV SWIFT_PLATFORM ubuntu14.04
# Install Swift keys
RUN wget -q -O - https://swift.org/keys/all-keys.asc | gpg --import - && \
  gpg --keyserver hkp://pool.sks-keyservers.net --refresh-keys Swift
# Install Swift Ubuntu 14.04 Snapshot
RUN SWIFT_ARCHIVE_NAME=swift-$SWIFT_VERSION-$SWIFT_PLATFORM && \
  SWIFT_URL=https://swift.org/builds/$SWIFT_BRANCH/$(echo "$SWIFT_PLATFORM" | tr -d .)/swift-$SWIFT_VERSION/$SWIFT_ARCHIVE_NAME.tar.gz && \
  wget $SWIFT_URL && \
  wget $SWIFT_URL.sig && \
  gpg --verify $SWIFT_ARCHIVE_NAME.tar.gz.sig && \
  tar -xvzf $SWIFT_ARCHIVE_NAME.tar.gz --directory / --strip-components=1 && \
  rm -rf $SWIFT_ARCHIVE_NAME* /tmp/* /var/tmp/*
# Set Swift Path
ENV PATH /usr/bin:$PATH

RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
RUN useradd --create-home --user-group --key UMASK=022 myself
